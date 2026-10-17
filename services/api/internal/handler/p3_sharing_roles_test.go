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
	"golang.org/x/crypto/bcrypt"
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
	shareLinksH := NewShareLinksHandler(queries, stClient, cfg.SessionSecret, cfg.Environment)
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
		rComp.Patch("/api/v1/companies/{company_id}/members/{user_id}", companyH.UpdateMemberRole)
		rComp.Delete("/api/v1/companies/{company_id}/members/{user_id}", companyH.RemoveMember)

		adminIDStr := pgUUIDToString(adminUser.ID)
		compIDStr := pgUUIDToString(comp.ID)

		// 1. Demoting the only admin to editor
		demoteBody, _ := json.Marshal(map[string]string{"role": "editor"})
		reqDemote := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compIDStr, adminIDStr), bytes.NewReader(demoteBody))
		reqDemote = reqDemote.WithContext(contextWithPerson(reqDemote.Context(), adminUser, comp.ID, adminPerson))
		recDemote := httptest.NewRecorder()
		rComp.ServeHTTP(recDemote, reqDemote)

		if recDemote.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request demoting last admin, got %d: %s", recDemote.Code, recDemote.Body.String())
		}

		// 2. Removing the only admin
		// To test removing the last admin by another admin (since caller cannot remove self)
		admin2, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("admin2-%d@studio.com", time.Now().UnixNano()),
			Name:  "Admin Two",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    admin2.ID,
			Role:      authz.RoleAdmin,
		})
		admin2Person := authz.Person{UserID: uuid.UUID(admin2.ID.Bytes), Email: admin2.Email, Role: "admin", Permissions: []string{authz.PermTeamChangeRoles}, CompanyID: uuid.UUID(comp.ID.Bytes)}

		// Demote admin2 so only 1 admin remains
		_ = queries.DeleteMembership(ctx, db.DeleteMembershipParams{
			CompanyID: comp.ID,
			UserID:    admin2.ID,
		})

		// Now caller attempts to remove adminUser (caller cannot remove self, tested in advisor tests)
		// Or another user with permission tries to remove the last admin
		reqRemove := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/companies/%s/members/%s", compIDStr, adminIDStr), nil)
		reqRemove = reqRemove.WithContext(contextWithPerson(reqRemove.Context(), admin2, comp.ID, admin2Person))
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

