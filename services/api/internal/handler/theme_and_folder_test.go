package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

func TestSingleThemeNoThemeInMe(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Get("/api/v1/auth/me", authH.Me)

	// Create user & company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Single Theme Co",
		Slug: fmt.Sprintf("single-theme-co-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("single-theme-%d@example.com", time.Now().UnixNano()),
		Name:  "Single Theme User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    user.ID,
		Role:      "editor",
	})
	if err != nil {
		t.Fatalf("create membership: %v", err)
	}

	person := authz.Person{
		UserID:      uuid.UUID(user.ID.Bytes),
		Email:       user.Email,
		Role:        "Editor",
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{},
	}

	// 1. Verify Me returns user profile without any theme field
	reqMe := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	reqMe = reqMe.WithContext(contextWithPerson(reqMe.Context(), user, comp.ID, person))
	recMe := httptest.NewRecorder()
	r.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusOK {
		t.Fatalf("expected 200 from Me, got %d: %s", recMe.Code, recMe.Body.String())
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(recMe.Body.Bytes(), &rawMap); err != nil {
		t.Fatalf("unmarshal me response: %v", err)
	}
	userMap, ok := rawMap["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("user object not found in Me response")
	}
	if _, hasTheme := userMap["theme"]; hasTheme {
		t.Errorf("expected no 'theme' field in Me response user object, but found: %v", userMap["theme"])
	}

	// 2. Verify /api/v1/users/theme does not exist (returns 404 on router)
	reqBadRoute := httptest.NewRequest("PATCH", "/api/v1/users/theme", bytes.NewReader([]byte(`{"theme":"purple"}`)))
	recBadRoute := httptest.NewRecorder()
	r.ServeHTTP(recBadRoute, reqBadRoute)
	if recBadRoute.Code != http.StatusNotFound {
		t.Errorf("expected 404 for removed theme route, got %d", recBadRoute.Code)
	}
}

func TestFolderSizeBugZeroFilesZeroBytes(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Folder Bug Co",
		Slug: fmt.Sprintf("folder-bug-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("folder-user-%d@example.com", time.Now().UnixNano()),
		Name:  "Folder User",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	// 1. Create a root folder (like Images in My Drive)
	rootFolder, err := queries.CreateDriveFolder(ctx, db.CreateDriveFolderParams{
		CompanyID:       comp.ID,
		ParentID:        pgtype.UUID{Valid: false},
		Name:            "Images",
		Position:        pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy:       user.ID,
		IsDefaultFolder: true,
		Category:        pgtype.Text{String: "images", Valid: true},
	})
	if err != nil {
		t.Fatalf("create root folder: %v", err)
	}

	// Verify empty folder: must report 0 files and 0 bytes
	stats, err := queries.GetDriveFolderStats(ctx, db.GetDriveFolderStatsParams{
		CompanyID: comp.ID,
		ParentID:  rootFolder.ID,
	})
	if err != nil {
		t.Fatalf("get empty folder stats: %v", err)
	}
	if stats.FileCount != 0 {
		t.Errorf("expected 0 files for empty folder, got %d", stats.FileCount)
	}
	if stats.TotalBytes != 0 {
		t.Errorf("expected 0 bytes for empty folder, got %d", stats.TotalBytes)
	}

	// 2. Add a subfolder inside root folder
	subFolder, err := queries.CreateDriveFolder(ctx, db.CreateDriveFolderParams{
		CompanyID:       comp.ID,
		ParentID:        rootFolder.ID,
		Name:            "Photos",
		Position:        pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy:       user.ID,
		IsDefaultFolder: false,
	})
	if err != nil {
		t.Fatalf("create subfolder: %v", err)
	}

	// Empty subfolder should still result in 0 files and 0 bytes on root folder
	statsSub, err := queries.GetDriveFolderStats(ctx, db.GetDriveFolderStatsParams{
		CompanyID: comp.ID,
		ParentID:  rootFolder.ID,
	})
	if err != nil {
		t.Fatalf("get stats with empty subfolder: %v", err)
	}
	if statsSub.FileCount != 0 {
		t.Errorf("expected 0 files with empty subfolder, got %d", statsSub.FileCount)
	}
	if statsSub.TotalBytes != 0 {
		t.Errorf("expected 0 bytes with empty subfolder, got %d", statsSub.TotalBytes)
	}

	// 3. Add a file inside the subfolder
	var fileItemID pgtype.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO items (company_id, parent_id, kind, name, created_by, total_bytes)
		VALUES ($1, $2, 'file', 'photo.jpg', $3, 10240)
		RETURNING id
	`, comp.ID, subFolder.ID, user.ID).Scan(&fileItemID)
	if err != nil {
		t.Fatalf("insert file item: %v", err)
	}

	// Create file version with 10240 bytes
	_, err = pool.Exec(ctx, `
		INSERT INTO file_versions (company_id, item_id, number, storage_key, size_bytes, mime, uploaded_by)
		VALUES ($1, $2, 1, 'keys/photo.jpg', 10240, 'image/jpeg', $3)
	`, comp.ID, fileItemID, user.ID)
	if err != nil {
		t.Fatalf("insert file version: %v", err)
	}

	// Now root folder must recursively report 1 file and 10240 bytes
	statsActive, err := queries.GetDriveFolderStats(ctx, db.GetDriveFolderStatsParams{
		CompanyID: comp.ID,
		ParentID:  rootFolder.ID,
	})
	if err != nil {
		t.Fatalf("get stats with active file: %v", err)
	}
	if statsActive.FileCount != 1 {
		t.Errorf("expected 1 file, got %d", statsActive.FileCount)
	}
	if statsActive.TotalBytes != 10240 {
		t.Errorf("expected 10240 bytes, got %d", statsActive.TotalBytes)
	}

	// 4. Move the file to Trash (deleted_at IS NOT NULL)
	_, err = pool.Exec(ctx, `UPDATE items SET deleted_at = NOW() WHERE id = $1`, fileItemID)
	if err != nil {
		t.Fatalf("soft delete file: %v", err)
	}

	// Once the file is in Trash, root folder must IMMEDIATELY report 0 files and 0 bytes!
	statsTrash, err := queries.GetDriveFolderStats(ctx, db.GetDriveFolderStatsParams{
		CompanyID: comp.ID,
		ParentID:  rootFolder.ID,
	})
	if err != nil {
		t.Fatalf("get stats after trash: %v", err)
	}
	if statsTrash.FileCount != 0 {
		t.Errorf("expected 0 files after file moved to trash, got %d", statsTrash.FileCount)
	}
	if statsTrash.TotalBytes != 0 {
		t.Errorf("expected 0 bytes after file moved to trash, got %d", statsTrash.TotalBytes)
	}
}
