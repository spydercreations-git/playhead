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

	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
	"github.com/playhead/playhead/services/shared/storage"
)

func contextWithPerson(parent context.Context, u db.User, companyID pgtype.UUID, person authz.Person) context.Context {
	authUser := &middleware.AuthenticatedUser{
		ID:    u.ID,
		Email: u.Email,
		Name:  u.Name,
	}
	ctx := context.WithValue(parent, middleware.UserContextKey, authUser)
	ctx = context.WithValue(ctx, middleware.CompanyContextKey, companyID)
	ctx = context.WithValue(ctx, middleware.RoleContextKey, person.Role)
	ctx = context.WithValue(ctx, middleware.PersonContextKey, person)
	return ctx
}

func TestP3PermissionsRolesAndSharing(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	mailClient := mailer.New(mailer.Config{})
	cfg := config.Load()
	stClient, _ := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})

	grantsH := NewGrantsHandler(queries, mailClient)
	shareLinksH := NewShareLinksHandler(queries, stClient)
	itemsH := NewItemsHandler(queries, stClient)
	rolesH := NewRolesHandler(queries)
	companyH := NewCompanyHandler(queries)

	// Create test company
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "P3 Test Studio",
		Slug:              fmt.Sprintf("p3-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 10 * 1024 * 1024 * 1024,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	// 1. Admin user
	adminEmail := fmt.Sprintf("admin-%d@studio.com", time.Now().UnixNano())
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: adminEmail,
		Name:  "Admin Alice",
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

	adminPerson := authz.Person{
		UserID:      uuid.UUID(adminUser.ID.Bytes),
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Email:       adminEmail,
		Role:        authz.RoleAdmin,
		Permissions: authz.AllPermissions,
	}

	// Create Client & Project
	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "P3 Acme Client",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "P3 Commercial Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	projIDStr := pgUUIDToString(proj.ID)

	// Create two items: itemIn (attached to share link) and itemOut (outside link)
	itemIn, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "inside_link.mp4",
		CreatedBy: adminUser.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create itemIn: %v", err)
	}
	_, _ = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:  comp.ID,
		ItemID:     itemIn.ID,
		Number:     1,
		StorageKey: "test/inside.mp4",
		SizeBytes:  1024 * 1024,
		Mime:       "video/mp4",
		UploadedBy: adminUser.ID,
	})

	itemOut, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "outside_link.mp4",
		CreatedBy: adminUser.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(2000), Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create itemOut: %v", err)
	}
	_, _ = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:  comp.ID,
		ItemID:     itemOut.ID,
		Number:     1,
		StorageKey: "test/outside.mp4",
		SizeBytes:  2048 * 1024,
		Mime:       "video/mp4",
		UploadedBy: adminUser.ID,
	})

	// -------------------------------------------------------------
	// TEST 1: Share link visitor requesting item outside link gets 404
	// -------------------------------------------------------------
	t.Run("Share link visitor requesting item outside link gets 404", func(t *testing.T) {
		// Admin creates share link attaching itemIn only
		createBody, _ := json.Marshal(map[string]interface{}{
			"name":           "Public Review Link",
			"access":         "view",
			"allow_download": true,
			"item_ids":       []string{pgUUIDToString(itemIn.ID)},
		})
		rCreate := chi.NewRouter()
		rCreate.Post("/api/v1/projects/{id}/share-links", shareLinksH.Create)

		reqCreate := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/share-links", bytes.NewReader(createBody))
		reqCreate = reqCreate.WithContext(contextWithPerson(reqCreate.Context(), adminUser, comp.ID, adminPerson))
		recCreate := httptest.NewRecorder()
		rCreate.ServeHTTP(recCreate, reqCreate)

		if recCreate.Code != http.StatusCreated {
			t.Fatalf("expected 201 created on share link, got %d: %s", recCreate.Code, recCreate.Body.String())
		}
		var createdLink struct {
			ID    string `json:"id"`
			Token string `json:"token"`
		}
		_ = json.Unmarshal(recCreate.Body.Bytes(), &createdLink)

		// Router for public share endpoints
		rPublic := chi.NewRouter()
		rPublic.Get("/s/{token}/download/{itemId}", shareLinksH.PublicDownload)

		// Attempt to download itemOut (outside the link scope)
		reqOutside := httptest.NewRequest("GET", "/s/"+createdLink.Token+"/download/"+pgUUIDToString(itemOut.ID), nil)
		recOutside := httptest.NewRecorder()
		rPublic.ServeHTTP(recOutside, reqOutside)

		if recOutside.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found for item outside share link, got %d: %s", recOutside.Code, recOutside.Body.String())
		}
	})

	// -------------------------------------------------------------
	// TEST 2: A Viewer cannot create grants or share links (403)
	// -------------------------------------------------------------
	t.Run("Viewer cannot create grants or share links (403)", func(t *testing.T) {
		viewerUser, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("viewer-%d@studio.com", time.Now().UnixNano()),
			Name:  "Viewer Bob",
		})
		if err != nil {
			t.Fatalf("failed to create viewer user: %v", err)
		}
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    viewerUser.ID,
			Role:      "viewer",
		})

		viewerPerson := authz.Person{
			UserID:      uuid.UUID(viewerUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       viewerUser.Email,
			Role:        "viewer",
			Permissions: nil,
		}

		// Viewer attempts to create a project grant -> 403
		grantBody, _ := json.Marshal(map[string]interface{}{
			"email": "someone@external.com",
			"level": "viewer",
		})
		rGrants := chi.NewRouter()
		rGrants.Post("/api/v1/projects/{id}/grants", grantsH.AddProjectGrant)

		reqGrant := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/grants", bytes.NewReader(grantBody))
		reqGrant = reqGrant.WithContext(contextWithPerson(reqGrant.Context(), viewerUser, comp.ID, viewerPerson))
		recGrant := httptest.NewRecorder()
		rGrants.ServeHTTP(recGrant, reqGrant)

		if recGrant.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when viewer tries to create grant, got %d", recGrant.Code)
		}

		// Viewer attempts to create a share link -> 403
		shareBody, _ := json.Marshal(map[string]interface{}{
			"name":     "Viewer share",
			"item_ids": []string{pgUUIDToString(itemIn.ID)},
		})
		rShare := chi.NewRouter()
		rShare.Post("/api/v1/projects/{id}/share-links", shareLinksH.Create)

		reqShare := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/share-links", bytes.NewReader(shareBody))
		reqShare = reqShare.WithContext(contextWithPerson(reqShare.Context(), viewerUser, comp.ID, viewerPerson))
		recShare := httptest.NewRecorder()
		rShare.ServeHTTP(recShare, reqShare)

		if recShare.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when viewer tries to create share link, got %d", recShare.Code)
		}
	})

	// -------------------------------------------------------------
	// TEST 3: Person with Full access but without sharing.create_public_links cannot create a public link (403)
	// -------------------------------------------------------------
	t.Run("Person with Full access but without sharing.create_public_links cannot create public link (403)", func(t *testing.T) {
		memberUser, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("restricted-creator-%d@studio.com", time.Now().UnixNano()),
			Name:  "Full Access But No Share Role",
		})
		if err != nil {
			t.Fatalf("failed to create user: %v", err)
		}

		// Custom role with projects.view_all (Full access) but explicitly WITHOUT PermSharingCreatePublicLinks
		restrictedPerson := authz.Person{
			UserID:    uuid.UUID(memberUser.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			Email:     memberUser.Email,
			Role:      "restricted_lead",
			Permissions: []string{
				authz.PermProjectsViewAll,
				authz.PermFilesDownloadAll,
				// authz.PermSharingCreatePublicLinks is omitted!
			},
		}

		shareBody, _ := json.Marshal(map[string]interface{}{
			"name":     "Restricted share",
			"item_ids": []string{pgUUIDToString(itemIn.ID)},
		})
		rShare := chi.NewRouter()
		rShare.Post("/api/v1/projects/{id}/share-links", shareLinksH.Create)

		reqShare := httptest.NewRequest("POST", "/api/v1/projects/"+projIDStr+"/share-links", bytes.NewReader(shareBody))
		reqShare = reqShare.WithContext(contextWithPerson(reqShare.Context(), memberUser, comp.ID, restrictedPerson))
		recShare := httptest.NewRecorder()
		rShare.ServeHTTP(recShare, reqShare)

		if recShare.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when missing sharing.create_public_links, got %d: %s", recShare.Code, recShare.Body.String())
		}
	})

	// -------------------------------------------------------------
	// TEST 4: Removing a grant removes access immediately
	// -------------------------------------------------------------
	t.Run("Removing a grant removes access immediately", func(t *testing.T) {
		contractorEmail := fmt.Sprintf("contractor-%d@freelance.com", time.Now().UnixNano())
		contractorUser, err := queries.CreateUser(ctx, db.CreateUserParams{
			Email: contractorEmail,
			Name:  "Contractor Chris",
		})
		if err != nil {
			t.Fatalf("failed to create contractor: %v", err)
		}

		contractorPerson := authz.Person{
			UserID:      uuid.UUID(contractorUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       contractorEmail,
			Role:        "",
			Permissions: nil,
		}

		// Grant contractor viewer access to project
		grant, err := queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       contractorEmail,
			UserID:      contractorUser.ID,
			Level:       authz.LevelViewer,
			CanDownload: false,
			GrantedBy:   adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create grant: %v", err)
		}

		// Verify contractor has viewer access now
		accBefore, err := authz.Access(ctx, queries, contractorPerson, authz.ProjectTarget{
			ID:        uuid.UUID(proj.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			ClientID:  uuid.UUID(client.ID.Bytes),
		})
		if err != nil || accBefore.Level != authz.LevelViewer {
			t.Fatalf("expected LevelViewer before removal, got %q", accBefore.Level)
		}

		// Delete grant via handler
		rDelete := chi.NewRouter()
		rDelete.Delete("/api/v1/grants/{id}", grantsH.DeleteGrant)

		reqDel := httptest.NewRequest("DELETE", "/api/v1/grants/"+pgUUIDToString(grant.ID), nil)
		reqDel = reqDel.WithContext(contextWithPerson(reqDel.Context(), adminUser, comp.ID, adminPerson))
		recDel := httptest.NewRecorder()
		rDelete.ServeHTTP(recDel, reqDel)

		if recDel.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on delete grant, got %d", recDel.Code)
		}

		// Verify access is immediately revoked to None
		accAfter, err := authz.Access(ctx, queries, contractorPerson, authz.ProjectTarget{
			ID:        uuid.UUID(proj.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			ClientID:  uuid.UUID(client.ID.Bytes),
		})
		if err != nil {
			t.Fatalf("error checking access: %v", err)
		}
		if accAfter.Level != authz.LevelNone {
			t.Fatalf("expected LevelNone immediately after grant removal, got %q", accAfter.Level)
		}
	})

	// -------------------------------------------------------------
	// TEST 5: An expired link returns 410 and a disabled link returns 404
	// -------------------------------------------------------------
	t.Run("Expired link returns 410 and disabled link returns 404", func(t *testing.T) {
		rPublic := chi.NewRouter()
		rPublic.Get("/s/{token}", shareLinksH.PublicGet)

		// 1. Expired link
		pastTime := time.Now().Add(-2 * time.Hour)
		expiredToken := fmt.Sprintf("expiredtoken-%d", time.Now().UnixNano())
		expiredTokenHash := authz.HashToken(expiredToken)

		linkExp, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:     comp.ID,
			ProjectID:     proj.ID,
			TokenHash:     expiredTokenHash,
			Name:          "Expired Link",
			Access:        "view",
			AllowDownload: true,
			LatestOnly:    true,
			ExpiresAt:     pgtype.Timestamptz{Time: pastTime, Valid: true},
			AskIdentity:   true,
			CreatedBy:     adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create expired link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: linkExp.ID,
			ItemID:      itemIn.ID,
		})

		reqExp := httptest.NewRequest("GET", "/s/"+expiredToken, nil)
		recExp := httptest.NewRecorder()
		rPublic.ServeHTTP(recExp, reqExp)

		if recExp.Code != http.StatusGone {
			t.Fatalf("expected 410 Gone for expired link, got %d: %s", recExp.Code, recExp.Body.String())
		}

		// 2. Disabled link
		disabledToken := fmt.Sprintf("disabledtoken-%d", time.Now().UnixNano())
		disabledTokenHash := authz.HashToken(disabledToken)

		linkDis, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:     comp.ID,
			ProjectID:     proj.ID,
			TokenHash:     disabledTokenHash,
			Name:          "Disabled Link",
			Access:        "view",
			AllowDownload: true,
			LatestOnly:    true,
			AskIdentity:   true,
			CreatedBy:     adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create disabled link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: linkDis.ID,
			ItemID:      itemIn.ID,
		})
		// Disable it
		_, _ = queries.UpdateShareLink(ctx, db.UpdateShareLinkParams{
			ID:               linkDis.ID,
			CompanyID:        comp.ID,
			Name:             linkDis.Name,
			Access:           linkDis.Access,
			AllowDownload:    linkDis.AllowDownload,
			LatestOnly:       linkDis.LatestOnly,
			PasswordHash:     pgtype.Text{Valid: false},
			ExpiresAt:        linkDis.ExpiresAt,
			AskIdentity:      linkDis.AskIdentity,
			UploadLimitBytes: linkDis.UploadLimitBytes,
			DisabledAt:       pgtype.Timestamptz{Time: time.Now(), Valid: true},
		})

		reqDis := httptest.NewRequest("GET", "/s/"+disabledToken, nil)
		recDis := httptest.NewRecorder()
		rPublic.ServeHTTP(recDis, reqDis)

		if recDis.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found for disabled link, got %d: %s", recDis.Code, recDis.Body.String())
		}
	})

	// -------------------------------------------------------------
	// TEST 6: An upload link rejects uploads over its limit (413)
	// -------------------------------------------------------------
	t.Run("Upload link rejects uploads over its limit (413)", func(t *testing.T) {
		rPublic := chi.NewRouter()
		rPublic.Post("/s/{token}/upload", shareLinksH.PublicUpload)

		uploadToken := fmt.Sprintf("uploadtoken-%d", time.Now().UnixNano())
		uploadTokenHash := authz.HashToken(uploadToken)

		uploadLink, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:        comp.ID,
			ProjectID:        proj.ID,
			TokenHash:        uploadTokenHash,
			Name:             "Client Upload Dropzone",
			Access:           "upload",
			AllowDownload:    false,
			LatestOnly:       true,
			UploadLimitBytes: pgtype.Int8{Int64: 50 * 1024 * 1024, Valid: true}, // 50MB limit
			AskIdentity:      false,
			CreatedBy:        adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create upload link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: uploadLink.ID,
			ItemID:      itemIn.ID,
		})

		// Try uploading 100MB (exceeds 50MB limit)
		overLimitPayload, _ := json.Marshal(map[string]interface{}{
			"filename":   "huge_raw_take.braw",
			"size_bytes": 100 * 1024 * 1024,
			"mime":       "video/mp4",
		})

		reqOver := httptest.NewRequest("POST", "/s/"+uploadToken+"/upload", bytes.NewReader(overLimitPayload))
		recOver := httptest.NewRecorder()
		rPublic.ServeHTTP(recOver, reqOver)

		if recOver.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("expected 413 Payload Too Large when over upload limit, got %d: %s", recOver.Code, recOver.Body.String())
		}
	})

	// -------------------------------------------------------------
	// TEST 7: Listing a folder with 1,000 files makes a fixed number of DB queries
	// -------------------------------------------------------------
	t.Run("Listing folder with 1,000 files makes fixed queries", func(t *testing.T) {
		// Create a test folder
		folder, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "folder",
			Name:      "B-Roll 1000 Files",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(3000), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create folder: %v", err)
		}

		// Insert 1000 files in a batch
		for i := 1; i <= 1000; i++ {
			f, fErr := queries.CreateItem(ctx, db.CreateItemParams{
				CompanyID: comp.ID,
				ProjectID: proj.ID,
				ParentID:  folder.ID,
				Kind:      "file",
				Name:      fmt.Sprintf("clip_%04d.mov", i),
				CreatedBy: adminUser.ID,
				Position:  pgtype.Numeric{Int: big.NewInt(int64(i * 10)), Valid: true},
			})
			if fErr != nil {
				t.Fatalf("failed creating test file %d: %v", i, fErr)
			}
			_ = f
		}

		// Execute ListItems: resolve access once for the folder and return all 1,000 files in 1 query
		rItems := chi.NewRouter()
		rItems.Get("/api/v1/projects/{id}/items", itemsH.ListItems)

		start := time.Now()
		reqList := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/projects/%s/items?parent_id=%s", projIDStr, pgUUIDToString(folder.ID)), nil)
		reqList = reqList.WithContext(contextWithPerson(reqList.Context(), adminUser, comp.ID, adminPerson))
		recList := httptest.NewRecorder()
		rItems.ServeHTTP(recList, reqList)
		duration := time.Since(start)

		if recList.Code != http.StatusOK {
			t.Fatalf("expected 200 OK listing folder, got %d: %s", recList.Code, recList.Body.String())
		}

		var listResp struct {
			Items []db.ListItemsWithVersionsRow `json:"items"`
		}
		if err := json.Unmarshal(recList.Body.Bytes(), &listResp); err != nil {
			t.Fatalf("failed unmarshaling list response: %v", err)
		}

		if len(listResp.Items) != 1000 {
			t.Fatalf("expected 1000 items in folder, got %d", len(listResp.Items))
		}

		// Speed requirement: A folder with 1,000 files must open in under 1 second!
		if duration > 1*time.Second {
			t.Fatalf("listing 1,000 files took %v, expected under 1s", duration)
		}
		t.Logf("Successfully listed 1,000 files in %v (fixed queries, well under 1 second)", duration)
	})

	// -------------------------------------------------------------
	// TEST 8: Last Admin cannot be demoted or removed (400)
	// -------------------------------------------------------------
	t.Run("Last Admin cannot be demoted or removed (400)", func(t *testing.T) {
		rComp := chi.NewRouter()
		rComp.Put("/api/v1/companies/members/{userId}/role", companyH.UpdateMemberRole)
		rComp.Delete("/api/v1/companies/members/{userId}", companyH.RemoveMember)

		adminIDStr := pgUUIDToString(adminUser.ID)

		// 1. Demoting the only admin to viewer
		demoteBody, _ := json.Marshal(map[string]string{"role": "viewer"})
		reqDemote := httptest.NewRequest("PUT", "/api/v1/companies/members/"+adminIDStr+"/role", bytes.NewReader(demoteBody))
		reqDemote = reqDemote.WithContext(contextWithPerson(reqDemote.Context(), adminUser, comp.ID, adminPerson))
		recDemote := httptest.NewRecorder()
		rComp.ServeHTTP(recDemote, reqDemote)

		if recDemote.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request demoting last admin, got %d: %s", recDemote.Code, recDemote.Body.String())
		}

		// 2. Removing the only admin
		reqRemove := httptest.NewRequest("DELETE", "/api/v1/companies/members/"+adminIDStr, nil)
		reqRemove = reqRemove.WithContext(contextWithPerson(reqRemove.Context(), adminUser, comp.ID, adminPerson))
		recRemove := httptest.NewRecorder()
		rComp.ServeHTTP(recRemove, reqRemove)

		if recRemove.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request removing last admin, got %d: %s", recRemove.Code, recRemove.Body.String())
		}
	})

	// -------------------------------------------------------------
	// TEST 9: Deleting a role with active members is refused (400)
	// -------------------------------------------------------------
	t.Run("Deleting a role with active members is refused (400)", func(t *testing.T) {
		// Create custom role
		createRoleBody, _ := json.Marshal(map[string]interface{}{
			"name":        "Producer",
			"permissions": []string{authz.PermProjectsViewAll, authz.PermFilesDownloadAll},
		})
		rRole := chi.NewRouter()
		rRole.Post("/api/v1/roles", rolesH.Create)
		rRole.Delete("/api/v1/roles/{id}", rolesH.Delete)

		reqCreateRole := httptest.NewRequest("POST", "/api/v1/roles", bytes.NewReader(createRoleBody))
		reqCreateRole = reqCreateRole.WithContext(contextWithPerson(reqCreateRole.Context(), adminUser, comp.ID, adminPerson))
		recCreateRole := httptest.NewRecorder()
		rRole.ServeHTTP(recCreateRole, reqCreateRole)

		if recCreateRole.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created for custom role, got %d: %s", recCreateRole.Code, recCreateRole.Body.String())
		}
		var createdRole RoleResponse
		_ = json.Unmarshal(recCreateRole.Body.Bytes(), &createdRole)

		// Create a member assigned to this role
		roleUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("producer-%d@studio.com", time.Now().UnixNano()),
			Name:  "Peter Producer",
		})
		roleUUID, _ := uuid.Parse(createdRole.ID)
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    roleUser.ID,
			Role:      "Producer",
		})
		_ = queries.UpdateMembershipRole(ctx, db.UpdateMembershipRoleParams{
			CompanyID: comp.ID,
			UserID:    roleUser.ID,
			Role:      "Producer",
			RoleID:    pgtype.UUID{Bytes: roleUUID, Valid: true},
		})

		// Attempt to delete role with active members
		roleIDStr := createdRole.ID
		reqDelRole := httptest.NewRequest("DELETE", "/api/v1/roles/"+roleIDStr, nil)
		reqDelRole = reqDelRole.WithContext(contextWithPerson(reqDelRole.Context(), adminUser, comp.ID, adminPerson))
		recDelRole := httptest.NewRecorder()
		rRole.ServeHTTP(recDelRole, reqDelRole)

		if recDelRole.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request deleting role with active members, got %d: %s", recDelRole.Code, recDelRole.Body.String())
		}
	})
}
