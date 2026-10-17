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

func TestThemeUpdateAndValidation(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Patch("/api/v1/users/theme", authH.UpdateTheme)
	r.Get("/api/v1/auth/me", authH.Me)

	// Create user & company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Theme Test Co",
		Slug: fmt.Sprintf("theme-co-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	user, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("theme-user-%d@example.com", time.Now().UnixNano()),
		Name:  "Theme User",
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

	// 1. Verify default theme in Me is "blue"
	reqMe := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	reqMe = reqMe.WithContext(contextWithPerson(reqMe.Context(), user, comp.ID, person))
	recMe := httptest.NewRecorder()
	r.ServeHTTP(recMe, reqMe)

	if recMe.Code != http.StatusOK {
		t.Fatalf("expected 200 from Me, got %d: %s", recMe.Code, recMe.Body.String())
	}
	var meResp struct {
		User struct {
			Theme string `json:"theme"`
		} `json:"user"`
	}
	if err := json.Unmarshal(recMe.Body.Bytes(), &meResp); err != nil {
		t.Fatalf("unmarshal me response: %v", err)
	}
	if meResp.User.Theme != "blue" {
		t.Errorf("expected default theme to be 'blue', got '%s'", meResp.User.Theme)
	}

	// 2. Reject invalid theme
	badBody, _ := json.Marshal(map[string]string{"theme": "neon-crimson"})
	reqBad := httptest.NewRequest("PATCH", "/api/v1/users/theme", bytes.NewReader(badBody))
	reqBad.Header.Set("Content-Type", "application/json")
	reqBad = reqBad.WithContext(contextWithPerson(reqBad.Context(), user, comp.ID, person))
	recBad := httptest.NewRecorder()
	r.ServeHTTP(recBad, reqBad)

	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid theme, got %d: %s", recBad.Code, recBad.Body.String())
	}

	// 3. Update to valid theme: purple
	for _, validTheme := range []string{"purple", "green", "yellow", "orange", "pink", "blue"} {
		body, _ := json.Marshal(map[string]string{"theme": validTheme})
		reqUpdate := httptest.NewRequest("PATCH", "/api/v1/users/theme", bytes.NewReader(body))
		reqUpdate.Header.Set("Content-Type", "application/json")
		reqUpdate = reqUpdate.WithContext(contextWithPerson(reqUpdate.Context(), user, comp.ID, person))
		recUpdate := httptest.NewRecorder()
		r.ServeHTTP(recUpdate, reqUpdate)

		if recUpdate.Code != http.StatusOK {
			t.Fatalf("expected 200 updating theme to %s, got %d: %s", validTheme, recUpdate.Code, recUpdate.Body.String())
		}

		// Check cookie
		foundCookie := false
		for _, c := range recUpdate.Result().Cookies() {
			if c.Name == "playhead_theme" && c.Value == validTheme {
				foundCookie = true
				break
			}
		}
		if !foundCookie {
			t.Errorf("playhead_theme cookie not found or incorrect for %s", validTheme)
		}

		// Verify in Me endpoint
		reqMeAfter := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
		reqMeAfter = reqMeAfter.WithContext(contextWithPerson(reqMeAfter.Context(), user, comp.ID, person))
		recMeAfter := httptest.NewRecorder()
		r.ServeHTTP(recMeAfter, reqMeAfter)

		var meRespAfter struct {
			User struct {
				Theme string `json:"theme"`
			} `json:"user"`
		}
		_ = json.Unmarshal(recMeAfter.Body.Bytes(), &meRespAfter)
		if meRespAfter.User.Theme != validTheme {
			t.Errorf("expected Me theme to be '%s', got '%s'", validTheme, meRespAfter.User.Theme)
		}
	}
}

func TestClientUserThemeAlwaysBlue(t *testing.T) {
	_, queries, cleanup := setupTestPool(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)

	r := chi.NewRouter()
	r.Get("/api/v1/auth/me", authH.Me)

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Client Theme Test Co",
		Slug: fmt.Sprintf("client-theme-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}

	// Create user with purple theme in database
	clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("client-contact-%d@acme.com", time.Now().UnixNano()),
		Name:  "Acme Client",
	})
	if err != nil {
		t.Fatalf("create client user: %v", err)
	}
	_, _ = queries.UpdateUserTheme(ctx, db.UpdateUserThemeParams{
		ID:    clientUser.ID,
		Theme: "purple",
	})

	// Create client entity and client contact
	clientEntity, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme Corp",
	})
	if err != nil {
		t.Fatalf("create client entity: %v", err)
	}

	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID: comp.ID,
		ClientID:  clientEntity.ID,
		Name:      clientUser.Name,
		Email:     clientUser.Email,
	})
	if err != nil {
		t.Fatalf("create client contact: %v", err)
	}

	clientPerson := authz.Person{
		UserID:      uuid.UUID(clientUser.ID.Bytes),
		Email:       clientUser.Email,
		Role:        "client",
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{},
	}

	req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req = req.WithContext(contextWithPerson(req.Context(), clientUser, comp.ID, clientPerson))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from Me, got %d: %s", rec.Code, rec.Body.String())
	}
	var meResp struct {
		IsClient bool `json:"is_client"`
		User     struct {
			Theme string `json:"theme"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &meResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !meResp.IsClient {
		t.Fatalf("expected is_client to be true")
	}
	if meResp.User.Theme != "blue" {
		t.Fatalf("expected client theme to be strictly 'blue', got '%s'", meResp.User.Theme)
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
