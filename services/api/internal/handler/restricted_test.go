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
	"github.com/playhead/playhead/services/shared/plans"
)

func TestRestrictedProjectsAndFolders(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	projectH := NewProjectHandler(queries)
	itemsH := NewItemsHandler(queries, nil)

	// 1. Create company, admin user, and member user
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Restricted Studio",
		Slug:              fmt.Sprintf("restr-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@studio.com", time.Now().UnixNano()),
		Name:  "Admin User",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})

	memberUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("member-%d@studio.com", time.Now().UnixNano()),
		Name:  "Member User",
	})
	if err != nil {
		t.Fatalf("failed to create member: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    memberUser.ID,
		Role:      authz.RoleMember,
	})

	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Top Secret Client",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	// Link member as client contact
	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     client.ID,
		Name:         memberUser.Name,
		Email:        memberUser.Email,
		DefaultLevel: authz.LevelFull,
		CanDownload:  true,
	})
	if err != nil {
		t.Fatalf("failed to create client contact: %v", err)
	}

	// 2. Admin creates a project
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Confidential Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	projIDStr := pgUUIDToString(proj.ID)

	r := chi.NewRouter()
	r.Get("/api/v1/projects", projectH.List)
	r.Get("/api/v1/projects/{id}", projectH.Get)
	r.Patch("/api/v1/projects/{id}", projectH.Update)
	r.Get("/api/v1/projects/{id}/items", itemsH.ListItems)
	r.Get("/api/v1/projects/{id}/folders/tree", itemsH.ListFoldersTree)
	r.Post("/api/v1/projects/{id}/folders", itemsH.CreateFolder)
	r.Patch("/api/v1/items/{id}", itemsH.RenameItem)

	// Before restriction: Member can see the project in list and details
	reqMemberGet := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqMemberGet = reqMemberGet.WithContext(contextWithAuth(reqMemberGet.Context(), memberUser, comp.ID, authz.RoleMember))
	recMemberGet := httptest.NewRecorder()
	r.ServeHTTP(recMemberGet, reqMemberGet)
	if recMemberGet.Code != http.StatusOK {
		t.Fatalf("expected 200 for member before restriction, got %d: %s", recMemberGet.Code, recMemberGet.Body.String())
	}

	// 3. Admin marks project restricted
	isRestrictedTrue := true
	updateBody, _ := json.Marshal(UpdateProjectRequest{
		IsRestricted: &isRestrictedTrue,
	})
	reqAdminUpdate := httptest.NewRequest("PATCH", "/api/v1/projects/"+projIDStr, bytes.NewReader(updateBody))
	reqAdminUpdate = reqAdminUpdate.WithContext(contextWithAuth(reqAdminUpdate.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recAdminUpdate := httptest.NewRecorder()
	r.ServeHTTP(recAdminUpdate, reqAdminUpdate)
	if recAdminUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 for admin setting restricted, got %d: %s", recAdminUpdate.Code, recAdminUpdate.Body.String())
	}

	// 4. Verification: Member now gets 404 (does not exist for them)
	reqMemberGet2 := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqMemberGet2 = reqMemberGet2.WithContext(contextWithAuth(reqMemberGet2.Context(), memberUser, comp.ID, authz.RoleMember))
	recMemberGet2 := httptest.NewRecorder()
	r.ServeHTTP(recMemberGet2, reqMemberGet2)
	if recMemberGet2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for member on restricted project, got %d: %s", recMemberGet2.Code, recMemberGet2.Body.String())
	}

	// Also omitted from ListProjectsForUserWithAccess
	reqMemberList := httptest.NewRequest("GET", "/api/v1/projects", nil)
	reqMemberList = reqMemberList.WithContext(contextWithAuth(reqMemberList.Context(), memberUser, comp.ID, authz.RoleMember))
	recMemberList := httptest.NewRecorder()
	r.ServeHTTP(recMemberList, reqMemberList)
	if recMemberList.Code != http.StatusOK {
		t.Fatalf("expected 200 for member list projects, got %d", recMemberList.Code)
	}
	var listResp struct {
		Projects []struct {
			ID string `json:"id"`
		} `json:"projects"`
	}
	_ = json.NewDecoder(recMemberList.Body).Decode(&listResp)
	for _, p := range listResp.Projects {
		if p.ID == projIDStr {
			t.Fatalf("restricted project should NOT appear in member's project list")
		}
	}

	// Admin still gets 200 OK
	reqAdminGet := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqAdminGet = reqAdminGet.WithContext(contextWithAuth(reqAdminGet.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recAdminGet := httptest.NewRecorder()
	r.ServeHTTP(recAdminGet, reqAdminGet)
	if recAdminGet.Code != http.StatusOK {
		t.Fatalf("expected 200 for admin on restricted project, got %d", recAdminGet.Code)
	}

	// 5. Explicit grant added for Member on restricted project
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       authz.NormalizeEmail(memberUser.Email),
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create explicit grant: %v", err)
	}

	// Now Member gets 200 OK
	reqMemberGet3 := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqMemberGet3 = reqMemberGet3.WithContext(contextWithAuth(reqMemberGet3.Context(), memberUser, comp.ID, authz.RoleMember))
	recMemberGet3 := httptest.NewRecorder()
	r.ServeHTTP(recMemberGet3, reqMemberGet3)
	if recMemberGet3.Code != http.StatusOK {
		t.Fatalf("expected 200 for member after explicit grant on restricted project, got %d: %s", recMemberGet3.Code, recMemberGet3.Body.String())
	}

	// 6. Test Folder Restriction
	// Create a folder inside project
	folder, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Restricted Inner Folder",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}
	folderIDStr := pgUUIDToString(folder.ID)

	// Admin sets folder to restricted
	folderRestrictedBody, _ := json.Marshal(updateItemReq{
		IsRestricted: &isRestrictedTrue,
	})
	reqAdminFolderRestr := httptest.NewRequest("PATCH", "/api/v1/items/"+folderIDStr, bytes.NewReader(folderRestrictedBody))
	reqAdminFolderRestr = reqAdminFolderRestr.WithContext(contextWithAuth(reqAdminFolderRestr.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recAdminFolderRestr := httptest.NewRecorder()
	r.ServeHTTP(recAdminFolderRestr, reqAdminFolderRestr)
	if recAdminFolderRestr.Code != http.StatusOK {
		t.Fatalf("expected 200 setting folder restricted, got %d: %s", recAdminFolderRestr.Code, recAdminFolderRestr.Body.String())
	}

	// Create a third user (Editor) who has project-level grant but NO folder-level grant
	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@studio.com", time.Now().UnixNano()),
		Name:  "Editor User",
	})
	if err != nil {
		t.Fatalf("failed to create editor user: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleMember,
	})
	_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       authz.NormalizeEmail(editorUser.Email),
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})

	// Editor accesses folder root: folder is restricted, so attempting to view inside returns 404
	reqEditorFolderGet := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items?parent_id="+folderIDStr, nil)
	reqEditorFolderGet = reqEditorFolderGet.WithContext(contextWithAuth(reqEditorFolderGet.Context(), editorUser, comp.ID, authz.RoleMember))
	recEditorFolderGet := httptest.NewRecorder()
	r.ServeHTTP(recEditorFolderGet, reqEditorFolderGet)
	if recEditorFolderGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for editor entering restricted folder without explicit grant, got %d: %s", recEditorFolderGet.Code, recEditorFolderGet.Body.String())
	}

	// In project root listing, restricted folder does not appear for editor
	reqEditorRootItems := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items", nil)
	reqEditorRootItems = reqEditorRootItems.WithContext(contextWithAuth(reqEditorRootItems.Context(), editorUser, comp.ID, authz.RoleMember))
	recEditorRootItems := httptest.NewRecorder()
	r.ServeHTTP(recEditorRootItems, reqEditorRootItems)
	if recEditorRootItems.Code != http.StatusOK {
		t.Fatalf("expected 200 for editor listing root items, got %d", recEditorRootItems.Code)
	}
	var rootItemsResp struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}
	_ = json.NewDecoder(recEditorRootItems.Body).Decode(&rootItemsResp)
	for _, it := range rootItemsResp.Items {
		if it.ID == folderIDStr {
			t.Fatalf("restricted folder should not appear in root items for editor without explicit grant")
		}
	}

	// Grant editor explicit access to the restricted folder
	fUUID, _ := uuid.Parse(folderIDStr)
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "item",
		TargetID:    pgtype.UUID{Bytes: fUUID, Valid: true},
		Email:       authz.NormalizeEmail(editorUser.Email),
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to grant explicit access to folder: %v", err)
	}

	// Editor can now access inside the restricted folder
	reqEditorFolderGet2 := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items?parent_id="+folderIDStr, nil)
	reqEditorFolderGet2 = reqEditorFolderGet2.WithContext(contextWithAuth(reqEditorFolderGet2.Context(), editorUser, comp.ID, authz.RoleMember))
	recEditorFolderGet2 := httptest.NewRecorder()
	r.ServeHTTP(recEditorFolderGet2, reqEditorFolderGet2)
	if recEditorFolderGet2.Code != http.StatusOK {
		t.Fatalf("expected 200 for editor after explicit grant on restricted folder, got %d: %s", recEditorFolderGet2.Code, recEditorFolderGet2.Body.String())
	}
}
