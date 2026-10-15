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
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
	"github.com/playhead/playhead/services/shared/storage"
)

func withChiURLParams(req *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// -----------------------------------------------------------------------------
// Unit Tests: Collab Ticket Security (Expiration, Document Binding, Tampering)
// -----------------------------------------------------------------------------

func TestCollabTicketSecurity(t *testing.T) {
	secret := "test-collab-hmac-secret-32-chars-long!"
	docID := uuid.New()
	userID := uuid.New()

	// 1. Valid ticket generated
	ticket := GenerateCollabTicket(secret, docID, userID, time.Now().Add(60*time.Second))

	verifiedUserID, valid := VerifyCollabTicket(secret, ticket, docID)
	if !valid {
		t.Fatalf("VerifyCollabTicket failed on valid ticket")
	}
	if verifiedUserID != userID {
		t.Errorf("expected userID %v, got %v", userID, verifiedUserID)
	}

	// 2. Ticket cannot be reused for another document (User approved change 8)
	otherDocID := uuid.New()
	_, validForOther := VerifyCollabTicket(secret, ticket, otherDocID)
	if validForOther {
		t.Fatalf("ticket was valid for a different document ID!")
	}

	// 3. Expired ticket must fail (User approved change 8)
	expiredTicket := GenerateCollabTicket(secret, docID, userID, time.Now().Add(-10*time.Second))
	_, expiredValid := VerifyCollabTicket(secret, expiredTicket, docID)
	if expiredValid {
		t.Errorf("expected expired ticket to fail verification, but succeeded")
	}

	// 4. Tampered ticket must fail
	tamperedTicket := ticket + "x"
	_, tamperedValid := VerifyCollabTicket(secret, tamperedTicket, docID)
	if tamperedValid {
		t.Errorf("expected tampered ticket to fail verification, but succeeded")
	}

	// 5. Wrong secret must fail
	_, wrongSecretValid := VerifyCollabTicket("wrong-secret-that-does-not-match!", ticket, docID)
	if wrongSecretValid {
		t.Errorf("expected wrong secret to fail verification, but succeeded")
	}
}

// -----------------------------------------------------------------------------
// Unit Tests: Server-side Team Notes Sanitization (Zero Leaks)
// -----------------------------------------------------------------------------

func TestStripTeamNotesSanitization(t *testing.T) {
	rawDoc := map[string]interface{}{
		"type": "doc",
		"content": []interface{}{
			map[string]interface{}{
				"type": "paragraph",
				"content": []interface{}{
					map[string]interface{}{
						"type": "text",
						"text": "Public document introduction.",
					},
				},
			},
			map[string]interface{}{
				"type": "team_notes",
				"content": []interface{}{
					map[string]interface{}{
						"type": "paragraph",
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "CONFIDENTIAL: Client budget margin is 45%. Do not share.",
							},
						},
					},
				},
			},
			map[string]interface{}{
				"type": "heading",
				"attrs": map[string]interface{}{
					"level": 2,
				},
				"content": []interface{}{
					map[string]interface{}{
						"type": "text",
						"text": "Deliverables Timeline",
					},
				},
			},
			map[string]interface{}{
				"type": "team_notes",
				"content": []interface{}{
					map[string]interface{}{
						"type": "paragraph",
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "INTERNAL ONLY: Reviewer note for the production team.",
							},
						},
					},
				},
			},
		},
	}

	sanitized := StripTeamNotes(rawDoc)
	sanitizedBytes, _ := json.Marshal(sanitized)
	sanitizedStr := string(sanitizedBytes)

	// Ensure no team notes content or type remains
	if bytes.Contains(sanitizedBytes, []byte("CONFIDENTIAL")) {
		t.Errorf("sanitized document leaked confidential team note text!")
	}
	if bytes.Contains(sanitizedBytes, []byte("team_notes")) {
		t.Errorf("sanitized document contains team_notes node type!")
	}
	if bytes.Contains(sanitizedBytes, []byte("INTERNAL ONLY")) {
		t.Errorf("sanitized document leaked internal note text!")
	}

	// Ensure public content is preserved
	if !bytes.Contains(sanitizedBytes, []byte("Public document introduction.")) {
		t.Errorf("sanitized document dropped public introduction paragraph")
	}
	if !bytes.Contains(sanitizedBytes, []byte("Deliverables Timeline")) {
		t.Errorf("sanitized document dropped deliverables heading")
	}

	t.Logf("Sanitized JSON successfully preserved public nodes and stripped team_notes: %s", sanitizedStr)
}

