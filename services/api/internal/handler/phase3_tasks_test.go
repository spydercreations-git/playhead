package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
)

func TestPhase3TasksFullRules(t *testing.T) {
	pool, queries, cleanup := setupTestPool(t)
	defer cleanup()
	ctx := context.Background()

	// 1. Setup company, staff, editor, client person
	comp, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name: "Phase3 Production Co",
		Slug: fmt.Sprintf("p3-%d", time.Now().UnixNano()),
	})
	if err != nil {
		t.Fatalf("failed to create company: %v", err)
	}

	// Staff user
	staffUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        fmt.Sprintf("staff-%d@playhead.test", time.Now().UnixNano()),
		PasswordHash: pgtype.Text{String: "dummyhash", Valid: true},
		Name:         "Staff Sarah",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    staffUser.ID,
		Role:      authz.RoleStaff,
	})

	// Editor user
	editorUser, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        fmt.Sprintf("editor-%d@playhead.test", time.Now().UnixNano()),
		PasswordHash: pgtype.Text{String: "dummyhash", Valid: true},
		Name:         "Editor Eddie",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    editorUser.ID,
		Role:      authz.RoleEditor,
	})

	// Client 1 & Client Contact
	cl1, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Everygen Client",
	})
	clientUser1, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        fmt.Sprintf("client1-%d@everygen.test", time.Now().UnixNano()),
		PasswordHash: pgtype.Text{String: "dummyhash", Valid: true},
		Name:         "Client Cathy",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    clientUser1.ID,
		Role:      authz.RoleClient,
	})
	_, _ = pool.Exec(ctx, `INSERT INTO client_contacts (client_id, user_id) VALUES ($1, $2)`, cl1.ID, clientUser1.ID)

	// Client 2
	cl2, _ := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: comp.ID,
		Name:      "Pizza Hut Client",
	})
	clientUser2, _ := queries.CreateUser(ctx, db.CreateUserParams{
		Email:        fmt.Sprintf("client2-%d@pizzahut.test", time.Now().UnixNano()),
		PasswordHash: pgtype.Text{String: "dummyhash", Valid: true},
		Name:         "Pizza Pete",
	})
	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: comp.ID,
		UserID:    clientUser2.ID,
		Role:      authz.RoleClient,
	})
	_, _ = pool.Exec(ctx, `INSERT INTO client_contacts (client_id, user_id) VALUES ($1, $2)`, cl2.ID, clientUser2.ID)

	// Handlers and Router setup
	cfg := config.Load()
	stClient, err := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})
	if err == nil && stClient != nil {
		_ = stClient.EnsureBucket(ctx)
	}

	tasksHandler := NewTasksHandler(queries, stClient, nil, cfg)
	tasksHandler.SetPool(pool)

	r := chi.NewRouter()
	r.Get("/tasks", tasksHandler.ListTasks)
	r.Post("/tasks", tasksHandler.CreateTask)
	r.Post("/tasks/reorder", tasksHandler.ReorderTasks)
	r.Get("/tasks/trash", tasksHandler.ListTrashTasks)
	r.Get("/tasks/{id}", tasksHandler.GetTask)
	r.Patch("/tasks/{id}", tasksHandler.UpdateTask)
	r.Patch("/tasks/{id}/status", tasksHandler.UpdateTaskStatus)
	r.Delete("/tasks/{id}", tasksHandler.DeleteTask)
	r.Post("/tasks/{id}/restore", tasksHandler.RestoreTask)
	r.Post("/tasks/{id}/assignees", tasksHandler.AddAssignee)
	r.Delete("/tasks/{id}/assignees/{userId}", tasksHandler.RemoveAssignee)
	r.Post("/tasks/{id}/links", tasksHandler.AddTaskLink)
	r.Delete("/tasks/{id}/links/{linkId}", tasksHandler.DeleteTaskLink)
	r.Get("/tasks/{id}/comments", tasksHandler.ListTaskComments)
	r.Post("/tasks/{id}/comments", tasksHandler.CreateTaskComment)
	r.Patch("/tasks/comments/{commentId}", tasksHandler.UpdateTaskComment)
	r.Delete("/tasks/comments/{commentId}", tasksHandler.DeleteTaskComment)
	r.Post("/tasks/{id}/comments/attachments/presign", tasksHandler.PresignCommentAttachment)
	r.Get("/tasks/comments/attachments/{attachmentId}/download", tasksHandler.DownloadCommentAttachment)
	r.Get("/tasks/{id}/comments/stream", tasksHandler.StreamTaskComments)
	r.Get("/tasks/{id}/mentionable", tasksHandler.ListMentionable)

	makeCtx := func(u db.User, role string, clientID uuid.UUID) context.Context {
		c := contextWithAuth(context.Background(), u, comp.ID, role)
		person := authz.Person{
			UserID:         uuid.UUID(u.ID.Bytes),
			CompanyID:      uuid.UUID(comp.ID.Bytes),
			Role:           role,
			ClientID:       clientID,
			PermissionsMap: authz.DefaultPermissions(role),
		}
		c = context.WithValue(c, middleware.PersonContextKey, person)
		return c
	}

	staffCtx := makeCtx(staffUser, authz.RoleStaff, uuid.Nil)
	editorCtx := makeCtx(editorUser, authz.RoleEditor, uuid.Nil)
	client1Ctx := makeCtx(clientUser1, authz.RoleClient, uuid.UUID(cl1.ID.Bytes))
	client2Ctx := makeCtx(clientUser2, authz.RoleClient, uuid.UUID(cl2.ID.Bytes))

	// -------------------------------------------------------------------------
	// RULE 13 & TASK CREATION: Staff creates task for Client 1
	// -------------------------------------------------------------------------
	var createdTaskID string
	t.Run("Create task as staff", func(t *testing.T) {
		body := fmt.Sprintf(`{
			"name": "Costco PR unboxing ad (4:5 + 9:16)",
			"client_id": "%s",
			"status": "In progress",
			"deadline": "2026-10-22T18:00:00Z",
			"description_title": "Brief",
			"description_html": "<p>I'd like 2 aspect ratio cutdowns.</p><script>alert(1)</script>"
		}`, uuid.UUID(cl1.ID.Bytes))
		req := httptest.NewRequest("POST", "/tasks", bytes.NewBufferString(body)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 created, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		createdTaskID = resp["id"].(string)

		// Rule 6: Check HTML sanitization (script stripped)
		descHTML := resp["description_html"].(string)
		if strings.Contains(descHTML, "<script>") {
			t.Errorf("expected script tags to be sanitized, got: %s", descHTML)
		}
	})

	// Rule 13: Client 1 can only create tasks for own client; cannot assign to Client 2
	t.Run("Client creates task restricted to own client", func(t *testing.T) {
		// Attempting to create task for client 2 as client 1 must be overridden to client 1
		body := fmt.Sprintf(`{
			"name": "Client Submitted Task",
			"client_id": "%s",
			"status": "Not started"
		}`, uuid.UUID(cl2.ID.Bytes))
		req := httptest.NewRequest("POST", "/tasks", bytes.NewBufferString(body)).WithContext(client1Ctx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 created, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["client_id"].(string) != uuid.UUID(cl1.ID.Bytes).String() {
			t.Errorf("expected client_id to be fixed to own client (%s), got: %v", uuid.UUID(cl1.ID.Bytes), resp["client_id"])
		}
	})

	// -------------------------------------------------------------------------
	// RULE 3: WHO SEES A TASK
	// Staff sees all; Editor only sees if assigned; Client sees only own client
	// -------------------------------------------------------------------------
	t.Run("Task visibility across roles", func(t *testing.T) {
		// 1. Staff sees createdTaskID
		req := httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("staff should see task, got %d", w.Code)
		}

		// 2. Editor Eddie is not yet assigned -> 404 or 403
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(editorCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound && w.Code != http.StatusForbidden {
			t.Errorf("unassigned editor should get 403 or 404, got %d", w.Code)
		}

		// Assign editor Eddie as staff
		assignBody := fmt.Sprintf(`{"user_id":"%s"}`, uuid.UUID(editorUser.ID.Bytes))
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/assignees", bytes.NewBufferString(assignBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("failed to assign editor: %d %s", w.Code, w.Body.String())
		}

		// Now Editor Eddie sees task -> 200
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(editorCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("assigned editor should see task, got %d", w.Code)
		}

		// 3. Client 1 (Everygen) sees the task (since it's their client)
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("client 1 should see own client task, got %d", w.Code)
		}
		var clientTaskView map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &clientTaskView)
		// Rule 3: Client never sees assigned names, internal tab or Manage access
		if clientTaskView["assigned"] != nil {
			assignedList := clientTaskView["assigned"].([]interface{})
			if len(assignedList) > 0 {
				t.Errorf("client must never see assigned user list, got: %v", assignedList)
			}
		}
		if clientTaskView["can_manage_access"] == true {
			t.Errorf("client must never have can_manage_access")
		}

		// 4. Client 2 (Pizza Hut) cannot see Client 1's task -> 404 or 403
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(client2Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound && w.Code != http.StatusForbidden {
			t.Errorf("client 2 should get 403 or 404 on client 1's task, got %d", w.Code)
		}
	})

	// -------------------------------------------------------------------------
	// RULE 4: STATUS CHANGES (Staff & assigned editor can; Client CANNOT)
	// -------------------------------------------------------------------------
	t.Run("Status update permissions", func(t *testing.T) {
		// Client 1 attempts to change status -> 403 Forbidden
		body := `{"status":"Completed"}`
		req := httptest.NewRequest("PATCH", "/tasks/"+createdTaskID+"/status", bytes.NewBufferString(body)).WithContext(client1Ctx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must be refused status change (expected 403), got %d", w.Code)
		}

		// Assigned editor changes status -> 200 OK
		req = httptest.NewRequest("PATCH", "/tasks/"+createdTaskID+"/status", bytes.NewBufferString(body)).WithContext(editorCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("assigned editor should be allowed to change status, got %d: %s", w.Code, w.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// RULE 5: LINKS (max 15, HTTP/HTTPS only, block javascript:)
	// -------------------------------------------------------------------------
	t.Run("Link restrictions and limits", func(t *testing.T) {
		// 1. Block javascript: url
		jsBody := `{"title":"Malicious","url":"javascript:alert(1)"}`
		req := httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/links", bytes.NewBufferString(jsBody)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 bad request for javascript: link, got %d", w.Code)
		}

		// 2. Block data: url
		dataBody := `{"title":"Data URI","url":"data:text/html;base64,PHNjcmlwdD4="}`
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/links", bytes.NewBufferString(dataBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 bad request for data: link, got %d", w.Code)
		}

		// 3. Add valid HTTP link
		validBody := `{"title":"Raw footage (Drive)","url":"https://drive.google.com/test"}`
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/links", bytes.NewBufferString(validBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 created for valid link, got %d", w.Code)
		}

		// 4. Verify max 15 links
		for i := 2; i <= 15; i++ {
			b := fmt.Sprintf(`{"title":"Link %d","url":"https://example.com/%d"}`, i, i)
			req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/links", bytes.NewBufferString(b)).WithContext(staffCtx)
			w = httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusCreated {
				t.Fatalf("expected 201 for link %d, got %d: %s", i, w.Code, w.Body.String())
			}
		}

		// 16th link must be rejected
		b16 := `{"title":"16th link","url":"https://example.com/16"}`
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/links", bytes.NewBufferString(b16)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 max_links_exceeded for 16th link, got %d", w.Code)
		}
	})

	// -------------------------------------------------------------------------
	// RULE 2: COMMENT TABS SEPARATED ON SERVER
	// Clients can NEVER read, create, receive SSE, or download attachments from internal comments
	// -------------------------------------------------------------------------
	var internalCommentID string
	var clientCommentID string
	var internalAttachmentID string

	t.Run("Server-side comment tab isolation", func(t *testing.T) {
		// Staff posts in "internal" tab
		intBody := `{"tab":"internal","body":"Staff only discussion regarding timeline."}`
		req := httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(intBody)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("staff should post in internal tab, got %d: %s", w.Code, w.Body.String())
		}
		var intResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &intResp)
		commentObj := intResp["comment"].(map[string]interface{})
		internalCommentID = commentObj["id"].(string)

		// Client attempts to POST in "internal" tab -> 403 FORBIDDEN
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(intBody)).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must get 403 trying to post in internal tab, got %d", w.Code)
		}

		// Client posts in "client" tab -> 201 OK
		cliBody := `{"tab":"client","body":"Can we keep the Costco logo bigger in the opening?"}`
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(cliBody)).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("client should post in client tab, got %d: %s", w.Code, w.Body.String())
		}
		var cliResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &cliResp)
		clientCommentID = cliResp["comment"].(map[string]interface{})["id"].(string)

		// Client reads "client" comments -> sees only client comments
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID+"/comments?tab=client", nil).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("client should read client comments, got %d", w.Code)
		}
		var cList map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &cList)
		items := cList["comments"].([]interface{})
		for _, it := range items {
			cm := it.(map[string]interface{})
			if cm["tab"] != "client" {
				t.Errorf("client saw non-client comment in client tab: %v", cm)
			}
		}

		// Client attempts to read "internal" comments -> 403 FORBIDDEN
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID+"/comments?tab=internal", nil).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must get 403 reading internal comments, got %d", w.Code)
		}

		// Client attempts to connect to SSE stream for "internal" tab -> 403 FORBIDDEN
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID+"/comments/stream?tab=internal", nil).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must get 403 on internal SSE stream, got %d", w.Code)
		}

		// Staff attaches file to internal comment
		attRow, err := queries.CreateTaskCommentAttachment(ctx, db.CreateTaskCommentAttachmentParams{
			CommentID:  pgtype.UUID{Bytes: uuid.MustParse(internalCommentID), Valid: true},
			StorageKey: "tasks/internal-test.pdf",
			Filename:   "internal-brief.pdf",
			Mime:       "application/pdf",
			SizeBytes:  1024,
		})
		if err != nil {
			t.Fatalf("failed to insert internal attachment: %v", err)
		}
		internalAttachmentID = uuid.UUID(attRow.ID.Bytes).String()

		// Staff downloads internal attachment -> 200 OK
		req = httptest.NewRequest("GET", "/tasks/comments/attachments/"+internalAttachmentID+"/download", nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("staff should download internal attachment, got %d", w.Code)
		}

		// Client attempts to download internal attachment -> 403 FORBIDDEN
		req = httptest.NewRequest("GET", "/tasks/comments/attachments/"+internalAttachmentID+"/download", nil).WithContext(client1Ctx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must get 403 downloading internal comment attachment, got %d", w.Code)
		}
	})

	// -------------------------------------------------------------------------
	// RULE 7: ATTACHMENTS (up to 30 MB server enforced)
	// -------------------------------------------------------------------------
	t.Run("Attachment 30MB limit check", func(t *testing.T) {
		// Valid 25MB attachment -> 200 OK
		okBody := `{"filename":"comp.mov","size_bytes":26214400,"mime":"video/quicktime"}`
		req := httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments/attachments/presign", bytes.NewBufferString(okBody)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("expected 200 for 25MB attachment, got %d", w.Code)
		}

		// Oversized 35MB attachment -> 400 Bad Request
		tooLargeBody := `{"filename":"huge.mov","size_bytes":36700160,"mime":"video/quicktime"}`
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments/attachments/presign", bytes.NewBufferString(tooLargeBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for 35MB attachment, got %d", w.Code)
		}
	})

	// -------------------------------------------------------------------------
	// RULE 8: REPLIES & SOFT DELETION ("Message deleted")
	// -------------------------------------------------------------------------
	t.Run("Comment replies and soft deletion", func(t *testing.T) {
		// Staff replies directly to clientCommentID
		replyBody := fmt.Sprintf(`{
			"tab": "client",
			"body": "Done in v2, uploaded to Edited files.",
			"reply_to_comment_id": "%s"
		}`, clientCommentID)
		req := httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(replyBody)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201 for reply comment, got %d: %s", w.Code, w.Body.String())
		}
		var rResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &rResp)
		repComment := rResp["comment"].(map[string]interface{})
		if repComment["reply_to_comment_id"] != clientCommentID {
			t.Errorf("expected reply_to_comment_id %s, got %v", clientCommentID, repComment["reply_to_comment_id"])
		}

		// Staff deletes internalCommentID
		req = httptest.NewRequest("DELETE", "/tasks/comments/"+internalCommentID, nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 on comment deletion, got %d", w.Code)
		}

		// Read comments as staff -> deleted comment body should be "Message deleted"
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID+"/comments?tab=internal", nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var cList map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &cList)
		items := cList["comments"].([]interface{})
		foundDeleted := false
		for _, it := range items {
			cm := it.(map[string]interface{})
			if cm["id"] == internalCommentID {
				foundDeleted = true
				if cm["body"] != "Message deleted" {
					t.Errorf("expected deleted comment body to be 'Message deleted', got: %v", cm["body"])
				}
				if cm["is_deleted"] != true {
					t.Errorf("expected is_deleted == true")
				}
			}
		}
		if !foundDeleted {
			t.Errorf("expected to find soft-deleted comment in internal list")
		}
	})

	// -------------------------------------------------------------------------
	// RULE 10: PRIORITY ORDER (drag rows to reorder)
	// -------------------------------------------------------------------------
	t.Run("Reorder tasks priority", func(t *testing.T) {
		// Create a second task
		body2 := fmt.Sprintf(`{"name":"Task 2","client_id":"%s","status":"Not started"}`, uuid.UUID(cl1.ID.Bytes))
		req2 := httptest.NewRequest("POST", "/tasks", bytes.NewBufferString(body2)).WithContext(staffCtx)
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)
		var t2Resp map[string]interface{}
		_ = json.Unmarshal(w2.Body.Bytes(), &t2Resp)
		task2ID := t2Resp["id"].(string)

		// Reorder: put task2 first, createdTask second
		reorderBody := fmt.Sprintf(`{"task_ids":["%s","%s"]}`, task2ID, createdTaskID)
		reorderReq := httptest.NewRequest("POST", "/tasks/reorder", bytes.NewBufferString(reorderBody)).WithContext(staffCtx)
		wReorder := httptest.NewRecorder()
		r.ServeHTTP(wReorder, reorderReq)
		if wReorder.Code != http.StatusOK {
			t.Fatalf("expected 200 on task reorder, got %d: %s", wReorder.Code, wReorder.Body.String())
		}

		// Verify list order
		listReq := httptest.NewRequest("GET", "/tasks", nil).WithContext(staffCtx)
		wList := httptest.NewRecorder()
		r.ServeHTTP(wList, listReq)
		var lResp map[string]interface{}
		_ = json.Unmarshal(wList.Body.Bytes(), &lResp)
		taskList := lResp["tasks"].([]interface{})
		if len(taskList) >= 2 {
			firstTask := taskList[0].(map[string]interface{})
			if firstTask["id"] != task2ID {
				t.Errorf("expected task 2 to be first after reordering, got: %v", firstTask["id"])
			}
		}
	})

	// -------------------------------------------------------------------------
	// RULE 11: DELETE TASK (staff only, goes to Trash, restorable)
	// -------------------------------------------------------------------------
	t.Run("Delete and restore task", func(t *testing.T) {
		// Client attempts to delete -> 403 Forbidden
		req := httptest.NewRequest("DELETE", "/tasks/"+createdTaskID, nil).WithContext(client1Ctx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("client must get 403 on task delete, got %d", w.Code)
		}

		// Staff deletes task -> 200 OK
		req = httptest.NewRequest("DELETE", "/tasks/"+createdTaskID, nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("staff should delete task, got %d: %s", w.Code, w.Body.String())
		}

		// Verify task is now in trash
		req = httptest.NewRequest("GET", "/tasks/trash", nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("staff should view trash tasks, got %d", w.Code)
		}
		var trashList map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &trashList)
		tasks := trashList["tasks"].([]interface{})
		foundInTrash := false
		for _, tk := range tasks {
			m := tk.(map[string]interface{})
			if m["id"] == createdTaskID {
				foundInTrash = true
			}
		}
		if !foundInTrash {
			t.Errorf("expected deleted task %s to be listed in trash", createdTaskID)
		}

		// Staff restores task -> 200 OK
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/restore", nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("staff should restore task, got %d: %s", w.Code, w.Body.String())
		}

		// Verify task is back in normal list
		req = httptest.NewRequest("GET", "/tasks/"+createdTaskID, nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("task should be visible after restore, got %d", w.Code)
		}
	})

	// -------------------------------------------------------------------------
	// FIX 1: HTML ALLOWLIST SANITIZATION (Task descriptions & Comment bodies)
	// -------------------------------------------------------------------------
	t.Run("Rule 6 & Fix 1: Allowlist HTML sanitization for task description and comments", func(t *testing.T) {
		// Create task with XSS payload in description
		xssDesc := `<p>Valid description</p><script>alert('XSS-desc')</script><img src=x onerror="alert('img-xss')"><a href="javascript:alert('link-xss')">Dangerous link</a>`
		taskReq := fmt.Sprintf(`{
			"client_id": "%s",
			"name": "XSS Sanitization Test Task",
			"description_html": %q
		}`, uuid.UUID(cl1.ID.Bytes).String(), xssDesc)

		req := httptest.NewRequest("POST", "/tasks", bytes.NewBufferString(taskReq)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("failed to create task with html desc, got %d: %s", w.Code, w.Body.String())
		}

		var createdTaskResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &createdTaskResp)
		xssTaskID := createdTaskResp["id"].(string)

		// Get the task and verify dangerous tags/attributes are purged
		req = httptest.NewRequest("GET", "/tasks/"+xssTaskID, nil).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("failed to get task, got %d", w.Code)
		}

		var getTaskResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &getTaskResp)
		descOut := getTaskResp["task"].(map[string]interface{})["description_html"].(string)
		lowerDesc := strings.ToLower(descOut)

		if strings.Contains(lowerDesc, "<script") || strings.Contains(lowerDesc, "onerror") || strings.Contains(lowerDesc, "javascript:") {
			t.Errorf("sanitizer failed: description still contains unsafe tags: %s", descOut)
		}
		if !strings.Contains(descOut, "<p>Valid description</p>") {
			t.Errorf("sanitizer removed safe content: %s", descOut)
		}

		// Comment body with XSS payload
		xssComment := `<p>Safe comment</p><iframe src="javascript:alert(1)"></iframe><svg onload=alert(2)></svg>`
		comReq := fmt.Sprintf(`{
			"tab": "client",
			"body": %q
		}`, xssComment)
		req = httptest.NewRequest("POST", "/tasks/"+xssTaskID+"/comments", bytes.NewBufferString(comReq)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("failed to post comment with html body, got %d: %s", w.Code, w.Body.String())
		}

		var comResp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &comResp)
		comBodyOut := comResp["comment"].(map[string]interface{})["body"].(string)
		lowerCom := strings.ToLower(comBodyOut)

		if strings.Contains(lowerCom, "<iframe") || strings.Contains(lowerCom, "<svg") || strings.Contains(lowerCom, "onload") {
			t.Errorf("sanitizer failed: comment body contains unsafe tags: %s", comBodyOut)
		}
		if !strings.Contains(comBodyOut, "<p>Safe comment</p>") {
			t.Errorf("sanitizer removed safe comment content: %s", comBodyOut)
		}
	})

	// -------------------------------------------------------------------------
	// FIX 2: REAL FILE SIZE ENFORCEMENT & UNCONFIRMED ATTACHMENT CLEANUP
	// -------------------------------------------------------------------------
	t.Run("Rule 7 & Fix 2: Real storage HeadObject enforcement and unconfirmed cleanup", func(t *testing.T) {
		if stClient == nil {
			t.Skip("skipping real storage test, stClient not available")
		}

		// 1. Presign attachment upload
		presignReq := `{"filename":"test-file.mov","size_bytes":1000,"mime":"video/quicktime"}`
		req := httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments/attachments/presign", bytes.NewBufferString(presignReq)).WithContext(staffCtx)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("presign failed: %d: %s", w.Code, w.Body.String())
		}
		var pResp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &pResp)
		storageKey := pResp["storage_key"]

		// Test A: Upload real file exceeding 30 MB (e.g. 31MB + 1KB) directly to storage
		oversizedBytes := int64(31*1024*1024 + 1024) // 32,506,880 bytes > 31,457,280 bytes
		oversizedData := bytes.NewReader(make([]byte, oversizedBytes))
		err = stClient.PutObject(ctx, storageKey, oversizedData, oversizedBytes, "video/quicktime")
		if err != nil {
			t.Fatalf("failed to put test object in storage: %v", err)
		}

		// Now client attempts to link this oversized attachment to a comment
		comBody := fmt.Sprintf(`{
			"tab": "client",
			"body": "Here is an oversized file",
			"attachments": [{
				"storage_key": "%s",
				"filename": "test-file.mov",
				"mime": "video/quicktime",
				"size_bytes": 1000
			}]
		}`, storageKey)
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(comBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)

		// Must be rejected with 400 Bad Request!
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for real file exceeding 30MB, got %d: %s", w.Code, w.Body.String())
		}

		// Verify the object was deleted from storage!
		_, _, headErr := stClient.HeadObject(ctx, storageKey)
		if headErr == nil {
			t.Errorf("expected oversized object to be deleted from storage, but it still exists")
		}

		// Test B: Size mismatch (declared size does not match real file size)
		mismatchKey := fmt.Sprintf("companies/%s/tasks/%s/attachments/%s/mismatch.txt",
			uuid.UUID(comp.ID.Bytes).String(),
			createdTaskID,
			uuid.New().String(),
		)
		mData := []byte("real file content")
		err = stClient.PutObject(ctx, mismatchKey, bytes.NewReader(mData), int64(len(mData)), "text/plain")
		if err != nil {
			t.Fatalf("failed to put mismatch object: %v", err)
		}

		mismatchBody := fmt.Sprintf(`{
			"tab": "client",
			"body": "Lying about size",
			"attachments": [{
				"storage_key": "%s",
				"filename": "mismatch.txt",
				"mime": "text/plain",
				"size_bytes": 100
			}]
		}`, mismatchKey)
		req = httptest.NewRequest("POST", "/tasks/"+createdTaskID+"/comments", bytes.NewBufferString(mismatchBody)).WithContext(staffCtx)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for declared vs real size mismatch, got %d: %s", w.Code, w.Body.String())
		}
		// Verify mismatch object was deleted from storage
		_, _, headErr = stClient.HeadObject(ctx, mismatchKey)
		if headErr == nil {
			t.Errorf("expected size-mismatched object to be deleted from storage")
		}

		// Test C: Unconfirmed attachment cleanup older than 1 hour
		staleKey := fmt.Sprintf("companies/%s/tasks/%s/attachments/%s/stale.bin",
			uuid.UUID(comp.ID.Bytes).String(),
			createdTaskID,
			uuid.New().String(),
		)
		_ = stClient.PutObject(ctx, staleKey, bytes.NewReader([]byte("stale data")), 10, "application/octet-stream")

		// Insert stale pending record older than 2 hours
		staleTime := time.Now().Add(-2 * time.Hour)
		var pendingID pgtype.UUID
		err = pool.QueryRow(ctx, `
			INSERT INTO pending_task_attachments (company_id, task_id, storage_key, filename, mime, declared_size_bytes, created_at)
			VALUES ($1, $2, $3, 'stale.bin', 'application/octet-stream', 10, $4)
			RETURNING id
		`, comp.ID, uuid.MustParse(createdTaskID), staleKey, staleTime).Scan(&pendingID)
		if err != nil {
			t.Fatalf("failed to insert stale pending attachment: %v", err)
		}

		// Run stale cleanup
		tasksHandler.cleanupStalePendingAttachments()

		// Verify stale object was deleted from storage
		_, _, headErr = stClient.HeadObject(ctx, staleKey)
		if headErr == nil {
			t.Errorf("expected stale unconfirmed object to be deleted by cleanupStalePendingAttachments")
		}

		// Verify row was deleted from pending_task_attachments
		var count int
		_ = pool.QueryRow(ctx, `SELECT count(*) FROM pending_task_attachments WHERE id = $1`, pendingID).Scan(&count)
		if count != 0 {
			t.Errorf("expected pending row to be removed from pending_task_attachments after cleanup")
		}
	})
}
