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

// TestRestrictedProjectFolderAndFileAccessOnly verifies that a person given access to only one folder
// or file inside a restricted project can open exactly that folder or file (and what is inside), nothing else.
func TestRestrictedProjectFolderAndFileAccessOnly(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	projectH := NewProjectHandler(queries)
	itemsH := NewItemsHandler(queries, nil)

	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Restricted Gap Studio",
		Slug:              fmt.Sprintf("restr-gap-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-gap-%d@studio.com", time.Now().UnixNano()),
		Name:  "Admin Gap User",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})

	contractor, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("contractor-%d@studio.com", time.Now().UnixNano()),
		Name:  "Contractor Gap User",
	})
	if err != nil {
		t.Fatalf("failed to create contractor: %v", err)
	}
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    contractor.ID,
		Role:      authz.RoleMember,
	})

	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Gap Client",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	// Admin creates a restricted project
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Restricted Secret Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	// Mark project restricted
	_, _ = queries.UpdateProject(ctx, db.UpdateProjectParams{
		CompanyID:    comp.ID,
		ID:           proj.ID,
		IsRestricted: pgtype.Bool{Bool: true, Valid: true},
	})
	projIDStr := pgUUIDToString(proj.ID)

	// Admin creates folder A (which will be granted to contractor)
	folderA, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Folder A (Granted)",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create folder A: %v", err)
	}

	// Admin creates a file inside folder A
	fileInA, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folderA.ID,
		Kind:      "video",
		Name:      "Video_in_A.mp4",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create file in folder A: %v", err)
	}

	// Admin creates folder B (sibling folder - NOT granted to contractor)
	folderB, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Folder B (Secret Sibling)",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(1)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create folder B: %v", err)
	}

	// Admin creates file 1 in folder B
	file1InB, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folderB.ID,
		Kind:      "video",
		Name:      "Video_in_B.mp4",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(0)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create file 1 in folder B: %v", err)
	}

	// Admin creates file 2 in folder B (will be individually granted to contractor)
	file2InB, err := queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folderB.ID,
		Kind:      "video",
		Name:      "Standalone_In_B.mp4",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(1)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create file 2 in folder B: %v", err)
	}

	// Admin creates root file (in project root)
	_, err = queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "video",
		Name:      "Root_File.mp4",
		Position:  pgtype.Numeric{Valid: true, Int: big.NewInt(2)},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create root file: %v", err)
	}

	r := chi.NewRouter()
	r.Get("/api/v1/projects", projectH.List)
	r.Get("/api/v1/projects/{id}", projectH.Get)
	r.Get("/api/v1/projects/{id}/items", itemsH.ListItems)

	// Step 1: Before any grants, contractor cannot view project at all (404)
	reqContractorGet := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqContractorGet = reqContractorGet.WithContext(contextWithAuth(reqContractorGet.Context(), contractor, comp.ID, authz.RoleMember))
	recContractorGet := httptest.NewRecorder()
	r.ServeHTTP(recContractorGet, reqContractorGet)
	if recContractorGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for contractor with no grants, got %d", recContractorGet.Code)
	}

	// Step 2: Grant contractor access to ONLY folder A (no grant on project itself)
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "item",
		TargetID:    folderA.ID,
		Email:       authz.NormalizeEmail(contractor.Email),
		Level:       authz.LevelViewer,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to grant folder A to contractor: %v", err)
	}

	// Step 3: Contractor can now open the project container (GET /api/v1/projects/:id returns 200)
	reqContractorGet2 := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr, nil)
	reqContractorGet2 = reqContractorGet2.WithContext(contextWithAuth(reqContractorGet2.Context(), contractor, comp.ID, authz.RoleMember))
	recContractorGet2 := httptest.NewRecorder()
	r.ServeHTTP(recContractorGet2, reqContractorGet2)
	if recContractorGet2.Code != http.StatusOK {
		t.Fatalf("expected 200 for contractor opening project with folder grant, got %d: %s", recContractorGet2.Code, recContractorGet2.Body.String())
	}

	// Step 4: Contractor CANNOT see root items (GET /api/v1/projects/:id/items returns 404)
	reqContractorRoot := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items", nil)
	reqContractorRoot = reqContractorRoot.WithContext(contextWithAuth(reqContractorRoot.Context(), contractor, comp.ID, authz.RoleMember))
	recContractorRoot := httptest.NewRecorder()
	r.ServeHTTP(recContractorRoot, reqContractorRoot)
	if recContractorRoot.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for contractor accessing root of restricted project, got %d: %s", recContractorRoot.Code, recContractorRoot.Body.String())
	}

	// Step 5: Contractor CAN access Folder A and see its contents
	reqContractorFolderA := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items?parent_id="+pgUUIDToString(folderA.ID), nil)
	reqContractorFolderA = reqContractorFolderA.WithContext(contextWithAuth(reqContractorFolderA.Context(), contractor, comp.ID, authz.RoleMember))
	recContractorFolderA := httptest.NewRecorder()
	r.ServeHTTP(recContractorFolderA, reqContractorFolderA)
	if recContractorFolderA.Code != http.StatusOK {
		t.Fatalf("expected 200 for contractor accessing granted Folder A, got %d: %s", recContractorFolderA.Code, recContractorFolderA.Body.String())
	}
	var folderAResp struct {
		Items []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"items"`
	}
	_ = json.NewDecoder(recContractorFolderA.Body).Decode(&folderAResp)
	if len(folderAResp.Items) != 1 || folderAResp.Items[0].ID != pgUUIDToString(fileInA.ID) {
		t.Fatalf("expected fileInA in Folder A items, got: %+v", folderAResp.Items)
	}

	// Step 6: Contractor CANNOT access sibling Folder B (returns 404)
	reqContractorFolderB := httptest.NewRequest("GET", "/api/v1/projects/"+projIDStr+"/items?parent_id="+pgUUIDToString(folderB.ID), nil)
	reqContractorFolderB = reqContractorFolderB.WithContext(contextWithAuth(reqContractorFolderB.Context(), contractor, comp.ID, authz.RoleMember))
	recContractorFolderB := httptest.NewRecorder()
	r.ServeHTTP(recContractorFolderB, reqContractorFolderB)
	if recContractorFolderB.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for contractor accessing ungranted Folder B, got %d", recContractorFolderB.Code)
	}

	// Step 7: Contractor CAN access file inside Folder A via authz.AccessItem
	contractorPerson := authz.Person{
		UserID:      uuid.UUID(contractor.ID.Bytes),
		Email:       contractor.Email,
		Role:        authz.RoleMember,
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Permissions: []string{},
	}
	pt := authz.ProjectTarget{
		ID:           uuid.UUID(proj.ID.Bytes),
		CompanyID:    uuid.UUID(comp.ID.Bytes),
		ClientID:     uuid.UUID(client.ID.Bytes),
		IsRestricted: true,
	}
	accessFileInA, err := authz.AccessItem(ctx, queries, contractorPerson, pt, authz.ItemTarget{
		ID:        uuid.UUID(fileInA.ID.Bytes),
		ProjectID: uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(comp.ID.Bytes),
	})
	if err != nil || !accessFileInA.CanView() {
		t.Fatalf("contractor should have access to file inside granted folder A, got level=%s err=%v", accessFileInA.Level, err)
	}

	// Step 8: Contractor CANNOT access file 1 inside Folder B
	accessFile1InB, err := authz.AccessItem(ctx, queries, contractorPerson, pt, authz.ItemTarget{
		ID:        uuid.UUID(file1InB.ID.Bytes),
		ProjectID: uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(comp.ID.Bytes),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if accessFile1InB.CanView() {
		t.Fatalf("contractor should NOT have access to ungranted file1 in Folder B")
	}

	// Step 9: Now grant contractor access to ONLY standalone file 2 in Folder B
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "item",
		TargetID:    file2InB.ID,
		Email:       authz.NormalizeEmail(contractor.Email),
		Level:       authz.LevelViewer,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to grant standalone file to contractor: %v", err)
	}

	// Step 10: Contractor CAN access file 2 in Folder B
	accessFile2InB, err := authz.AccessItem(ctx, queries, contractorPerson, pt, authz.ItemTarget{
		ID:        uuid.UUID(file2InB.ID.Bytes),
		ProjectID: uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(comp.ID.Bytes),
	})
	if err != nil || !accessFile2InB.CanView() {
		t.Fatalf("contractor should have access to granted file2 in Folder B, got level=%s err=%v", accessFile2InB.Level, err)
	}

	// Step 11: Contractor STILL cannot access Folder B itself or file 1 in Folder B
	folderBAccess, err := authz.AccessFolder(ctx, queries, contractorPerson, pt, uuid.UUID(folderB.ID.Bytes))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if folderBAccess.CanView() {
		t.Fatalf("contractor granted only a single file should NOT gain access to the containing folder B")
	}
}

// TestAdminCheckUsesPermissionsNotRoleName verifies that Admin status is determined by permissions
// (specifically admin.settings) rather than hardcoded role name checks.
func TestAdminCheckUsesPermissionsNotRoleName(t *testing.T) {
	// 1. Person with custom role name but admin.settings permission is recognized as Admin
	customRolePerson := authz.Person{
		UserID:      uuid.New(),
		Email:       "custom-admin@studio.com",
		Role:        "StudioDirector", // Not "admin" or "owner"
		Permissions: []string{authz.PermAdminSettings},
	}
	if !customRolePerson.IsAdmin() {
		t.Fatalf("expected customRolePerson with admin.settings permission to be recognized as Admin")
	}

	// 2. Person with non-admin role and non-admin permissions is NOT Admin
	editorPerson := authz.Person{
		UserID:      uuid.New(),
		Email:       "editor@studio.com",
		Role:        "Editor",
		Permissions: []string{authz.PermProjectsViewAll, authz.PermClientsViewAll},
	}
	if editorPerson.IsAdmin() {
		t.Fatalf("expected editorPerson without admin.settings to NOT be Admin")
	}

	// 3. Admin access on restricted project works for person with admin.settings permission
	pt := authz.ProjectTarget{
		ID:           uuid.New(),
		CompanyID:    uuid.New(),
		IsRestricted: true,
	}
	res, err := authz.Access(context.Background(), nil, customRolePerson, pt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Level != authz.LevelFull || !res.CanDownload {
		t.Fatalf("expected Full access and CanDownload for custom role with admin.settings, got %+v", res)
	}

	// 4. Editor without admin.settings gets LevelNone on restricted project without grant
	resEditor, err := authz.Access(context.Background(), nil, editorPerson, pt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resEditor.CanView() {
		t.Fatalf("expected LevelNone for editor without admin.settings on restricted project, got %+v", resEditor)
	}
}