// -----------------------------------------------------------------------------
// Unit Tests: Collab Internal Verify Secret & Constant-Time Refusal
// -----------------------------------------------------------------------------

func TestCollabVerifyConstantTimeSecret(t *testing.T) {
	cfg := &config.Config{
		CollabInternalSecret: "super-secret-collab-key-12345",
	}
	h := NewDocumentsHandler(nil, nil, nil, nil, cfg)

	// 1. Missing header -> 401
	req := httptest.NewRequest("POST", "/api/internal/collab/verify", nil)
	w := httptest.NewRecorder()
	h.InternalCollabVerify(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing X-Collab-Secret, got %d", w.Code)
	}

	// 2. Incorrect secret -> 401
	req = httptest.NewRequest("POST", "/api/internal/collab/verify", nil)
	req.Header.Set("X-Collab-Secret", "wrong-secret")
	w = httptest.NewRecorder()
	h.InternalCollabVerify(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong X-Collab-Secret, got %d", w.Code)
	}
}

// -----------------------------------------------------------------------------
// Integration Tests: Document Permissions, Client Isolation, Non-Team Gate
// -----------------------------------------------------------------------------

func TestP5DocumentsIntegration(t *testing.T) {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Skipf("skipping integration test: postgres not reachable: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("skipping integration test: ping failed: %v", err)
	}

	queries := db.New(pool)
	stClient, _ := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})

	docsH := NewDocumentsHandler(pool, queries, nil, stClient, cfg)

	// Setup: Company, Team Owner, Client Company, Client Contact
	company, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:   fmt.Sprintf("P5 Doc Studio %d", time.Now().UnixNano()),
		Slug:   fmt.Sprintf("p5-docs-%d", time.Now().UnixNano()),
		Plan:   plans.PlanPro,
		Status: "active",
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	owner, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p5owner-%d@test.com", time.Now().UnixNano()),
		Name:  "Doc Owner",
	})
	if err != nil {
		t.Fatalf("failed to create owner: %v", err)
	}

	_, err = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    owner.ID,
		Role:      authz.RoleAdmin,
	})
	if err != nil {
		t.Fatalf("failed to add owner membership: %v", err)
	}

	// Create Client & Client Contact
	clientRow, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "P5 Client Corp",
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	clientUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("p5client-%d@test.com", time.Now().UnixNano()),
		Name:  "P5 Client Contact",
	})
	if err != nil {
		t.Fatalf("failed to create client user: %v", err)
	}

	_, err = queries.CreateClientContact(ctx, db.CreateClientContactParams{
		CompanyID:    company.ID,
		ClientID:     clientRow.ID,
		Name:         "P5 Client Contact",
		Email:        clientUser.Email,
		DefaultLevel: "viewer",
		CanDownload:  true,
	})
	if err != nil {
		t.Fatalf("failed to create client contact: %v", err)
	}

	// Create Project
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientRow.ID,
		Name:      "P5 Project Deliverable",
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}

	// Grant Client User Full access to project
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   company.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       clientUser.Email,
		UserID:      clientUser.ID,
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   owner.ID,
	})
	if err != nil {
		t.Fatalf("failed to grant client user access: %v", err)
	}

	// Create Document Item
	item, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: company.ID,
		ProjectID: proj.ID,
		Kind:      "document",
		Name:      "P5 Test Doc",
		CreatedBy: owner.ID,
	})
	if err != nil {
		t.Fatalf("failed to create item: %v", err)
	}

	docUUID := item.ID.Bytes
	initialJSON := []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"P5 Test Doc"}]}]}`)
	doc, err := queries.CreateDocument(ctx, db.CreateDocumentParams{
		ID:                 item.ID,
		CompanyID:          company.ID,
		ContentJson:        initialJSON,
		PlainText:          "P5 Test Doc",
		PublicPlainText:    "P5 Test Doc",
		WordCount:          3,
		CharacterCount:     11,
		ReadingTimeSeconds: 1,
	})
	if err != nil {
		t.Fatalf("failed to create document: %v", err)
	}

	// -------------------------------------------------------------------------
	// Change 1 & 8: Client with Full access is REFUSED by collab service
	// -------------------------------------------------------------------------
	clientTicket := GenerateCollabTicket(cfg.CollabInternalSecret, docUUID, clientUser.ID.Bytes, time.Now().Add(60*time.Second))

	verifyBody, _ := json.Marshal(CollabVerifyRequest{
		DocumentID: uuid.UUID(docUUID).String(),
		Ticket:     clientTicket,
	})
	req := httptest.NewRequest("POST", "/api/internal/collab/verify", bytes.NewReader(verifyBody))
	req.Header.Set("X-Collab-Secret", cfg.CollabInternalSecret)
	w := httptest.NewRecorder()
	docsH.InternalCollabVerify(w, req)

	// Refused with 403 Forbidden
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 from collab verify for non-team client, got %d", w.Code)
	}

	var verifyResp CollabVerifyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &verifyResp); err != nil {
		t.Fatalf("failed to unmarshal collab verify resp: %v", err)
	}

	// CRITICAL CHECK: Non-team member (client) is refused live Yjs editing!
	if verifyResp.Allowed {
		t.Errorf("SECURITY FAILURE: Client contact was granted Allowed=true! Must be false.")
	}
	if verifyResp.IsTeamMember {
		t.Errorf("SECURITY FAILURE: Client contact was marked IsTeamMember=true! Must be false.")
	}

	// -------------------------------------------------------------------------
	// Change 1: Team member with Full access gets Allowed=true, IsTeamMember=true, ReadOnly=false
	// -------------------------------------------------------------------------
	ownerTicket := GenerateCollabTicket(cfg.CollabInternalSecret, docUUID, owner.ID.Bytes, time.Now().Add(60*time.Second))

	verifyBody, _ = json.Marshal(CollabVerifyRequest{
		DocumentID: uuid.UUID(docUUID).String(),
		Ticket:     ownerTicket,
	})
	req = httptest.NewRequest("POST", "/api/internal/collab/verify", bytes.NewReader(verifyBody))
	req.Header.Set("X-Collab-Secret", cfg.CollabInternalSecret)
	w = httptest.NewRecorder()
	docsH.InternalCollabVerify(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from collab verify for owner, got %d", w.Code)
	}

	var ownerVerifyResp CollabVerifyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &ownerVerifyResp); err != nil {
		t.Fatalf("failed to unmarshal collab verify resp: %v", err)
	}

	if !ownerVerifyResp.Allowed || !ownerVerifyResp.IsTeamMember || ownerVerifyResp.ReadOnly {
		t.Errorf("Team owner should have Allowed=true, IsTeamMember=true, ReadOnly=false, got allowed=%v, team=%v, ro=%v",
			ownerVerifyResp.Allowed, ownerVerifyResp.IsTeamMember, ownerVerifyResp.ReadOnly)
	}

	// -------------------------------------------------------------------------
	// Change 4 & 8: Image inside team note returns 404 for non-team callers
	// -------------------------------------------------------------------------
	assetUUID := uuid.New()
	asset, err := queries.CreateDocumentAsset(ctx, db.CreateDocumentAssetParams{
		DocumentID:  doc.ID,
		CompanyID:   company.ID,
		StorageKey:  fmt.Sprintf("docs/%s/images/%s.png", uuid.UUID(docUUID).String(), assetUUID),
		Filename:    "secret_spec.png",
		Mime:        "image/png",
		SizeBytes:   1024,
		InTeamNotes: true, // Marked inside team note
		UploadedBy:  owner.ID,
	})
	if err != nil {
		t.Fatalf("failed to create document asset: %v", err)
	}

	// Client caller tries to fetch asset image
	clientPerson := authz.Person{
		UserID:      clientUser.ID.Bytes,
		CompanyID:   company.ID.Bytes,
		Role:        "", // Client contact has no team role
		Permissions: []string{},
	}
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/documents/%s/images/%s", uuid.UUID(docUUID).String(), uuid.UUID(asset.ID.Bytes).String()), nil)
	req = req.WithContext(contextWithPerson(req.Context(), clientUser, company.ID, clientPerson))
	req = withChiURLParams(req, map[string]string{
		"id":      uuid.UUID(docUUID).String(),
		"imageId": uuid.UUID(asset.ID.Bytes).String(),
	})
	w = httptest.NewRecorder()
	docsH.GetImage(w, req)

	// Must be 404 Not Found (Rule 4: Refused for non-team callers)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 Not Found for client fetching image inside team notes, got %d", w.Code)
	}

	// -------------------------------------------------------------------------
	// Change 5 & 8: Documents list for client shows only their client's documents
	// -------------------------------------------------------------------------
	req = httptest.NewRequest("GET", "/api/v1/documents", nil)
	req = req.WithContext(contextWithPerson(req.Context(), clientUser, company.ID, clientPerson))
	w = httptest.NewRecorder()
	docsH.List(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from List, got %d", w.Code)
	}

	var listResp struct {
		Documents []interface{} `json:"documents"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to unmarshal list resp: %v", err)
	}

	if len(listResp.Documents) != 1 {
		t.Errorf("expected client to see exactly 1 document belonging to their client, got %d", len(listResp.Documents))
	}

	// -------------------------------------------------------------------------
	// Document Versions: Non-destructive restore creates new version
	// -------------------------------------------------------------------------
	v1Content := []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Version 1 text"}]}]}`)
	v1Doc, err := queries.CreateDocumentVersion(ctx, db.CreateDocumentVersionParams{
		DocumentID:   doc.ID,
		CompanyID:    company.ID,
		Name:         pgtype.Text{String: "Initial Draft", Valid: true},
		IsNamed:      true,
		ContentJson:  v1Content,
		PlainText:    "Version 1 text",
		CreatedBy:    owner.ID,
	})
	if err != nil {
		t.Fatalf("failed to create v1: %v", err)
	}

	// Restore v1 as owner
	ownerPerson := authz.Person{
		UserID:      owner.ID.Bytes,
		CompanyID:   company.ID.Bytes,
		Role:        authz.RoleAdmin,
		Permissions: []string{},
	}
	restoreBody, _ := json.Marshal(map[string]interface{}{
		"version_id": uuid.UUID(v1Doc.ID.Bytes).String(),
	})
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/documents/%s/restore", uuid.UUID(docUUID).String()), bytes.NewReader(restoreBody))
	req = req.WithContext(contextWithPerson(req.Context(), owner, company.ID, ownerPerson))
	req = withChiURLParams(req, map[string]string{"id": uuid.UUID(docUUID).String()})
	w = httptest.NewRecorder()
	docsH.RestoreVersion(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 from RestoreVersion, got %d (body: %s)", w.Code, w.Body.String())
	}

	var restoreResp struct {
		NewVersionNumber int32 `json:"new_version_number"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &restoreResp)
	if restoreResp.NewVersionNumber != 2 {
		t.Errorf("expected restored version to create new version 2, got %d", restoreResp.NewVersionNumber)
	}

	_ = asset
}