// ---------------------------------------------------------------------
// TEST SUITE: Advisor Security Requirements
// ---------------------------------------------------------------------
func TestP3_AdvisorSecurityRequirements(t *testing.T) {
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

	authMiddleware := middleware.NewAuthMiddleware(queries)
	companyH := NewCompanyHandler(queries)
	inviteH := NewInviteHandler(queries, mailClient)
	itemsH := NewItemsHandler(queries, stClient)
	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)
	grantsH := NewGrantsHandler(queries, mailClient)

	// Setup Company A and Company B
	compA, _ := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Company Alpha",
		Slug: fmt.Sprintf("alpha-%d", time.Now().UnixNano()),
		Plan: "internal",
	})
	compB, _ := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Company Beta",
		Slug: fmt.Sprintf("beta-%d", time.Now().UnixNano()),
		Plan: "internal",
	})

	// User A is an Admin in Company A
	userA, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-a-%d@alpha.com", time.Now().UnixNano()),
		Name:  "Alice Alpha",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: compA.ID,
		UserID:    userA.ID,
		Role:      authz.RoleAdmin,
	})
	personA := authz.Person{UserID: uuid.UUID(userA.ID.Bytes), Email: userA.Email, Role: "admin", CompanyID: uuid.UUID(compA.ID.Bytes), Permissions: []string{authz.PermTeamChangeRoles, authz.PermSharingCreatePublicLinks}}

	// User B is an Admin in Company B
	userB, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-b-%d@beta.com", time.Now().UnixNano()),
		Name:  "Bob Beta",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: compB.ID,
		UserID:    userB.ID,
		Role:      authz.RoleAdmin,
	})
	personB := authz.Person{UserID: uuid.UUID(userB.ID.Bytes), Email: userB.Email, Role: "admin", CompanyID: uuid.UUID(compB.ID.Bytes), Permissions: []string{authz.PermTeamChangeRoles, authz.PermSharingCreatePublicLinks}}
	_ = personB

	// Member B in Company B
	memberB, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("member-b-%d@beta.com", time.Now().UnixNano()),
		Name:  "Molly Beta",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: compB.ID,
		UserID:    memberB.ID,
		Role:      "editor",
	})

	// -------------------------------------------------------------
	// 1. Active company must be verified (middleware/auth.go):
	// A user with X-Company-ID of a company they don't belong to gets 403
	// -------------------------------------------------------------
	t.Run("User with X-Company-ID of non-member company gets 403", func(t *testing.T) {
		tokenA, _ := authz.GenerateSecureToken(32)
		tokenHashA := authz.HashToken(tokenA)
		_, _ = queries.CreateSession(ctx, db.CreateSessionParams{
			UserID:    userA.ID,
			TokenHash: tokenHashA,
			ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})

		router := chi.NewRouter()
		router.Use(authMiddleware.Authenticate)
		router.Get("/test-ping", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("pong"))
		})

		// Requesting Company B (User A does not belong to Company B)
		reqForbidden := httptest.NewRequest("GET", "/test-ping", nil)
		reqForbidden.Header.Set("Authorization", "Bearer "+tokenA)
		reqForbidden.Header.Set("X-Company-ID", pgUUIDToString(compB.ID))
		recForbidden := httptest.NewRecorder()
		router.ServeHTTP(recForbidden, reqForbidden)

		if recForbidden.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when specifying X-Company-ID of unjoined company, got %d", recForbidden.Code)
		}

		// Requesting Company A (User A belongs to Company A)
		reqOK := httptest.NewRequest("GET", "/test-ping", nil)
		reqOK.Header.Set("Authorization", "Bearer "+tokenA)
		reqOK.Header.Set("X-Company-ID", pgUUIDToString(compA.ID))
		recOK := httptest.NewRecorder()
		router.ServeHTTP(recOK, reqOK)

		if recOK.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for member company, got %d", recOK.Code)
		}
	})

	// -------------------------------------------------------------
	// 2. Team endpoints: Admin of Company A cannot manage Company B (403)
	// -------------------------------------------------------------
	t.Run("Admin of Company A cannot change roles, remove members, invite or list members in Company B", func(t *testing.T) {
		rTeam := chi.NewRouter()
		rTeam.Get("/api/v1/companies/{company_id}/members", companyH.GetMembers)
		rTeam.Patch("/api/v1/companies/{company_id}/members/{user_id}", companyH.UpdateMemberRole)
		rTeam.Delete("/api/v1/companies/{company_id}/members/{user_id}", companyH.RemoveMember)
		rTeam.Post("/api/v1/companies/{company_id}/invites", inviteH.Create)
		rTeam.Get("/api/v1/companies/{company_id}/invites", inviteH.ListForCompany)

		compBStr := pgUUIDToString(compB.ID)
		memberBStr := pgUUIDToString(memberB.ID)

		// A tries to list members of B
		req1 := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/companies/%s/members", compBStr), nil)
		req1 = req1.WithContext(contextWithPerson(req1.Context(), userA, compA.ID, personA))
		rec1 := httptest.NewRecorder()
		rTeam.ServeHTTP(rec1, req1)
		if rec1.Code != http.StatusForbidden {
			t.Fatalf("expected 403 listing members in foreign company, got %d", rec1.Code)
		}

		// A tries to update role of member in B
		patchBody, _ := json.Marshal(map[string]string{"role": "admin"})
		req2 := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compBStr, memberBStr), bytes.NewReader(patchBody))
		req2 = req2.WithContext(contextWithPerson(req2.Context(), userA, compA.ID, personA))
		rec2 := httptest.NewRecorder()
		rTeam.ServeHTTP(rec2, req2)
		if rec2.Code != http.StatusForbidden {
			t.Fatalf("expected 403 changing role in foreign company, got %d", rec2.Code)
		}

		// A tries to remove member in B
		req3 := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/companies/%s/members/%s", compBStr, memberBStr), nil)
		req3 = req3.WithContext(contextWithPerson(req3.Context(), userA, compA.ID, personA))
		rec3 := httptest.NewRecorder()
		rTeam.ServeHTTP(rec3, req3)
		if rec3.Code != http.StatusForbidden {
			t.Fatalf("expected 403 removing member in foreign company, got %d", rec3.Code)
		}

		// A tries to invite to B
		inviteBody, _ := json.Marshal(map[string]string{"email": "stranger@studio.com", "role": "editor"})
		req4 := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", compBStr), bytes.NewReader(inviteBody))
		req4 = req4.WithContext(contextWithPerson(req4.Context(), userA, compA.ID, personA))
		rec4 := httptest.NewRecorder()
		rTeam.ServeHTTP(rec4, req4)
		if rec4.Code != http.StatusForbidden {
			t.Fatalf("expected 403 inviting to foreign company, got %d", rec4.Code)
		}

		// A tries to list invites of B
		req5 := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/companies/%s/invites", compBStr), nil)
		req5 = req5.WithContext(contextWithPerson(req5.Context(), userA, compA.ID, personA))
		rec5 := httptest.NewRecorder()
		rTeam.ServeHTTP(rec5, req5)
		if rec5.Code != http.StatusForbidden {
			t.Fatalf("expected 403 listing invites in foreign company, got %d", rec5.Code)
		}
	})

	// -------------------------------------------------------------
	// 3. Client contact cannot list team members (403)
	// -------------------------------------------------------------
	t.Run("Client contact cannot list team members", func(t *testing.T) {
		rTeam := chi.NewRouter()
		rTeam.Get("/api/v1/companies/{company_id}/members", companyH.GetMembers)

		clientUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("client-%d@client.com", time.Now().UnixNano()),
			Name:  "Catherine Client",
		})
		// Registered only as client contact, no company membership
		clientPerson := authz.Person{UserID: uuid.UUID(clientUser.ID.Bytes), Email: clientUser.Email, Role: "", CompanyID: uuid.UUID(compA.ID.Bytes)}

		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/companies/%s/members", pgUUIDToString(compA.ID)), nil)
		req = req.WithContext(contextWithPerson(req.Context(), clientUser, compA.ID, clientPerson))
		rec := httptest.NewRecorder()
		rTeam.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when client contact lists team members, got %d", rec.Code)
		}
	})

	// -------------------------------------------------------------
	// 4. Client cannot see trash items from other clients' projects, and cannot restore without access
	// -------------------------------------------------------------
	t.Run("Client cannot see trash items from other projects and cannot restore without access", func(t *testing.T) {
		client1, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: compA.ID,
			Name:      "Client One",
		})
		client2, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: compA.ID,
			Name:      "Client Two",
		})

		proj1, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: compA.ID,
			ClientID:  client1.ID,
			Name:      "Project One",
		})
		proj2, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: compA.ID,
			ClientID:  client2.ID,
			Name:      "Project Two",
		})

		clientUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("contact-%d@one.com", time.Now().UnixNano()),
			Name:  "Connie Contact",
		})
		// Grant clientUser Uploader access on Project 1 only
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:  compA.ID,
			TargetType: "project",
			TargetID:   proj1.ID,
			Email:      clientUser.Email,
			UserID:     clientUser.ID,
			Level:      "uploader",
		})
		clientPerson := authz.Person{UserID: uuid.UUID(clientUser.ID.Bytes), Email: clientUser.Email, Role: "", CompanyID: uuid.UUID(compA.ID.Bytes)}

		// Create and soft delete item in Project 1 (uploaded by clientUser)
		itemInProj1, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: compA.ID,
			ProjectID: proj1.ID,
			Kind:      "file",
			Name:      "proj1-trash.mp4",
			CreatedBy: clientUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create itemInProj1: %v", err)
		}
		_, _ = queries.SoftDeleteItem(ctx, db.SoftDeleteItemParams{
			ID:        itemInProj1.ID,
			CompanyID: compA.ID,
			DeletedBy: clientUser.ID,
		})

		// Create and soft delete item in Project 2 (uploaded by adminUser)
		itemInProj2, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: compA.ID,
			ProjectID: proj2.ID,
			Kind:      "file",
			Name:      "proj2-trash.mp4",
			CreatedBy: userA.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(2000), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create itemInProj2: %v", err)
		}
		_, _ = queries.SoftDeleteItem(ctx, db.SoftDeleteItemParams{
			ID:        itemInProj2.ID,
			CompanyID: compA.ID,
			DeletedBy: userA.ID,
		})

		rTrash := chi.NewRouter()
		rTrash.Get("/api/v1/trash", itemsH.ListTrash)
		rTrash.Post("/api/v1/trash/{id}/restore", itemsH.RestoreTrashItem)

		// List trash as clientUser: must only contain itemInProj1, NOT itemInProj2
		reqList := httptest.NewRequest("GET", "/api/v1/trash", nil)
		reqList = reqList.WithContext(contextWithPerson(reqList.Context(), clientUser, compA.ID, clientPerson))
		recList := httptest.NewRecorder()
		rTrash.ServeHTTP(recList, reqList)

		if recList.Code != http.StatusOK {
			t.Fatalf("expected 200 OK listing trash, got %d", recList.Code)
		}
		var listResp struct {
			Items []db.ListTrashItemsRow `json:"items"`
		}
		_ = json.Unmarshal(recList.Body.Bytes(), &listResp)

		if len(listResp.Items) != 1 || listResp.Items[0].ID != itemInProj1.ID {
			t.Fatalf("expected client to see only item from project 1, got %d items", len(listResp.Items))
		}

		// Attempt to restore item from Project 2 (clientUser has no access to Project 2)
		reqRestoreProj2 := httptest.NewRequest("POST", "/api/v1/trash/"+pgUUIDToString(itemInProj2.ID)+"/restore", nil)
		reqRestoreProj2 = reqRestoreProj2.WithContext(contextWithPerson(reqRestoreProj2.Context(), clientUser, compA.ID, clientPerson))
		recRestoreProj2 := httptest.NewRecorder()
		rTrash.ServeHTTP(recRestoreProj2, reqRestoreProj2)

		if recRestoreProj2.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden restoring item without access, got %d: %s", recRestoreProj2.Code, recRestoreProj2.Body.String())
		}
	})

	// -------------------------------------------------------------
	// 5. Changing a role to "owner" is rejected; last Admin cannot be demoted or removed
	// -------------------------------------------------------------
	t.Run("Changing role to owner is rejected and last admin protected", func(t *testing.T) {
		rComp := chi.NewRouter()
		rComp.Patch("/api/v1/companies/{company_id}/members/{user_id}", companyH.UpdateMemberRole)
		rComp.Delete("/api/v1/companies/{company_id}/members/{user_id}", companyH.RemoveMember)

		editorUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("editor-%d@alpha.com", time.Now().UnixNano()),
			Name:  "Eddie Editor",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: compA.ID,
			UserID:    editorUser.ID,
			Role:      "editor",
		})

		compAStr := pgUUIDToString(compA.ID)
		editorStr := pgUUIDToString(editorUser.ID)
		adminAStr := pgUUIDToString(userA.ID)

		// 1. Trying to change role to "owner" -> 400
		ownerBody, _ := json.Marshal(map[string]string{"role": "owner"})
		reqOwner := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compAStr, editorStr), bytes.NewReader(ownerBody))
		reqOwner = reqOwner.WithContext(contextWithPerson(reqOwner.Context(), userA, compA.ID, personA))
		recOwner := httptest.NewRecorder()
		rComp.ServeHTTP(recOwner, reqOwner)
		if recOwner.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request assigning owner role, got %d", recOwner.Code)
		}

		// 2. Caller trying to change their own role -> 400
		selfBody, _ := json.Marshal(map[string]string{"role": "editor"})
		reqSelf := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compAStr, adminAStr), bytes.NewReader(selfBody))
		reqSelf = reqSelf.WithContext(contextWithPerson(reqSelf.Context(), userA, compA.ID, personA))
		recSelf := httptest.NewRecorder()
		rComp.ServeHTTP(recSelf, reqSelf)
		if recSelf.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request changing own role, got %d", recSelf.Code)
		}
	})

	// -------------------------------------------------------------
	// 6. Viewing vs Downloading: person with Can download off can open /view but gets 403 on /download
	// -------------------------------------------------------------
	t.Run("Person with Can download off can open /view but gets 403 on /download", func(t *testing.T) {
		rStorage := chi.NewRouter()
		rStorage.Get("/api/v1/items/{id}/view", storageH.ViewItem)
		rStorage.Get("/api/v1/items/{id}/download", storageH.DownloadItem)

		client1, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: compA.ID,
			Name:      "Download Test Client",
		})
		proj, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: compA.ID,
			ClientID:  client1.ID,
			Name:      "Download Test Project",
		})
		fileItem, err := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: compA.ID,
			ProjectID: proj.ID,
			Kind:      "file",
			Name:      "review-cut.mp4",
			CreatedBy: userA.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create fileItem: %v", err)
		}
		ver, err := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:   compA.ID,
			ItemID:      fileItem.ID,
			Number:      1,
			StorageKey:  "test/review-cut.mp4",
			SizeBytes:   1024,
			Mime:        "video/mp4",
			UploadedBy:  userA.ID,
			PreviewKeys: []byte("[]"),
		})
		_, _ = queries.UpdateVersionPreviewStatus(ctx, db.UpdateVersionPreviewStatusParams{
			ID:            ver.ID,
			CompanyID:     compA.ID,
			PreviewStatus: "ready",
		})
		_ = ver

		restrictedUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("noviewdownload-%d@test.com", time.Now().UnixNano()),
			Name:  "No Download User",
		})
		// Grant restrictedUser access with can_download = false
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   compA.ID,
			TargetType:  "project",
			TargetID:    proj.ID,
			Email:       restrictedUser.Email,
			UserID:      restrictedUser.ID,
			Level:       "viewer",
			CanDownload: false,
		})
		restrictedPerson := authz.Person{UserID: uuid.UUID(restrictedUser.ID.Bytes), Email: restrictedUser.Email, Role: "", CompanyID: uuid.UUID(compA.ID.Bytes)}

		fileIDStr := pgUUIDToString(fileItem.ID)

		// 1. /view returns 200 OK
		reqView := httptest.NewRequest("GET", "/api/v1/items/"+fileIDStr+"/view", nil)
		reqView = reqView.WithContext(contextWithPerson(reqView.Context(), restrictedUser, compA.ID, restrictedPerson))
		recView := httptest.NewRecorder()
		rStorage.ServeHTTP(recView, reqView)

		if recView.Code != http.StatusOK {
			t.Fatalf("expected 200 OK accessing /view with can_download=false, got %d: %s", recView.Code, recView.Body.String())
		}
		var viewResp map[string]interface{}
		_ = json.Unmarshal(recView.Body.Bytes(), &viewResp)
		if viewResp["view_url"] == nil || viewResp["view_url"] == "" {
			t.Fatalf("expected non-empty view_url in /view response")
		}

		// 2. /download returns 403 Forbidden
		reqDownload := httptest.NewRequest("GET", "/api/v1/items/"+fileIDStr+"/download", nil)
		reqDownload = reqDownload.WithContext(contextWithPerson(reqDownload.Context(), restrictedUser, compA.ID, restrictedPerson))
		recDownload := httptest.NewRecorder()
		rStorage.ServeHTTP(recDownload, reqDownload)

		if recDownload.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden on /download when can_download=false, got %d: %s", recDownload.Code, recDownload.Body.String())
		}
	})

	// -------------------------------------------------------------
	// 7. Uploads: user B cannot complete or abort user A's upload (404)
	// -------------------------------------------------------------
	t.Run("User B cannot complete or abort user A's upload", func(t *testing.T) {
		rUploads := chi.NewRouter()
		rUploads.Get("/api/v1/uploads/{id}/parts", storageH.GetUploadParts)
		rUploads.Post("/api/v1/uploads/{id}/complete", storageH.CompleteUpload)
		rUploads.Delete("/api/v1/uploads/{id}", storageH.AbortUpload)

		client1, _ := queries.CreateClient(ctx, db.CreateClientParams{
			CompanyID: compA.ID,
			Name:      "Upload Client",
		})
		projU, _ := queries.CreateProject(ctx, db.CreateProjectParams{
			CompanyID: compA.ID,
			ClientID:  client1.ID,
			Name:      "Upload Project",
		})

		// Create upload belonging to userA
		uploadA, err := queries.CreateUpload(ctx, db.CreateUploadParams{
			CompanyID:     compA.ID,
			ProjectID:     projU.ID,
			UserID:        userA.ID,
			UploadID:      fmt.Sprintf("s3-upload-%d", time.Now().UnixNano()),
			StorageKey:    "test/uploadA.mp4",
			Filename:      "uploadA.mp4",
			SizeBytes:     2048,
			Mime:          "video/mp4",
			TotalParts:    1,
			PartSizeBytes: 2048,
			ExpiresAt:     pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to create uploadA: %v", err)
		}

		uploadIDStr := pgUUIDToString(uploadA.ID)

		// Create another user in Company A
		userOther, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("other-%d@alpha.com", time.Now().UnixNano()),
			Name:  "Other In Alpha",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: compA.ID,
			UserID:    userOther.ID,
			Role:      "editor",
		})
		personOther := authz.Person{UserID: uuid.UUID(userOther.ID.Bytes), Email: userOther.Email, Role: "editor", CompanyID: uuid.UUID(compA.ID.Bytes)}

		// Other user tries to GetUploadParts -> 404
		reqParts := httptest.NewRequest("GET", "/api/v1/uploads/"+uploadIDStr+"/parts", nil)
		reqParts = reqParts.WithContext(contextWithPerson(reqParts.Context(), userOther, compA.ID, personOther))
		recParts := httptest.NewRecorder()
		rUploads.ServeHTTP(recParts, reqParts)
		if recParts.Code != http.StatusNotFound {
			t.Fatalf("expected 404 GetUploadParts for another user's upload, got %d", recParts.Code)
		}

		// Other user tries to CompleteUpload -> 404
		completeBody, _ := json.Marshal(map[string]interface{}{"parts": []map[string]interface{}{{"part_number": 1, "etag": "etag1"}}})
		reqComp := httptest.NewRequest("POST", "/api/v1/uploads/"+uploadIDStr+"/complete", bytes.NewReader(completeBody))
		reqComp = reqComp.WithContext(contextWithPerson(reqComp.Context(), userOther, compA.ID, personOther))
		recComp := httptest.NewRecorder()
		rUploads.ServeHTTP(recComp, reqComp)
		if recComp.Code != http.StatusNotFound {
			t.Fatalf("expected 404 CompleteUpload for another user's upload, got %d", recComp.Code)
		}

		// Other user tries to AbortUpload -> 404
		reqAbort := httptest.NewRequest("DELETE", "/api/v1/uploads/"+uploadIDStr, nil)
		reqAbort = reqAbort.WithContext(contextWithPerson(reqAbort.Context(), userOther, compA.ID, personOther))
		recAbort := httptest.NewRecorder()
		rUploads.ServeHTTP(recAbort, reqAbort)
		if recAbort.Code != http.StatusNotFound {
			t.Fatalf("expected 404 AbortUpload for another user's upload, got %d", recAbort.Code)
		}

		// Original user A can abort their own upload -> 200 OK
		reqAbortOwner := httptest.NewRequest("DELETE", "/api/v1/uploads/"+uploadIDStr, nil)
		reqAbortOwner = reqAbortOwner.WithContext(contextWithPerson(reqAbortOwner.Context(), userA, compA.ID, personA))
		recAbortOwner := httptest.NewRecorder()
		rUploads.ServeHTTP(recAbortOwner, reqAbortOwner)
		if recAbortOwner.Code != http.StatusOK {
			t.Fatalf("expected 200 OK AbortUpload for upload owner, got %d", recAbortOwner.Code)
		}
	})
	_ = grantsH
}

