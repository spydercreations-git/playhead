package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
)

func TestP1ProjectsAndClients(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	authH := NewAuthHandler(queries, mailClient, "", "http://localhost:3000", false)
	clientH := NewClientHandler(queries, mailClient)
	projectH := NewProjectHandler(queries)

	// 1. Create company and Admin user
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Idyll Productions",
		Slug: "idyll-" + time.Now().Format("20060102150405000000"),
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminEmail := fmt.Sprintf("admin-%d@idyll.productions", time.Now().UnixNano())
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: adminEmail,
		Name:  "Admin User",
	})
	if err != nil {
		t.Fatalf("failed to create admin user: %v", err)
	}

	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("failed to create admin membership: %v", err)
	}

	// 2. Extra Test: Case-insensitive email handling
	// "Harsh@Example.com" and "harsh@example.com" are treated as the same email
	norm1 := authz.NormalizeEmail("Harsh@Example.com")
	norm2 := authz.NormalizeEmail("harsh@example.com")
	if norm1 != norm2 {
		t.Fatalf("expected emails to normalize identically, got %q vs %q", norm1, norm2)
	}

	// 3. Create two clients: Client A (Everygen) and Client B (Acme)
	clientA, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Everygen",
		Website:   pgtype.Text{String: "https://everygen.com", Valid: true},
		Notes:     pgtype.Text{String: "Lead agency client notes", Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client A: %v", err)
	}

	clientB, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Acme",
		Website:   pgtype.Text{String: "https://acme.corp", Valid: true},
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client B: %v", err)
	}

	// 4. Create projects: Project A1 and A2 for Client A, Project B1 for Client B
	projA1, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientA.ID,
		Name:      "October UGC",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project A1: %v", err)
	}

	projA2, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientA.ID,
		Name:      "November Brand Film",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project A2: %v", err)
	}

	projB1, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  clientB.ID,
		Name:      "Acme Product Launch",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project B1: %v", err)
	}
	_ = projA2
	_ = projB1

	// 5. Test video_project template generates 4 default folders
	createVideoReqBody, _ := json.Marshal(CreateProjectRequest{
		Name:     "Template Test Project",
		ClientID: fmt.Sprintf("%x-%x-%x-%x-%x", clientA.ID.Bytes[0:4], clientA.ID.Bytes[4:6], clientA.ID.Bytes[6:8], clientA.ID.Bytes[8:10], clientA.ID.Bytes[10:16]),
		Template: "video_project",
	})
	reqVid := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewReader(createVideoReqBody))
	reqVid = reqVid.WithContext(contextWithAuth(reqVid.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recVid := httptest.NewRecorder()
	projectH.Create(recVid, reqVid)
	if recVid.Code != http.StatusCreated {
		t.Fatalf("failed to create video project with template: %s", recVid.Body.String())
	}
	var createdVidProj db.Project
	_ = json.Unmarshal(recVid.Body.Bytes(), &createdVidProj)
	if createdVidProj.FolderCount != 4 {
		t.Fatalf("expected folder_count 4 on video_project template, got %d", createdVidProj.FolderCount)
	}

	// 6. Extra Test: A client contact with default "Commenter" sees all projects of their client and none of other clients
	ts := time.Now().UnixNano()
	commenterEmail := fmt.Sprintf("sarah-%d@everygen.com", ts)
	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     clientA.ID,
		Name:         "Sarah Everygen",
		Email:        commenterEmail,
		DefaultLevel: authz.LevelCommenter,
		CanDownload:  true,
	})
	if err != nil {
		t.Fatalf("failed to create client contact with commenter default: %v", err)
	}

	commenterUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: commenterEmail,
		Name:  "Sarah Everygen",
	})
	if err != nil {
		t.Fatalf("failed to create commenter user: %v", err)
	}

	reqListCommenter := httptest.NewRequest("GET", "/api/v1/projects", nil)
	reqListCommenter = reqListCommenter.WithContext(contextWithAuth(reqListCommenter.Context(), commenterUser, comp.ID, ""))
	recListCommenter := httptest.NewRecorder()
	projectH.List(recListCommenter, reqListCommenter)

	var commenterProjectsResp struct {
		Projects []db.ListProjectsForUserWithAccessRow `json:"projects"`
	}
	_ = json.Unmarshal(recListCommenter.Body.Bytes(), &commenterProjectsResp)

	// Should see Client A projects (October UGC, November Brand Film, Template Test Project) and NOT Client B project
	if len(commenterProjectsResp.Projects) < 2 {
		t.Fatalf("expected commenter to see all client A projects, got %d", len(commenterProjectsResp.Projects))
	}
	for _, p := range commenterProjectsResp.Projects {
		if p.ClientID == clientB.ID {
			t.Fatalf("commenter saw project belonging to Client B! Client isolation failed.")
		}
	}

	// 7. Extra Test: A contact with "None" and no grants sees no projects
	noneContactEmail := fmt.Sprintf("inactive-%d@everygen.com", ts)
	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    comp.ID,
		ClientID:     clientA.ID,
		Name:         "Inactive Contact",
		Email:        noneContactEmail,
		DefaultLevel: authz.LevelNone,
		CanDownload:  false,
	})
	if err != nil {
		t.Fatalf("failed to create none contact: %v", err)
	}

	noneUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: noneContactEmail,
		Name:  "Inactive User",
	})
	if err != nil {
		t.Fatalf("failed to create none user: %v", err)
	}

	reqListNone := httptest.NewRequest("GET", "/api/v1/projects", nil)
	reqListNone = reqListNone.WithContext(contextWithAuth(reqListNone.Context(), noneUser, comp.ID, ""))
	recListNone := httptest.NewRecorder()
	projectH.List(recListNone, reqListNone)

	var noneProjectsResp struct {
		Projects []db.ListProjectsForUserWithAccessRow `json:"projects"`
	}
	_ = json.Unmarshal(recListNone.Body.Bytes(), &noneProjectsResp)
	if len(noneProjectsResp.Projects) != 0 {
		t.Fatalf("expected contact with 'none' to see 0 projects, got %d", len(noneProjectsResp.Projects))
	}

	// 8. Extra Test: An Editor without a grant gets 404 on a project
	editorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("editor-%d@idyll.productions", ts),
		Name:  "Video Editor 1",
	})
	if err != nil {
		t.Fatalf("failed to create editor user: %v", err)
	}
	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleEditor,
	})
	if err != nil {
		t.Fatalf("failed to create editor membership: %v", err)
	}

	rUnassigned := chi.NewRouter()
	rUnassigned.Get("/api/v1/projects/{id}", projectH.Get)
	projIDA1Str := fmt.Sprintf("%x-%x-%x-%x-%x", projA1.ID.Bytes[0:4], projA1.ID.Bytes[4:6], projA1.ID.Bytes[6:8], projA1.ID.Bytes[8:10], projA1.ID.Bytes[10:16])
	reqGetUnassigned := httptest.NewRequest("GET", "/api/v1/projects/"+projIDA1Str, nil)
	reqGetUnassigned = reqGetUnassigned.WithContext(contextWithAuth(reqGetUnassigned.Context(), editorUser, comp.ID, authz.RoleEditor))
	recGetUnassigned := httptest.NewRecorder()
	rUnassigned.ServeHTTP(recGetUnassigned, reqGetUnassigned)

	if recGetUnassigned.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for unassigned editor opening project, got %d", recGetUnassigned.Code)
	}

	// 9. Extra Test: A Commenter cannot add people to a project
	addPersonBody, _ := json.Marshal(AssignPersonInput{
		Email: "random@outside.com",
		Level: authz.LevelViewer,
	})
	rAddPerson := chi.NewRouter()
	rAddPerson.Post("/api/v1/projects/{id}/people", projectH.AddPerson)

	reqCommenterAdd := httptest.NewRequest("POST", "/api/v1/projects/"+projIDA1Str+"/people", bytes.NewReader(addPersonBody))
	reqCommenterAdd = reqCommenterAdd.WithContext(contextWithAuth(reqCommenterAdd.Context(), commenterUser, comp.ID, ""))
	recCommenterAdd := httptest.NewRecorder()
	rAddPerson.ServeHTTP(recCommenterAdd, reqCommenterAdd)

	if recCommenterAdd.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for Commenter trying to add people, got %d", recCommenterAdd.Code)
	}

	// 10. Admin adding editor to project succeeds
	reqAdminAdd := httptest.NewRequest("POST", "/api/v1/projects/"+projIDA1Str+"/people", bytes.NewReader(addPersonBody))
	reqAdminAdd = reqAdminAdd.WithContext(contextWithAuth(reqAdminAdd.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recAdminAdd := httptest.NewRecorder()
	rAddPerson.ServeHTTP(recAdminAdd, reqAdminAdd)

	if recAdminAdd.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for Admin adding person, got %d: %s", recAdminAdd.Code, recAdminAdd.Body.String())
	}

	// 11. Extra Test: 6-digit email sign in code flow
	// Send code for known email (sarah@everygen.com)
	sendCodeBody, _ := json.Marshal(SendLoginCodeRequest{Email: "Sarah@Everygen.com"})
	reqSendCode := httptest.NewRequest("POST", "/api/v1/auth/code/send", bytes.NewReader(sendCodeBody))
	recSendCode := httptest.NewRecorder()
	authH.SendLoginCode(recSendCode, reqSendCode)

	if recSendCode.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on SendLoginCode, got %d: %s", recSendCode.Code, recSendCode.Body.String())
	}

	// Verify contact exists
	contacts, err := queries.GetClientContactsByEmail(ctx, commenterEmail)
	if err != nil || len(contacts) == 0 {
		t.Fatalf("expected client contact to exist: %v", err)
	}

	// Send code for unknown email must be rejected with 403
	sendCodeUnknownBody, _ := json.Marshal(SendLoginCodeRequest{Email: "intruder@unknown.com"})
	reqSendUnknown := httptest.NewRequest("POST", "/api/v1/auth/code/send", bytes.NewReader(sendCodeUnknownBody))
	recSendUnknown := httptest.NewRecorder()
	authH.SendLoginCode(recSendUnknown, reqSendUnknown)

	if recSendUnknown.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden on SendLoginCode for unknown email, got %d: %s", recSendUnknown.Code, recSendUnknown.Body.String())
	}

	// 12. Client details: client Notes in P1 is a plain text field
	getClientReq := httptest.NewRequest("GET", "/api/v1/clients/"+fmt.Sprintf("%x-%x-%x-%x-%x", clientA.ID.Bytes[0:4], clientA.ID.Bytes[4:6], clientA.ID.Bytes[6:8], clientA.ID.Bytes[8:10], clientA.ID.Bytes[10:16]), nil)
	getClientReq = getClientReq.WithContext(contextWithAuth(getClientReq.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recGetClient := httptest.NewRecorder()
	rClient := chi.NewRouter()
	rClient.Get("/api/v1/clients/{id}", clientH.Get)
	rClient.ServeHTTP(recGetClient, getClientReq)

	if recGetClient.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on get client, got %d", recGetClient.Code)
	}

	var clientDetailsResp struct {
		Client db.Client `json:"client"`
	}
	_ = json.Unmarshal(recGetClient.Body.Bytes(), &clientDetailsResp)
	if clientDetailsResp.Client.Notes.String != "Lead agency client notes" {
		t.Fatalf("expected plain text notes, got %q", clientDetailsResp.Client.Notes.String)
	}

	// 13. Move project to client: forbidden for commenter, succeeds for admin
	targetClient, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Second Client",
		CreatedBy: adminUser.ID,
	})
	targetClientIDStr := pgUUIDToString(targetClient.ID)

	moveBody, _ := json.Marshal(UpdateProjectRequest{
		ClientID: &targetClientIDStr,
	})
	rUpdateProj := chi.NewRouter()
	rUpdateProj.Patch("/api/v1/projects/{id}", projectH.Update)

	// Commenter forbidden
	reqForbiddenMove := httptest.NewRequest("PATCH", "/api/v1/projects/"+projIDA1Str, bytes.NewReader(moveBody))
	reqForbiddenMove = reqForbiddenMove.WithContext(contextWithAuth(reqForbiddenMove.Context(), commenterUser, comp.ID, ""))
	recForbiddenMove := httptest.NewRecorder()
	rUpdateProj.ServeHTTP(recForbiddenMove, reqForbiddenMove)
	if recForbiddenMove.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for Commenter moving project, got %d", recForbiddenMove.Code)
	}

	// Admin succeeds
	reqAdminMove := httptest.NewRequest("PATCH", "/api/v1/projects/"+projIDA1Str, bytes.NewReader(moveBody))
	reqAdminMove = reqAdminMove.WithContext(contextWithAuth(reqAdminMove.Context(), adminUser, comp.ID, authz.RoleAdmin))
	recAdminMove := httptest.NewRecorder()
	rUpdateProj.ServeHTTP(recAdminMove, reqAdminMove)
	if recAdminMove.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for Admin moving project, got %d: %s", recAdminMove.Code, recAdminMove.Body.String())
	}
}


func contextWithAuth(parent context.Context, u db.User, companyID pgtype.UUID, role string) context.Context {
	authUser := &middleware.AuthenticatedUser{
		ID:    u.ID,
		Email: u.Email,
		Name:  u.Name,
	}
	ctx := context.WithValue(parent, middleware.UserContextKey, authUser)
	ctx = context.WithValue(ctx, middleware.CompanyContextKey, companyID)
	ctx = context.WithValue(ctx, middleware.RoleContextKey, role)
	return ctx
}