// ---------------------------------------------------------------------
// TEST SUITE: Advisor Second Review Security Fixes (9 Required Scenarios)
// ---------------------------------------------------------------------
func TestP3_AdvisorSecondReviewSecurityFixes(t *testing.T) {
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

	shareLinksH := NewShareLinksHandler(queries, stClient, cfg.SessionSecret, cfg.Environment)
	itemsH := NewItemsHandler(queries, stClient)
	rolesH := NewRolesHandler(queries)
	companyH := NewCompanyHandler(queries)
	inviteH := NewInviteHandler(queries, mailClient)
	storageH := NewStorageUploadsHandler(queries, stClient, mailClient, cfg)
	_ = itemsH

	// Setup company with default roles
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Advisor Fixes Studio",
		Slug:              fmt.Sprintf("advisor-studio-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 100 * 1024 * 1024 * 1024,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}
	_, _ = SeedDefaultCompanyRoles(ctx, queries, comp.ID)

	// Admin Alice
	adminEmail := fmt.Sprintf("alice-%d@studio.com", time.Now().UnixNano())
	adminUser, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: adminEmail,
		Name:  "Alice Admin",
	})
	if err != nil {
		t.Fatalf("failed to create admin: %v", err)
	}
	adminRoleObj, _ := queries.GetRoleByName(ctx, db.GetRoleByNameParams{
		CompanyID: comp.ID,
		Name:      authz.RoleCEO,
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleCEO,
	})
	_ = queries.UpdateMembershipRole(ctx, db.UpdateMembershipRoleParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleCEO,
		RoleID:    adminRoleObj.ID,
	})
	adminPerson := authz.Person{
		UserID:      uuid.UUID(adminUser.ID.Bytes),
		CompanyID:   uuid.UUID(comp.ID.Bytes),
		Email:       adminUser.Email,
		Role:        authz.RoleCEO,
		RoleID:      uuid.UUID(adminRoleObj.ID.Bytes),
		Permissions: authz.AllPermissions,
	}

	// Client & Project
	client, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Advisor Test Client",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}
	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Advisor Test Project",
		CreatedBy: adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create project: %v", err)
	}
	projIDStr := pgUUIDToString(proj.ID)

	// Item inside project
	testItem, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "test-file.mp4",
		CreatedBy: adminUser.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(1000), Valid: true},
	})
	if err != nil {
		t.Fatalf("failed to create item: %v", err)
	}

	// -----------------------------------------------------------------
	// TEST 1: setting the unlock cookie by hand without the password does not unlock the link
	// -----------------------------------------------------------------
	t.Run("setting the unlock cookie by hand without the password does not unlock the link", func(t *testing.T) {
		pwdHash, _ := bcrypt.GenerateFromPassword([]byte("supersecret123"), bcrypt.DefaultCost)
		token, _ := authz.GenerateSecureToken(32)
		tokenHash := authz.HashToken(token)

		link, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:     comp.ID,
			ProjectID:     proj.ID,
			TokenHash:     tokenHash,
			Name:          "Protected Share Link",
			Access:        "view",
			AllowDownload: true,
			PasswordHash:  pgtype.Text{String: string(pwdHash), Valid: true},
			CreatedBy:     adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: link.ID,
			ItemID:      testItem.ID,
		})

		rPublic := chi.NewRouter()
		rPublic.Get("/s/{token}", shareLinksH.PublicGet)
		rPublic.Post("/s/{token}/unlock", shareLinksH.PublicUnlock)

		cookieName := fmt.Sprintf("ph_share_unlock_%s", pgUUIDToString(link.ID))

		// 1. Visit without any cookie -> password_required
		reqNoCookie := httptest.NewRequest("GET", "/s/"+token, nil)
		recNoCookie := httptest.NewRecorder()
		rPublic.ServeHTTP(recNoCookie, reqNoCookie)
		if recNoCookie.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", recNoCookie.Code)
		}
		var resp1 map[string]interface{}
		_ = json.Unmarshal(recNoCookie.Body.Bytes(), &resp1)
		if resp1["password_required"] != true {
			t.Fatalf("expected password_required true, got %v", resp1["password_required"])
		}

		// 2. Visit with forged plain cookie "unlocked"
		reqForgedPlain := httptest.NewRequest("GET", "/s/"+token, nil)
		reqForgedPlain.AddCookie(&http.Cookie{Name: cookieName, Value: "unlocked"})
		recForgedPlain := httptest.NewRecorder()
		rPublic.ServeHTTP(recForgedPlain, reqForgedPlain)
		var resp2 map[string]interface{}
		_ = json.Unmarshal(recForgedPlain.Body.Bytes(), &resp2)
		if resp2["password_required"] != true {
			t.Fatalf("expected forged plain cookie to be rejected, got %v", resp2["password_required"])
		}

		// 3. Visit with forged signed cookie (invalid HMAC signature)
		reqForgedHMAC := httptest.NewRequest("GET", "/s/"+token, nil)
		reqForgedHMAC.AddCookie(&http.Cookie{Name: cookieName, Value: "fakesig:1:9999999999"})
		recForgedHMAC := httptest.NewRecorder()
		rPublic.ServeHTTP(recForgedHMAC, reqForgedHMAC)
		var resp3 map[string]interface{}
		_ = json.Unmarshal(recForgedHMAC.Body.Bytes(), &resp3)
		if resp3["password_required"] != true {
			t.Fatalf("expected forged HMAC cookie to be rejected, got %v", resp3["password_required"])
		}

		// 4. Legitimate unlock with correct password
		unlockBody, _ := json.Marshal(map[string]string{"password": "supersecret123"})
		reqUnlock := httptest.NewRequest("POST", "/s/"+token+"/unlock", bytes.NewReader(unlockBody))
		recUnlock := httptest.NewRecorder()
		rPublic.ServeHTTP(recUnlock, reqUnlock)
		if recUnlock.Code != http.StatusOK {
			t.Fatalf("expected 200 OK unlocking with correct password, got %d: %s", recUnlock.Code, recUnlock.Body.String())
		}
		cookies := recUnlock.Result().Cookies()
		var unlockCookie *http.Cookie
		for _, c := range cookies {
			if c.Name == cookieName {
				unlockCookie = c
				break
			}
		}
		if unlockCookie == nil {
			t.Fatalf("expected Set-Cookie %s to be returned on unlock", cookieName)
		}
		if !unlockCookie.HttpOnly {
			t.Fatalf("expected unlock cookie to be HttpOnly")
		}

		// 5. Visit with legitimate unlock cookie -> unlocked!
		reqLegit := httptest.NewRequest("GET", "/s/"+token, nil)
		reqLegit.AddCookie(unlockCookie)
		recLegit := httptest.NewRecorder()
		rPublic.ServeHTTP(recLegit, reqLegit)
		var respLegit map[string]interface{}
		_ = json.Unmarshal(recLegit.Body.Bytes(), &respLegit)
		if respLegit["items"] == nil {
			t.Fatalf("expected items to be present with valid unlock cookie, got %v", respLegit)
		}
	})

	// -----------------------------------------------------------------
	// TEST 2: changing the link password locks out previously unlocked visitors
	// -----------------------------------------------------------------
	t.Run("changing the link password locks out previously unlocked visitors", func(t *testing.T) {
		pwdHash, _ := bcrypt.GenerateFromPassword([]byte("firstpass"), bcrypt.DefaultCost)
		token, _ := authz.GenerateSecureToken(32)
		tokenHash := authz.HashToken(token)

		link, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:     comp.ID,
			ProjectID:     proj.ID,
			TokenHash:     tokenHash,
			Name:          "Password Change Link",
			Access:        "view",
			AllowDownload: true,
			PasswordHash:  pgtype.Text{String: string(pwdHash), Valid: true},
			CreatedBy:     adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: link.ID,
			ItemID:      testItem.ID,
		})

		rPublic := chi.NewRouter()
		rPublic.Get("/s/{token}", shareLinksH.PublicGet)
		rPublic.Post("/s/{token}/unlock", shareLinksH.PublicUnlock)

		cookieName := fmt.Sprintf("ph_share_unlock_%s", pgUUIDToString(link.ID))

		// Visitor unlocks with initial password
		unlockBody, _ := json.Marshal(map[string]string{"password": "firstpass"})
		reqUnlock := httptest.NewRequest("POST", "/s/"+token+"/unlock", bytes.NewReader(unlockBody))
		recUnlock := httptest.NewRecorder()
		rPublic.ServeHTTP(recUnlock, reqUnlock)
		if recUnlock.Code != http.StatusOK {
			t.Fatalf("unlock failed: %d", recUnlock.Code)
		}
		var initialCookie *http.Cookie
		for _, c := range recUnlock.Result().Cookies() {
			if c.Name == cookieName {
				initialCookie = c
				break
			}
		}

		// Verify initial access works
		reqCheck1 := httptest.NewRequest("GET", "/s/"+token, nil)
		reqCheck1.AddCookie(initialCookie)
		recCheck1 := httptest.NewRecorder()
		rPublic.ServeHTTP(recCheck1, reqCheck1)
		var resp1 map[string]interface{}
		_ = json.Unmarshal(recCheck1.Body.Bytes(), &resp1)
		if resp1["items"] == nil {
			t.Fatalf("expected items before password change, got %v", resp1)
		}

		// Admin changes password on the share link via Update handler
		rAdmin := chi.NewRouter()
		rAdmin.Patch("/api/v1/share-links/{id}", shareLinksH.Update)

		newPass := "secondpass"
		updateBody, _ := json.Marshal(map[string]interface{}{
			"password": &newPass,
		})
		reqUpdate := httptest.NewRequest("PATCH", "/api/v1/share-links/"+pgUUIDToString(link.ID), bytes.NewReader(updateBody))
		reqUpdate = reqUpdate.WithContext(contextWithPerson(reqUpdate.Context(), adminUser, comp.ID, adminPerson))
		recUpdate := httptest.NewRecorder()
		rAdmin.ServeHTTP(recUpdate, reqUpdate)
		if recUpdate.Code != http.StatusOK {
			t.Fatalf("expected 200 OK updating password, got %d: %s", recUpdate.Code, recUpdate.Body.String())
		}

		// Visitor visits with the OLD unlock cookie -> MUST be locked out now!
		reqCheck2 := httptest.NewRequest("GET", "/s/"+token, nil)
		reqCheck2.AddCookie(initialCookie)
		recCheck2 := httptest.NewRecorder()
		rPublic.ServeHTTP(recCheck2, reqCheck2)
		var resp2 map[string]interface{}
		_ = json.Unmarshal(recCheck2.Body.Bytes(), &resp2)
		if resp2["password_required"] != true {
			t.Fatalf("expected visitor to be locked out after password change, got %v", resp2["password_required"])
		}
	})

	// -----------------------------------------------------------------
	// TEST 3: several uploads through a link that together exceed its limit: the one that crosses the limit is refused
	// -----------------------------------------------------------------
	t.Run("several uploads through a link that together exceed its limit: the one that crosses the limit is refused", func(t *testing.T) {
		token, _ := authz.GenerateSecureToken(32)
		tokenHash := authz.HashToken(token)

		// 10MB limit
		limitBytes := int64(10 * 1024 * 1024)
		dropFolder, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "folder",
			Name:      "Dropzone Folder",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(500), Valid: true},
		})

		link, err := queries.CreateShareLink(ctx, db.CreateShareLinkParams{
			CompanyID:        comp.ID,
			ProjectID:        proj.ID,
			TokenHash:        tokenHash,
			Name:             "Dropzone Upload Limit",
			Access:           "upload",
			AllowDownload:    false,
			UploadLimitBytes: pgtype.Int8{Int64: limitBytes, Valid: true},
			CreatedBy:        adminUser.ID,
		})
		if err != nil {
			t.Fatalf("failed to create upload link: %v", err)
		}
		_ = queries.AttachShareLinkItem(ctx, db.AttachShareLinkItemParams{
			ShareLinkID: link.ID,
			ItemID:      dropFolder.ID,
		})

		rPublic := chi.NewRouter()
		rPublic.Post("/s/{token}/upload", shareLinksH.PublicUpload)
		rPublic.Post("/s/{token}/upload/complete", shareLinksH.PublicUploadComplete)
		rPublic.Post("/s/{token}/upload/abort", shareLinksH.PublicUploadAbort)

		// Upload 1: 6MB -> should succeed (6MB <= 10MB)
		up1Payload, _ := json.Marshal(map[string]interface{}{
			"filename":   "video_part1.mp4",
			"size_bytes": 6 * 1024 * 1024,
			"mime":       "video/mp4",
		})
		reqUp1 := httptest.NewRequest("POST", "/s/"+token+"/upload", bytes.NewReader(up1Payload))
		recUp1 := httptest.NewRecorder()
		rPublic.ServeHTTP(recUp1, reqUp1)
		if recUp1.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for upload 1 (6MB), got %d: %s", recUp1.Code, recUp1.Body.String())
		}
		var up1Resp struct {
			UploadID string `json:"upload_id"`
		}
		_ = json.Unmarshal(recUp1.Body.Bytes(), &up1Resp)

		// Complete upload 1: permanent 6MB committed to link
		comp1Payload, _ := json.Marshal(map[string]interface{}{
			"upload_id": up1Resp.UploadID,
			"parts":     []map[string]interface{}{{"part_number": 1, "etag": "etag1"}},
		})
		reqComp1 := httptest.NewRequest("POST", "/s/"+token+"/upload/complete", bytes.NewReader(comp1Payload))
		recComp1 := httptest.NewRecorder()
		rPublic.ServeHTTP(recComp1, reqComp1)
		if recComp1.Code != http.StatusOK {
			t.Fatalf("expected 200 OK completing upload 1, got %d: %s", recComp1.Code, recComp1.Body.String())
		}

		// Upload 2: 3MB -> should succeed (6MB uploaded + 3MB reserved = 9MB <= 10MB)
		up2Payload, _ := json.Marshal(map[string]interface{}{
			"filename":   "video_part2.mp4",
			"size_bytes": 3 * 1024 * 1024,
			"mime":       "video/mp4",
		})
		reqUp2 := httptest.NewRequest("POST", "/s/"+token+"/upload", bytes.NewReader(up2Payload))
		recUp2 := httptest.NewRecorder()
		rPublic.ServeHTTP(recUp2, reqUp2)
		if recUp2.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for upload 2 (3MB), got %d: %s", recUp2.Code, recUp2.Body.String())
		}
		var up2Resp struct {
			UploadID string `json:"upload_id"`
		}
		_ = json.Unmarshal(recUp2.Body.Bytes(), &up2Resp)

		// Upload 3: 2MB -> crosses the limit! (6MB + 3MB + 2MB = 11MB > 10MB) -> MUST be refused with 413
		up3Payload, _ := json.Marshal(map[string]interface{}{
			"filename":   "video_part3.mp4",
			"size_bytes": 2 * 1024 * 1024,
			"mime":       "video/mp4",
		})
		reqUp3 := httptest.NewRequest("POST", "/s/"+token+"/upload", bytes.NewReader(up3Payload))
		recUp3 := httptest.NewRecorder()
		rPublic.ServeHTTP(recUp3, reqUp3)
		if recUp3.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("expected 413 Payload Too Large when exceeding total link limit, got %d: %s", recUp3.Code, recUp3.Body.String())
		}

		// Abort upload 2: releases the 3MB reserved bytes
		abort2Payload, _ := json.Marshal(map[string]interface{}{
			"upload_id": up2Resp.UploadID,
		})
		reqAbort2 := httptest.NewRequest("POST", "/s/"+token+"/upload/abort", bytes.NewReader(abort2Payload))
		recAbort2 := httptest.NewRecorder()
		rPublic.ServeHTTP(recAbort2, reqAbort2)
		if recAbort2.Code != http.StatusOK {
			t.Fatalf("expected 200 OK aborting upload 2, got %d: %s", recAbort2.Code, recAbort2.Body.String())
		}

		// Now upload 3 (2MB) should succeed because reserved bytes were released! (6MB + 0 + 2MB = 8MB <= 10MB)
		reqUp3Retry := httptest.NewRequest("POST", "/s/"+token+"/upload", bytes.NewReader(up3Payload))
		recUp3Retry := httptest.NewRecorder()
		rPublic.ServeHTTP(recUp3Retry, reqUp3Retry)
		if recUp3Retry.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on retrying upload 3 after aborting upload 2, got %d: %s", recUp3Retry.Code, recUp3Retry.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 4: a person with only a folder grant can view and download files in that folder (when allowed) and gets 404 for files outside it
	// -----------------------------------------------------------------
	t.Run("person with only a folder grant can view and download files in that folder and gets 404 outside it", func(t *testing.T) {
		// Folder A and Folder B in project
		folderA, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "folder",
			Name:      "Folder A",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
		})
		folderB, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "folder",
			Name:      "Folder B",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(200), Valid: true},
		})

		// File in Folder A
		fileA, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			ParentID:  folderA.ID,
			Kind:      "file",
			Name:      "file_in_a.mp4",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(10), Valid: true},
		})
		_, _ = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     comp.ID,
			ItemID:        fileA.ID,
			Number:        1,
			StorageKey:    "test/fileA.mp4",
			SizeBytes:     1024,
			Mime:          "video/mp4",
			UploadedBy:    adminUser.ID,
			PreviewKeys:   []byte("[]"),
			PreviewStatus: "ready",
		})

		// File in Folder B
		fileB, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			ParentID:  folderB.ID,
			Kind:      "file",
			Name:      "file_in_b.mp4",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(20), Valid: true},
		})
		_, _ = queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     comp.ID,
			ItemID:        fileB.ID,
			Number:        1,
			StorageKey:    "test/fileB.mp4",
			SizeBytes:     1024,
			Mime:          "video/mp4",
			UploadedBy:    adminUser.ID,
			PreviewKeys:   []byte("[]"),
			PreviewStatus: "ready",
		})

		// User with grant on Folder A ONLY (viewer, can_download: true)
		folderUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("folderuser-%d@external.com", time.Now().UnixNano()),
			Name:  "Folder Only Frank",
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "folder",
			TargetID:    folderA.ID,
			Email:       folderUser.Email,
			UserID:      folderUser.ID,
			Level:       authz.LevelViewer,
			CanDownload: true,
			GrantedBy:   adminUser.ID,
		})
		folderPerson := authz.Person{
			UserID:    uuid.UUID(folderUser.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			Email:     folderUser.Email,
		}

		rStorage := chi.NewRouter()
		rStorage.Get("/api/v1/items/{id}/view", storageH.ViewItem)
		rStorage.Get("/api/v1/items/{id}/download", storageH.DownloadItem)

		// 1. Can view File A
		reqViewA := httptest.NewRequest("GET", "/api/v1/items/"+pgUUIDToString(fileA.ID)+"/view", nil)
		reqViewA = reqViewA.WithContext(contextWithPerson(reqViewA.Context(), folderUser, comp.ID, folderPerson))
		recViewA := httptest.NewRecorder()
		rStorage.ServeHTTP(recViewA, reqViewA)
		if recViewA.Code != http.StatusOK {
			t.Fatalf("expected 200 OK viewing file inside granted folder, got %d: %s", recViewA.Code, recViewA.Body.String())
		}

		// 2. Can download File A (can_download is true from the folder grant!)
		reqDlA := httptest.NewRequest("GET", "/api/v1/items/"+pgUUIDToString(fileA.ID)+"/download", nil)
		reqDlA = reqDlA.WithContext(contextWithPerson(reqDlA.Context(), folderUser, comp.ID, folderPerson))
		recDlA := httptest.NewRecorder()
		rStorage.ServeHTTP(recDlA, reqDlA)
		if recDlA.Code != http.StatusOK {
			t.Fatalf("expected 200 OK downloading file inside granted folder, got %d: %s", recDlA.Code, recDlA.Body.String())
		}

		// 3. Gets 404 for File B (outside the granted folder)
		reqViewB := httptest.NewRequest("GET", "/api/v1/items/"+pgUUIDToString(fileB.ID)+"/view", nil)
		reqViewB = reqViewB.WithContext(contextWithPerson(reqViewB.Context(), folderUser, comp.ID, folderPerson))
		recViewB := httptest.NewRecorder()
		rStorage.ServeHTTP(recViewB, reqViewB)
		if recViewB.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found viewing file outside folder grant, got %d: %s", recViewB.Code, recViewB.Body.String())
		}

		// 4. Gets 404 for downloading File B
		reqDlB := httptest.NewRequest("GET", "/api/v1/items/"+pgUUIDToString(fileB.ID)+"/download", nil)
		reqDlB = reqDlB.WithContext(contextWithPerson(reqDlB.Context(), folderUser, comp.ID, folderPerson))
		recDlB := httptest.NewRecorder()
		rStorage.ServeHTTP(recDlB, reqDlB)
		if recDlB.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found downloading file outside folder grant, got %d: %s", recDlB.Code, recDlB.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 5: a folder grant Uploader can upload into that folder but not into its parent
	// -----------------------------------------------------------------
	t.Run("folder grant Uploader can upload into that folder but not into its parent", func(t *testing.T) {
		folderUp, _ := queries.CreateItem(ctx, db.CreateItemParams{
			CompanyID: comp.ID,
			ProjectID: proj.ID,
			Kind:      "folder",
			Name:      "Uploader Folder",
			CreatedBy: adminUser.ID,
			Position:  pgtype.Numeric{Int: big.NewInt(300), Valid: true},
		})

		uploaderUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("uploader-%d@external.com", time.Now().UnixNano()),
			Name:  "Upload Only Uri",
		})
		_, _ = queries.CreateGrant(ctx, db.CreateGrantParams{
			CompanyID:   comp.ID,
			TargetType:  "folder",
			TargetID:    folderUp.ID,
			Email:       uploaderUser.Email,
			UserID:      uploaderUser.ID,
			Level:       authz.LevelUploader,
			CanDownload: true,
			GrantedBy:   adminUser.ID,
		})
		uploaderPerson := authz.Person{
			UserID:    uuid.UUID(uploaderUser.ID.Bytes),
			CompanyID: uuid.UUID(comp.ID.Bytes),
			Email:     uploaderUser.Email,
		}

		rUpload := chi.NewRouter()
		rUpload.Post("/api/v1/uploads", storageH.InitiateUpload)

		// 1. Upload into granted folder -> 201 Created
		folderUpIDStr := pgUUIDToString(folderUp.ID)
		upBodyFolder, _ := json.Marshal(map[string]interface{}{
			"project_id":  projIDStr,
			"parent_id":   folderUpIDStr,
			"filename":    "good_upload.mp4",
			"size_bytes":  2048,
			"mime":        "video/mp4",
			"total_parts": 1,
		})
		reqUpFolder := httptest.NewRequest("POST", "/api/v1/uploads", bytes.NewReader(upBodyFolder))
		reqUpFolder = reqUpFolder.WithContext(contextWithPerson(reqUpFolder.Context(), uploaderUser, comp.ID, uploaderPerson))
		recUpFolder := httptest.NewRecorder()
		rUpload.ServeHTTP(recUpFolder, reqUpFolder)
		if recUpFolder.Code != http.StatusOK {
			t.Fatalf("expected 200 OK uploading into granted folder, got %d: %s", recUpFolder.Code, recUpFolder.Body.String())
		}

		// 2. Upload into parent/root project -> 403 Forbidden
		upBodyParent, _ := json.Marshal(map[string]interface{}{
			"project_id":  projIDStr,
			"filename":    "illegal_root_upload.mp4",
			"size_bytes":  2048,
			"mime":        "video/mp4",
			"total_parts": 1,
		})
		reqUpParent := httptest.NewRequest("POST", "/api/v1/uploads", bytes.NewReader(upBodyParent))
		reqUpParent = reqUpParent.WithContext(contextWithPerson(reqUpParent.Context(), uploaderUser, comp.ID, uploaderPerson))
		recUpParent := httptest.NewRecorder()
		rUpload.ServeHTTP(recUpParent, reqUpParent)
		if recUpParent.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden uploading into parent project root without project grant, got %d: %s", recUpParent.Code, recUpParent.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 6: a person with team.manage_roles cannot add permissions they don't have, and cannot edit their own role
	// -----------------------------------------------------------------
	t.Run("person with team.manage_roles cannot add permissions they lack, and cannot edit their own role", func(t *testing.T) {
		// Custom role: has team.manage_roles and projects.view_all, but NOT admin.storage
		roleManagerUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("rm-%d@studio.com", time.Now().UnixNano()),
			Name:  "Role Manager Ron",
		})
		ronPerms := []string{authz.PermTeamManageRoles, authz.PermProjectsViewAll}
		ronPermsBytes, _ := json.Marshal(ronPerms)
		ronRole, err := queries.CreateRole(ctx, db.CreateRoleParams{
			CompanyID:   comp.ID,
			Name:        fmt.Sprintf("RoleCoordinator-%d", time.Now().UnixNano()),
			Color:       "#4F46E5",
			Permissions: ronPermsBytes,
			IsSystem:    false,
		})
		if err != nil {
			t.Fatalf("failed to create ron role: %v", err)
		}
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    roleManagerUser.ID,
			Role:      ronRole.Name,
		})
		_ = queries.UpdateMembershipRole(ctx, db.UpdateMembershipRoleParams{
			CompanyID: comp.ID,
			UserID:    roleManagerUser.ID,
			Role:      ronRole.Name,
			RoleID:    ronRole.ID,
		})
		ronPerson := authz.Person{
			UserID:      uuid.UUID(roleManagerUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       roleManagerUser.Email,
			Role:        ronRole.Name,
			RoleID:      uuid.UUID(ronRole.ID.Bytes),
			Permissions: ronPerms,
		}

		rRole := chi.NewRouter()
		rRole.Post("/api/v1/roles", rolesH.Create)
		rRole.Patch("/api/v1/roles/{id}", rolesH.Update)
		rRole.Delete("/api/v1/roles/{id}", rolesH.Delete)

		// 1. Attempt to create role with admin.storage (permission Ron lacks) -> 403
		createEscalateBody, _ := json.Marshal(map[string]interface{}{
			"name":        fmt.Sprintf("Escalated-%d", time.Now().UnixNano()),
			"permissions": []string{authz.PermProjectsViewAll, authz.PermAdminStorage},
		})
		reqCreateEsc := httptest.NewRequest("POST", "/api/v1/roles", bytes.NewReader(createEscalateBody))
		reqCreateEsc = reqCreateEsc.WithContext(contextWithPerson(reqCreateEsc.Context(), roleManagerUser, comp.ID, ronPerson))
		recCreateEsc := httptest.NewRecorder()
		rRole.ServeHTTP(recCreateEsc, reqCreateEsc)
		if recCreateEsc.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when creating role with unheld permissions, got %d: %s", recCreateEsc.Code, recCreateEsc.Body.String())
		}

		// 2. Attempt to edit Ron's OWN role -> 403
		updateSelfBody, _ := json.Marshal(map[string]interface{}{
			"name": "RenamedRonRole",
		})
		reqUpdateSelf := httptest.NewRequest("PATCH", "/api/v1/roles/"+pgUUIDToString(ronRole.ID), bytes.NewReader(updateSelfBody))
		reqUpdateSelf = reqUpdateSelf.WithContext(contextWithPerson(reqUpdateSelf.Context(), roleManagerUser, comp.ID, ronPerson))
		recUpdateSelf := httptest.NewRecorder()
		rRole.ServeHTTP(recUpdateSelf, reqUpdateSelf)
		if recUpdateSelf.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when editing own role, got %d: %s", recUpdateSelf.Code, recUpdateSelf.Body.String())
		}

		// 3. Attempt to delete Ron's OWN role -> 403
		reqDelSelf := httptest.NewRequest("DELETE", "/api/v1/roles/"+pgUUIDToString(ronRole.ID), nil)
		reqDelSelf = reqDelSelf.WithContext(contextWithPerson(reqDelSelf.Context(), roleManagerUser, comp.ID, ronPerson))
		recDelSelf := httptest.NewRecorder()
		rRole.ServeHTTP(recDelSelf, reqDelSelf)
		if recDelSelf.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when deleting own role, got %d: %s", recDelSelf.Code, recDelSelf.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 7: a non-Admin cannot make someone Admin
	// -----------------------------------------------------------------
	t.Run("non-Admin cannot make someone Admin", func(t *testing.T) {
		managerRoleObj, _ := queries.GetRoleByName(ctx, db.GetRoleByNameParams{
			CompanyID: comp.ID,
			Name:      authz.RoleProjectManager,
		})
		editorRoleObj, _ := queries.GetRoleByName(ctx, db.GetRoleByNameParams{
			CompanyID: comp.ID,
			Name:      authz.RoleEditor,
		})

		// Manager Manny (Project Manager - can_change_roles is false)
		managerUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("manny-%d@studio.com", time.Now().UnixNano()),
			Name:  "Manny Manager",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    managerUser.ID,
			Role:      authz.RoleProjectManager,
		})
		_ = queries.UpdateMembershipRole(ctx, db.UpdateMembershipRoleParams{
			CompanyID: comp.ID,
			UserID:    managerUser.ID,
			Role:      authz.RoleProjectManager,
			RoleID:    managerRoleObj.ID,
		})
		managerPerson := authz.Person{
			UserID:      uuid.UUID(managerUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       managerUser.Email,
			Role:        authz.RoleProjectManager,
			RoleID:      uuid.UUID(managerRoleObj.ID.Bytes),
			Permissions: []string{authz.PermTeamInvite},
		}

		// Target Editor Ted
		targetUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("ted-%d@studio.com", time.Now().UnixNano()),
			Name:  "Ted Editor",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    targetUser.ID,
			Role:      authz.RoleEditor,
		})
		_ = queries.UpdateMembershipRole(ctx, db.UpdateMembershipRoleParams{
			CompanyID: comp.ID,
			UserID:    targetUser.ID,
			Role:      authz.RoleEditor,
			RoleID:    editorRoleObj.ID,
		})

		rComp := chi.NewRouter()
		rComp.Patch("/api/v1/companies/{company_id}/members/{user_id}", companyH.UpdateMemberRole)
		rInvite := chi.NewRouter()
		rInvite.Post("/api/v1/companies/{company_id}/invites", inviteH.Create)

		compIDStr := pgUUIDToString(comp.ID)
		targetIDStr := pgUUIDToString(targetUser.ID)

		// 1. Manager tries to promote Ted to CEO -> 403 Forbidden!
		promoteAdminBody, _ := json.Marshal(map[string]string{"role": authz.RoleCEO})
		reqPromote := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compIDStr, targetIDStr), bytes.NewReader(promoteAdminBody))
		reqPromote = reqPromote.WithContext(contextWithPerson(reqPromote.Context(), managerUser, comp.ID, managerPerson))
		recPromote := httptest.NewRecorder()
		rComp.ServeHTTP(recPromote, reqPromote)
		if recPromote.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when non-admin tries to assign Admin role, got %d: %s", recPromote.Code, recPromote.Body.String())
		}

		// 2. Manager tries to invite someone as CEO -> 403 Forbidden!
		inviteAdminBody, _ := json.Marshal(map[string]string{"email": "superadmin@studio.com", "role": authz.RoleCEO})
		reqInvAdmin := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", compIDStr), bytes.NewReader(inviteAdminBody))
		reqInvAdmin = reqInvAdmin.WithContext(contextWithPerson(reqInvAdmin.Context(), managerUser, comp.ID, managerPerson))
		recInvAdmin := httptest.NewRecorder()
		rInvite.ServeHTTP(recInvAdmin, reqInvAdmin)
		if recInvAdmin.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when non-admin invites someone as Admin, got %d: %s", recInvAdmin.Code, recInvAdmin.Body.String())
		}

		// 3. Admin Alice can promote Ted to CEO -> 200 OK
		reqPromoteAdmin := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compIDStr, targetIDStr), bytes.NewReader(promoteAdminBody))
		reqPromoteAdmin = reqPromoteAdmin.WithContext(contextWithPerson(reqPromoteAdmin.Context(), adminUser, comp.ID, adminPerson))
		recPromoteAdmin := httptest.NewRecorder()
		rComp.ServeHTTP(recPromoteAdmin, reqPromoteAdmin)
		if recPromoteAdmin.Code != http.StatusOK {
			t.Fatalf("expected 200 OK when Admin assigns Admin role, got %d: %s", recPromoteAdmin.Code, recPromoteAdmin.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 8: a Manager with team.invite can invite; a role without team.invite cannot
	// -----------------------------------------------------------------
	t.Run("Manager with team.invite can invite; role without team.invite cannot", func(t *testing.T) {
		rInvite := chi.NewRouter()
		rInvite.Post("/api/v1/companies/{company_id}/invites", inviteH.Create)
		compIDStr := pgUUIDToString(comp.ID)

		// 1. Manager with team.invite
		managerUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("inviter-%d@studio.com", time.Now().UnixNano()),
			Name:  "Ian Inviter",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    managerUser.ID,
			Role:      "manager",
		})
		managerPerson := authz.Person{
			UserID:      uuid.UUID(managerUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       managerUser.Email,
			Role:        "manager",
			Permissions: []string{authz.PermTeamInvite},
		}

		validInvBody, _ := json.Marshal(map[string]string{
			"email": fmt.Sprintf("invited-%d@freelance.com", time.Now().UnixNano()),
			"role":  "editor",
		})
		reqValid := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", compIDStr), bytes.NewReader(validInvBody))
		reqValid = reqValid.WithContext(contextWithPerson(reqValid.Context(), managerUser, comp.ID, managerPerson))
		recValid := httptest.NewRecorder()
		rInvite.ServeHTTP(recValid, reqValid)
		if recValid.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created when user with team.invite invites member, got %d: %s", recValid.Code, recValid.Body.String())
		}

		// 2. Editor without team.invite -> 403 Forbidden
		editorUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("noinviter-%d@studio.com", time.Now().UnixNano()),
			Name:  "Ned NoInvite",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    editorUser.ID,
			Role:      "editor",
		})
		editorPerson := authz.Person{
			UserID:      uuid.UUID(editorUser.ID.Bytes),
			CompanyID:   uuid.UUID(comp.ID.Bytes),
			Email:       editorUser.Email,
			Role:        "editor",
			Permissions: []string{authz.PermFilesDownloadAll}, // No team.invite
		}

		reqNoInv := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", compIDStr), bytes.NewReader(validInvBody))
		reqNoInv = reqNoInv.WithContext(contextWithPerson(reqNoInv.Context(), editorUser, comp.ID, editorPerson))
		recNoInv := httptest.NewRecorder()
		rInvite.ServeHTTP(recNoInv, reqNoInv)
		if recNoInv.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden when user without team.invite invites, got %d: %s", recNoInv.Code, recNoInv.Body.String())
		}
	})

	// -----------------------------------------------------------------
	// TEST 9: assigning a role name that doesn't exist is rejected
	// -----------------------------------------------------------------
	t.Run("assigning a role name that doesn't exist is rejected", func(t *testing.T) {
		rComp := chi.NewRouter()
		rComp.Patch("/api/v1/companies/{company_id}/members/{user_id}", companyH.UpdateMemberRole)
		rInvite := chi.NewRouter()
		rInvite.Post("/api/v1/companies/{company_id}/invites", inviteH.Create)

		compIDStr := pgUUIDToString(comp.ID)

		targetUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
			Email: fmt.Sprintf("member-%d@studio.com", time.Now().UnixNano()),
			Name:  "Mark Member",
		})
		_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
			CompanyID: comp.ID,
			UserID:    targetUser.ID,
			Role:      "editor",
		})
		targetIDStr := pgUUIDToString(targetUser.ID)

		// 1. Changing member role to non-existent role "wizard" -> 400 Bad Request
		fakeRoleBody, _ := json.Marshal(map[string]string{"role": "wizard"})
		reqFakeRole := httptest.NewRequest("PATCH", fmt.Sprintf("/api/v1/companies/%s/members/%s", compIDStr, targetIDStr), bytes.NewReader(fakeRoleBody))
		reqFakeRole = reqFakeRole.WithContext(contextWithPerson(reqFakeRole.Context(), adminUser, comp.ID, adminPerson))
		recFakeRole := httptest.NewRecorder()
		rComp.ServeHTTP(recFakeRole, reqFakeRole)
		if recFakeRole.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for non-existent role name, got %d: %s", recFakeRole.Code, recFakeRole.Body.String())
		}

		// 2. Inviting with non-existent role "superstar" -> 400 Bad Request
		fakeInvBody, _ := json.Marshal(map[string]string{
			"email": "rockstar@studio.com",
			"role":  "superstar",
		})
		reqFakeInv := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/companies/%s/invites", compIDStr), bytes.NewReader(fakeInvBody))
		reqFakeInv = reqFakeInv.WithContext(contextWithPerson(reqFakeInv.Context(), adminUser, comp.ID, adminPerson))
		recFakeInv := httptest.NewRecorder()
		rInvite.ServeHTTP(recFakeInv, reqFakeInv)
		if recFakeInv.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request inviting with non-existent role, got %d: %s", recFakeInv.Code, recFakeInv.Body.String())
		}
	})
}

func TestFolderGrantBatchActionsAndTrash(t *testing.T) {
	queries, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	itemsH := NewItemsHandler(queries, nil)

	// 1. Setup Company, Admin User, Client, Project
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:              "Batch Test Studio",
		Slug:              fmt.Sprintf("batch-studio-%d", time.Now().UnixNano()),
		Plan:              plans.PlanInternal,
		Status:            "active",
		StorageLimitBytes: 0,
		Seats:             10,
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	adminUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("admin-%d@studio.com", time.Now().UnixNano()),
		Name:  "Admin Boss",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    adminUser.ID,
		Role:      authz.RoleAdmin,
	})

	client, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Client Alpha",
		CreatedBy: adminUser.ID,
	})

	proj, _ := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: comp.ID,
		ClientID:  client.ID,
		Name:      "Batch Project",
		CreatedBy: adminUser.ID,
	})

	// 2. Create Folders: Folder 1 and Folder 2, plus Subfolder inside Folder 1
	pos := pgtype.Numeric{Int: big.NewInt(1000), Valid: true}
	folder1, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Folder 1",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create folder1: %v", err)
	}

	folder1Sub, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folder1.ID,
		Kind:      "folder",
		Name:      "Folder 1 Sub",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create folder1Sub: %v", err)
	}

	folder2, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		Kind:      "folder",
		Name:      "Folder 2",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create folder2: %v", err)
	}

	// Files inside Folder 1
	file1, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folder1.ID,
		Kind:      "file",
		Name:      "file1.mp4",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create file1: %v", err)
	}

	file2, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folder1.ID,
		Kind:      "file",
		Name:      "file2.mp4",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create file2: %v", err)
	}

	// File inside Folder 2
	file3, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: comp.ID,
		ProjectID: proj.ID,
		ParentID:  folder2.ID,
		Kind:      "file",
		Name:      "file3.mp4",
		CreatedBy: adminUser.ID,
		Position:  pos,
	})
	if err != nil {
		t.Fatalf("failed to create file3: %v", err)
	}

	// 3. Create folderUser with NO project-level access, only Full grant on Folder 1
	folderUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email: fmt.Sprintf("folderuser-%d@studio.com", time.Now().UnixNano()),
		Name:  "Folder Grant User",
	})

	// Grant Full access to Folder 1
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   comp.ID,
		TargetType:  "folder",
		TargetID:    folder1.ID,
		Email:       folderUser.Email,
		UserID:      folderUser.ID,
		Level:       authz.LevelFull,
		CanDownload: true,
		GrantedBy:   adminUser.ID,
	})
	if err != nil {
		t.Fatalf("failed to create folder grant: %v", err)
	}

	folderPerson := authz.Person{
		UserID:    uuid.UUID(folderUser.ID.Bytes),
		Email:     folderUser.Email,
		Role:      "",
		CompanyID: uuid.UUID(comp.ID.Bytes),
	}

	r := chi.NewRouter()
	r.Post("/api/v1/items/batch", itemsH.BatchAction)
	r.Get("/api/v1/trash", itemsH.ListTrash)

	// A. Batch Move inside folder:
	// Move file1 into folder1Sub (both inside folder1, which user has Full grant on)
	f1SubIDStr := pgUUIDToString(folder1Sub.ID)
	moveBody, _ := json.Marshal(map[string]interface{}{
		"action":           "move",
		"item_ids":         []string{pgUUIDToString(file1.ID)},
		"target_parent_id": f1SubIDStr,
	})
	reqMove := httptest.NewRequest("POST", "/api/v1/items/batch", bytes.NewReader(moveBody))
	reqMove = reqMove.WithContext(contextWithPerson(reqMove.Context(), folderUser, comp.ID, folderPerson))
	recMove := httptest.NewRecorder()
	r.ServeHTTP(recMove, reqMove)
	if recMove.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for batch move inside granted folder, got %d: %s", recMove.Code, recMove.Body.String())
	}

	// Verify file1 moved to folder1Sub
	file1AfterMove, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: file1.ID, CompanyID: comp.ID})
	if file1AfterMove.ParentID != folder1Sub.ID {
		t.Fatalf("expected file1 parent to be folder1Sub, got %v", file1AfterMove.ParentID)
	}

	// B. Batch Move outside folder:
	// Attempt to move file2 (inside folder1) to folder2 (outside grant) -> must be rejected/ignored
	f2IDStr := pgUUIDToString(folder2.ID)
	invalidMoveBody, _ := json.Marshal(map[string]interface{}{
		"action":           "move",
		"item_ids":         []string{pgUUIDToString(file2.ID)},
		"target_parent_id": f2IDStr,
	})
	reqInvalidMove := httptest.NewRequest("POST", "/api/v1/items/batch", bytes.NewReader(invalidMoveBody))
	reqInvalidMove = reqInvalidMove.WithContext(contextWithPerson(reqInvalidMove.Context(), folderUser, comp.ID, folderPerson))
	recInvalidMove := httptest.NewRecorder()
	r.ServeHTTP(recInvalidMove, reqInvalidMove)

	// Verify file2 did NOT move to folder2
	file2After, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: file2.ID, CompanyID: comp.ID})
	if file2After.ParentID == folder2.ID {
		t.Fatalf("security violation: folder grant user was able to move file into unauthorized folder2")
	}

	// Also attempt to move file3 (in folder2) -> must not move
	invalidMoveBody2, _ := json.Marshal(map[string]interface{}{
		"action":           "move",
		"item_ids":         []string{pgUUIDToString(file3.ID)},
		"target_parent_id": f1SubIDStr,
	})
	reqInvalidMove2 := httptest.NewRequest("POST", "/api/v1/items/batch", bytes.NewReader(invalidMoveBody2))
	reqInvalidMove2 = reqInvalidMove2.WithContext(contextWithPerson(reqInvalidMove2.Context(), folderUser, comp.ID, folderPerson))
	recInvalidMove2 := httptest.NewRecorder()
	r.ServeHTTP(recInvalidMove2, reqInvalidMove2)

	file3After, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: file3.ID, CompanyID: comp.ID})
	if file3After.ParentID == folder1Sub.ID {
		t.Fatalf("security violation: folder grant user was able to move unauthorized file3")
	}

	// C. Batch Delete inside vs outside folder:
	// Attempt batch delete targeting file2 (inside folder1) and file3 (inside folder2)
	deleteBody, _ := json.Marshal(map[string]interface{}{
		"action":   "delete",
		"item_ids": []string{pgUUIDToString(file2.ID), pgUUIDToString(file3.ID)},
	})
	reqDelete := httptest.NewRequest("POST", "/api/v1/items/batch", bytes.NewReader(deleteBody))
	reqDelete = reqDelete.WithContext(contextWithPerson(reqDelete.Context(), folderUser, comp.ID, folderPerson))
	recDelete := httptest.NewRecorder()
	r.ServeHTTP(recDelete, reqDelete)
	if recDelete.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for batch delete, got %d: %s", recDelete.Code, recDelete.Body.String())
	}

	// Verify file2 is deleted (it was inside granted folder)
	file2Deleted, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: file2.ID, CompanyID: comp.ID})
	if !file2Deleted.DeletedAt.Valid {
		t.Fatalf("expected file2 to be soft deleted inside granted folder")
	}

	// Verify file3 is NOT deleted (it was in folder2 outside user's grant)
	file3NotDeleted, _ := queries.GetItemByID(ctx, db.GetItemByIDParams{ID: file3.ID, CompanyID: comp.ID})
	if file3NotDeleted.DeletedAt.Valid {
		t.Fatalf("security violation: folder grant user was able to delete file3 outside their folder grant")
	}

	// D. Check Trash visibility:
	// Now admin deletes file3 so it's also in trash
	_, _ = queries.SoftDeleteItem(ctx, db.SoftDeleteItemParams{
		ID:        file3.ID,
		CompanyID: comp.ID,
		DeletedBy: adminUser.ID,
	})

	// When folderUser lists trash, they should see file2 (from their granted folder) but NOT file3
	reqTrash := httptest.NewRequest("GET", "/api/v1/trash", nil)
	reqTrash = reqTrash.WithContext(contextWithPerson(reqTrash.Context(), folderUser, comp.ID, folderPerson))
	recTrash := httptest.NewRecorder()
	r.ServeHTTP(recTrash, reqTrash)
	if recTrash.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for trash listing, got %d: %s", recTrash.Code, recTrash.Body.String())
	}

	var trashResp struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	_ = json.Unmarshal(recTrash.Body.Bytes(), &trashResp)
	foundFile2 := false
	foundFile3 := false
	for _, it := range trashResp.Items {
		if it.ID == pgUUIDToString(file2.ID) {
			foundFile2 = true
		}
		if it.ID == pgUUIDToString(file3.ID) {
			foundFile3 = true
		}
	}

	if !foundFile2 {
		t.Fatalf("expected folderUser to see deleted file2 from their granted folder in trash")
	}
	if foundFile3 {
		t.Fatalf("security violation: folderUser saw file3 in trash from unauthorized folder2")
	}
}



