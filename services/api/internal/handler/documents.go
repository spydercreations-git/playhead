package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/plans"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/redis/go-redis/v9"
)

type DocumentsHandler struct {
	dbPool        *pgxpool.Pool
	q             *db.Queries
	rdb           *redis.Client
	storageClient *storage.Client
	cfg           *config.Config
}

func NewDocumentsHandler(dbPool *pgxpool.Pool, q *db.Queries, rdb *redis.Client, storageClient *storage.Client, cfg *config.Config) *DocumentsHandler {
	return &DocumentsHandler{
		dbPool:        dbPool,
		q:             q,
		rdb:           rdb,
		storageClient: storageClient,
		cfg:           cfg,
	}
}

func getCaller(ctx context.Context) *authz.Person {
	p := middleware.GetPerson(ctx)
	if p.UserID == uuid.Nil || p.CompanyID == uuid.Nil {
		return nil
	}
	return &p
}

// ---------------------------------------------------------
// Collab Ticket HMAC Generation & Verification
// ---------------------------------------------------------

func GenerateCollabTicket(secret string, documentID uuid.UUID, userID uuid.UUID, expiresAt time.Time) string {
	payload := fmt.Sprintf("%s:%s:%d", documentID.String(), userID.String(), expiresAt.Unix())
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(payload))
	sig := hex.EncodeToString(h.Sum(nil))
	return base64.RawURLEncoding.EncodeToString([]byte(payload + "." + sig))
}

func VerifyCollabTicket(secret string, ticketStr string, expectedDocID uuid.UUID) (userID uuid.UUID, valid bool) {
	data, err := base64.RawURLEncoding.DecodeString(ticketStr)
	if err != nil {
		return uuid.Nil, false
	}
	parts := strings.Split(string(data), ".")
	if len(parts) != 2 {
		return uuid.Nil, false
	}
	payload := parts[0]
	expectedSig := parts[1]

	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(payload))
	sig := hex.EncodeToString(h.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(sig), []byte(expectedSig)) != 1 {
		return uuid.Nil, false
	}

	subParts := strings.Split(payload, ":")
	if len(subParts) != 3 {
		return uuid.Nil, false
	}
	docID, err := uuid.Parse(subParts[0])
	if err != nil || docID != expectedDocID {
		return uuid.Nil, false
	}
	uID, err := uuid.Parse(subParts[1])
	if err != nil {
		return uuid.Nil, false
	}
	expUnix, err := strconv.ParseInt(subParts[2], 10, 64)
	if err != nil || time.Now().Unix() > expUnix {
		return uuid.Nil, false // expired!
	}

	return uID, true
}

// StripTeamNotes recursively removes any node whose type is "team_notes" or "teamNotes".
func StripTeamNotes(node map[string]interface{}) map[string]interface{} {
	if node == nil {
		return nil
	}
	nodeType, _ := node["type"].(string)
	if strings.EqualFold(nodeType, "team_notes") || strings.EqualFold(nodeType, "teamnotes") {
		return nil
	}

	content, ok := node["content"].([]interface{})
	if ok {
		var newContent []interface{}
		for _, child := range content {
			if childMap, ok := child.(map[string]interface{}); ok {
				cleanChild := StripTeamNotes(childMap)
				if cleanChild != nil {
					newContent = append(newContent, cleanChild)
				}
			} else {
				newContent = append(newContent, child)
			}
		}
		node["content"] = newContent
	}
	return node
}

// ExtractPlainTextFromNode recursively extracts plain text from ProseMirror JSON nodes.
func ExtractPlainTextFromNode(node map[string]interface{}) string {
	if node == nil {
		return ""
	}
	if text, ok := node["text"].(string); ok {
		return text
	}
	var sb strings.Builder
	if content, ok := node["content"].([]interface{}); ok {
		for _, child := range content {
			if childMap, ok := child.(map[string]interface{}); ok {
				t := ExtractPlainTextFromNode(childMap)
				if t != "" {
					if sb.Len() > 0 {
						sb.WriteString(" ")
					}
					sb.WriteString(t)
				}
			}
		}
	}
	return sb.String()
}

type CollabImportResponse struct {
	OK                 bool   `json:"ok"`
	DocumentID         string `json:"document_id"`
	VersionID          string `json:"version_id"`
	WordCount          int32  `json:"word_count"`
	CharacterCount     int32  `json:"character_count"`
	ReadingTimeSeconds int32  `json:"reading_time_seconds"`
}

func (h *DocumentsHandler) callCollabInitDocument(ctx context.Context, docID, companyID uuid.UUID, contentJSON interface{}) error {
	collabURL := h.cfg.CollabURL
	if collabURL == "" {
		collabURL = "http://localhost:8082"
	}
	payload, err := json.Marshal(map[string]interface{}{
		"document_id":  docID.String(),
		"company_id":   companyID.String(),
		"content_json": contentJSON,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", collabURL+"/internal/init-document", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Collab-Secret", h.cfg.CollabInternalSecret)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("collab init-document failed (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *DocumentsHandler) callCollabReplaceContent(ctx context.Context, docID, companyID, userID uuid.UUID, contentJSON interface{}, versionName string) error {
	collabURL := h.cfg.CollabURL
	if collabURL == "" {
		collabURL = "http://localhost:8082"
	}
	payload, err := json.Marshal(map[string]interface{}{
		"document_id":  docID.String(),
		"company_id":   companyID.String(),
		"user_id":      userID.String(),
		"content_json": contentJSON,
		"version_name": versionName,
		"is_named":     true,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", collabURL+"/internal/replace-content", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Collab-Secret", h.cfg.CollabInternalSecret)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("collab replace-content failed (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *DocumentsHandler) callCollabImportDocx(ctx context.Context, docID, companyID, userID uuid.UUID, fileBase64 string) (*CollabImportResponse, error) {
	collabURL := h.cfg.CollabURL
	if collabURL == "" {
		collabURL = "http://localhost:8082"
	}
	payload, err := json.Marshal(map[string]interface{}{
		"document_id": docID.String(),
		"company_id":  companyID.String(),
		"user_id":     userID.String(),
		"file_base64": fileBase64,
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", collabURL+"/internal/import-docx", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Collab-Secret", h.cfg.CollabInternalSecret)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("collab import-docx failed (%d): %s", resp.StatusCode, string(body))
	}
	var res CollabImportResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	return &res, nil
}

// ---------------------------------------------------------
// Internal Collab Verification Hook
// ---------------------------------------------------------

type CollabVerifyRequest struct {
	DocumentID string `json:"document_id"`
	Ticket     string `json:"ticket"`
}

type CollabVerifyResponse struct {
	Allowed      bool   `json:"allowed"`
	UserID       string `json:"user_id,omitempty"`
	Name         string `json:"name,omitempty"`
	Email        string `json:"email,omitempty"`
	AvatarURL    string `json:"avatar_url,omitempty"`
	Color        string `json:"color,omitempty"`
	IsTeamMember bool   `json:"is_team_member"`
	AccessLevel  string `json:"access_level,omitempty"`
	ReadOnly     bool   `json:"read_only"`
	Reason       string `json:"reason,omitempty"`
}

func (h *DocumentsHandler) InternalCollabVerify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Validate X-Collab-Secret using constant-time comparison
	collabHeader := r.Header.Get("X-Collab-Secret")
	if subtle.ConstantTimeCompare([]byte(collabHeader), []byte(h.cfg.CollabInternalSecret)) != 1 {
		http.Error(w, "Unauthorized: Invalid collab secret", http.StatusUnauthorized)
		return
	}

	var req CollabVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, CollabVerifyResponse{Allowed: false, Reason: "Invalid request payload"})
		return
	}

	docUUID, err := uuid.Parse(req.DocumentID)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, CollabVerifyResponse{Allowed: false, Reason: "Invalid document ID"})
		return
	}

	// 2. Verify Ticket (HMAC signature, document binding, 60s expiration)
	userUUID, valid := VerifyCollabTicket(h.cfg.CollabInternalSecret, req.Ticket, docUUID)
	if !valid {
		renderJSON(w, http.StatusUnauthorized, CollabVerifyResponse{Allowed: false, Reason: "Invalid or expired collab ticket"})
		return
	}

	// 3. Load item
	itemRow, err := h.q.GetItemByIDOnly(ctx, pgtype.UUID{Bytes: docUUID, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			renderJSON(w, http.StatusNotFound, CollabVerifyResponse{Allowed: false, Reason: "Document not found"})
		} else {
			renderJSON(w, http.StatusInternalServerError, CollabVerifyResponse{Allowed: false, Reason: "Database error"})
		}
		return
	}

	companyUUID := itemRow.CompanyID.Bytes
	projectUUID := itemRow.ProjectID.Bytes

	// 4. Load user & company membership
	user, err := h.q.GetUserByID(ctx, pgtype.UUID{Bytes: userUUID, Valid: true})
	if err != nil {
		renderJSON(w, http.StatusUnauthorized, CollabVerifyResponse{Allowed: false, Reason: "User not found"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: companyUUID, Valid: true},
		UserID:    pgtype.UUID{Bytes: userUUID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Hard Rule 1: Non-team people NEVER get live Yjs connection
	if !isTeamMember {
		renderJSON(w, http.StatusForbidden, CollabVerifyResponse{
			Allowed:      false,
			IsTeamMember: false,
			Reason:       "Non-team members cannot connect to live collaboration",
		})
		return
	}

	// 5. Evaluate permissions on item
	person := authz.Person{
		UserID:    userUUID,
		Email:     user.Email,
		Role:      membership.Role,
		CompanyID: companyUUID,
	}

	projTarget := authz.ProjectTarget{
		ID:        projectUUID,
		CompanyID: companyUUID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: projectUUID,
		CompanyID: companyUUID,
		CreatedBy: itemRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, person, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		renderJSON(w, http.StatusForbidden, CollabVerifyResponse{
			Allowed:      false,
			IsTeamMember: true,
			Reason:       "No view access to document",
		})
		return
	}

	isReadOnly := access.Level != authz.LevelFull
	color := fmt.Sprintf("#%02x%02x%02x", userUUID[0], userUUID[1], userUUID[2])

	renderJSON(w, http.StatusOK, CollabVerifyResponse{
		Allowed:      true,
		UserID:       userUUID.String(),
		Name:         user.Name,
		Email:        user.Email,
		AvatarURL:    "",
		Color:        color,
		IsTeamMember: true,
		AccessLevel:  access.Level,
		ReadOnly:     isReadOnly,
	})
}

// ---------------------------------------------------------
// Issue Collab Ticket (60s Short-Lived Token)
// ---------------------------------------------------------

func (h *DocumentsHandler) IssueCollabTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docIDStr := chi.URLParam(r, "id")
	docUUID, err := uuid.Parse(docIDStr)
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Non-team members cannot get a collab ticket
	if !isTeamMember {
		http.Error(w, "Forbidden: Non-team members cannot connect to live collaboration", http.StatusForbidden)
		return
	}

	itemRow, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        itemRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: itemRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: itemRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden: Insufficient permissions", http.StatusForbidden)
		return
	}

	expiresAt := time.Now().Add(60 * time.Second)
	ticket := GenerateCollabTicket(h.cfg.CollabInternalSecret, docUUID, caller.UserID, expiresAt)

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"ticket":     ticket,
		"expires_at": expiresAt.Unix(),
	})
}

// ---------------------------------------------------------
// Document CRUD & Templates
// ---------------------------------------------------------

type CreateDocumentRequest struct {
	Name     string `json:"name"`
	ParentID string `json:"parent_id,omitempty"`
	Template string `json:"template,omitempty"`
}

func (h *DocumentsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	projIDStr := chi.URLParam(r, "id")
	projUUID, err := uuid.Parse(projIDStr)
	if err != nil {
		http.Error(w, "Invalid project ID", http.StatusBadRequest)
		return
	}

	var req CreateDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	docName := strings.TrimSpace(req.Name)
	if docName == "" {
		docName = "Untitled Document"
	}

	projTarget := authz.ProjectTarget{
		ID:        projUUID,
		CompanyID: caller.CompanyID,
	}

	access, err := authz.Access(ctx, h.q, *caller, projTarget)
	if err != nil || (!access.CanUpload() && access.Level != authz.LevelFull) {
		http.Error(w, "Forbidden: Cannot create documents in this project", http.StatusForbidden)
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentID != "" {
		if pID, pErr := uuid.Parse(req.ParentID); pErr == nil {
			parentUUID = pgtype.UUID{Bytes: pID, Valid: true}
		}
	}

	templateContent, templateText, publicText := getTemplateContent(req.Template, docName)

	tx, err := h.dbPool.Begin(ctx)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.q.WithTx(tx)

	var itemPos pgtype.Numeric
	_ = itemPos.Scan("1000")

	item, err := qtx.CreateItem(ctx, db.CreateItemParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ProjectID: pgtype.UUID{Bytes: projUUID, Valid: true},
		ParentID:  parentUUID,
		Kind:      "document",
		Name:      docName,
		Position:  itemPos,
		CreatedBy: pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Failed to create document item: "+err.Error(), http.StatusInternalServerError)
		return
	}

	contentBytes, _ := json.Marshal(templateContent)
	words := strings.Fields(templateText)
	wordCount := int32(len(words))
	charCount := int32(len(templateText))
	readTime := int32(1)
	if wordCount > 0 {
		readTime = int32((len(words) + 199) / 200 * 60)
	}

	doc, err := qtx.CreateDocument(ctx, db.CreateDocumentParams{
		ID:                 item.ID,
		CompanyID:          pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ContentState:       nil,
		ContentJson:        contentBytes,
		PlainText:          templateText,
		PublicPlainText:    publicText,
		WordCount:          wordCount,
		CharacterCount:     charCount,
		ReadingTimeSeconds: readTime,
	})
	if err != nil {
		http.Error(w, "Failed to initialize document content: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Transaction commit failed", http.StatusInternalServerError)
		return
	}

	// 1. Initial content: Build real Yjs state on server via collab service
	if initErr := h.callCollabInitDocument(ctx, uuid.UUID(doc.ID.Bytes), caller.CompanyID, templateContent); initErr != nil {
		fmt.Printf("[callCollabInitDocument ERROR]: %v\n", initErr)
	}

	renderJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         uuid.UUID(doc.ID.Bytes).String(),
		"project_id": uuid.UUID(item.ProjectID.Bytes).String(),
		"name":       item.Name,
		"kind":       "document",
		"created_at": item.CreatedAt.Time,
	})
}

// ---------------------------------------------------------
// List Documents (Scoped to caller permissions & client contact)
// ---------------------------------------------------------

func (h *DocumentsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	clientIDFilter := r.URL.Query().Get("client_id")
	projectIDFilter := r.URL.Query().Get("project_id")
	searchQuery := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))

	var clientPgUUID pgtype.UUID
	if clientIDFilter != "" {
		if cUUID, err := uuid.Parse(clientIDFilter); err == nil {
			clientPgUUID = pgtype.UUID{Bytes: cUUID, Valid: true}
		}
	}

	var projectPgUUID pgtype.UUID
	if projectIDFilter != "" {
		if pUUID, err := uuid.Parse(projectIDFilter); err == nil {
			projectPgUUID = pgtype.UUID{Bytes: pUUID, Valid: true}
		}
	}

	// Client contact scoping: client contacts strictly only see their client's documents
	var clientContactClientID uuid.UUID
	contacts, cErr := h.q.GetClientContactsByEmail(ctx, authz.NormalizeEmail(caller.Email))
	if cErr == nil && len(contacts) > 0 && contacts[0].ClientID.Valid {
		clientContactClientID = contacts[0].ClientID.Bytes
		clientPgUUID = contacts[0].ClientID
	}

	docs, err := h.q.ListDocumentsForCompany(ctx, db.ListDocumentsForCompanyParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
		ClientID:  clientPgUUID,
		ProjectID: projectPgUUID,
	})
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	type ClientChip struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	type DocItem struct {
		ID                 string    `json:"id"`
		Title              string    `json:"title"`
		ProjectID          string    `json:"project_id"`
		ProjectName        string    `json:"project_name"`
		ClientID           string    `json:"client_id"`
		ClientName         string    `json:"client_name"`
		LastEditor         string    `json:"last_editor"`
		UpdatedAt          time.Time `json:"updated_at"`
		CreatedAt          time.Time `json:"created_at"`
		WordCount          int32     `json:"word_count"`
		CharacterCount     int32     `json:"character_count"`
		ReadingTimeSeconds int32     `json:"reading_time_seconds"`
		IsStarred          bool      `json:"is_starred"`
		CanEdit            bool      `json:"can_edit"`
	}

	var filteredDocs []DocItem
	clientCounts := make(map[string]*ClientChip)

	for _, d := range docs {
		projTarget := authz.ProjectTarget{
			ID:        d.ProjectID.Bytes,
			CompanyID: caller.CompanyID,
			ClientID:  d.ClientID.Bytes,
		}
		itemTarget := authz.ItemTarget{
			ID:        d.ID.Bytes,
			ProjectID: d.ProjectID.Bytes,
			CompanyID: caller.CompanyID,
			CreatedBy: d.CreatedBy.Bytes,
		}

		if clientContactClientID != uuid.Nil && d.ClientID.Bytes != clientContactClientID {
			continue
		}

		access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
		if err != nil || !access.CanView() {
			continue
		}

		if searchQuery != "" {
			searchText := strings.ToLower(d.Title)
			if isTeamMember {
				searchText += " " + strings.ToLower(d.PlainText)
			} else {
				searchText += " " + strings.ToLower(d.PublicPlainText)
			}
			if !strings.Contains(searchText, searchQuery) {
				continue
			}
		}

		cIDStr := uuid.UUID(d.ClientID.Bytes).String()
		if _, exists := clientCounts[cIDStr]; !exists {
			clientCounts[cIDStr] = &ClientChip{
				ID:    cIDStr,
				Name:  d.ClientName,
				Count: 0,
			}
		}
		clientCounts[cIDStr].Count++

		lastEditor := "Team member"
		if d.CreatedByName.Valid && d.CreatedByName.String != "" {
			lastEditor = d.CreatedByName.String
		}

		filteredDocs = append(filteredDocs, DocItem{
			ID:                 uuid.UUID(d.ID.Bytes).String(),
			Title:              d.Title,
			ProjectID:          uuid.UUID(d.ProjectID.Bytes).String(),
			ProjectName:        d.ProjectName,
			ClientID:           cIDStr,
			ClientName:         d.ClientName,
			LastEditor:         lastEditor,
			UpdatedAt:          d.UpdatedAt.Time,
			CreatedAt:          d.CreatedAt.Time,
			WordCount:          d.WordCount,
			CharacterCount:     d.CharacterCount,
			ReadingTimeSeconds: d.ReadingTimeSeconds,
			IsStarred:          d.IsStarred,
			CanEdit:            access.Level == authz.LevelFull && isTeamMember,
		})
	}

	chips := make([]ClientChip, 0, len(clientCounts))
	for _, c := range clientCounts {
		chips = append(chips, *c)
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"documents":    filteredDocs,
		"total_count":  len(filteredDocs),
		"client_chips": chips,
	})
}

// ---------------------------------------------------------
// Get Document Details
// ---------------------------------------------------------

func (h *DocumentsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  doc.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: doc.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden: Access denied", http.StatusForbidden)
		return
	}

	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":                   uuid.UUID(doc.ID.Bytes).String(),
		"title":                doc.Title,
		"project_id":           uuid.UUID(doc.ProjectID.Bytes).String(),
		"project_name":         doc.ProjectName,
		"client_id":            uuid.UUID(doc.ClientID.Bytes).String(),
		"client_name":          doc.ClientName,
		"word_count":           doc.WordCount,
		"character_count":      doc.CharacterCount,
		"reading_time_seconds": doc.ReadingTimeSeconds,
		"updated_at":           doc.UpdatedAt.Time,
		"can_edit":             access.Level == authz.LevelFull && isTeamMember,
		"can_download":         access.CanDownload,
		"is_team_member":       isTeamMember,
	})
}

// ---------------------------------------------------------
// Server-Sanitized Document View (for Non-Team & Share Links)
// ---------------------------------------------------------

func (h *DocumentsHandler) GetSanitizedView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  doc.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: doc.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	var contentJSON map[string]interface{}
	if len(doc.ContentJson) > 0 {
		_ = json.Unmarshal(doc.ContentJson, &contentJSON)
	}
	if contentJSON == nil {
		contentJSON = map[string]interface{}{"type": "doc", "content": []interface{}{}}
	}

	if !isTeamMember {
		contentJSON = StripTeamNotes(contentJSON)
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":                   uuid.UUID(doc.ID.Bytes).String(),
		"document_id":          uuid.UUID(doc.ID.Bytes).String(),
		"title":                doc.Title,
		"project_id":           uuid.UUID(doc.ProjectID.Bytes).String(),
		"project_name":         doc.ProjectName,
		"content_json":         contentJSON,
		"word_count":           doc.WordCount,
		"character_count":      doc.CharacterCount,
		"reading_time_seconds": doc.ReadingTimeSeconds,
		"updated_at":           doc.UpdatedAt.Time,
		"is_team_member":       isTeamMember,
		"can_edit":             (isTeamMember && (access.Level == authz.LevelFull || access.CanUpload())),
	})
}

// ---------------------------------------------------------
// Rename Document Title
// ---------------------------------------------------------

func (h *DocumentsHandler) Rename(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	newTitle := strings.TrimSpace(req.Title)
	if newTitle == "" {
		http.Error(w, "Title cannot be empty", http.StatusBadRequest)
		return
	}

	item, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || (!access.CanModifyItem(*caller, item.CreatedBy.Bytes) && access.Level != authz.LevelFull) {
		http.Error(w, "Forbidden: Cannot rename this document", http.StatusForbidden)
		return
	}

	_, err = h.q.RenameItem(ctx, db.RenameItemParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		Name:      newTitle,
	})
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":    docUUID.String(),
		"title": newTitle,
	})
}

// ---------------------------------------------------------
// Images in Documents: Presign, Complete, Access Check
// ---------------------------------------------------------

type PresignImageRequest struct {
	Filename    string `json:"filename"`
	SizeBytes   int64  `json:"size_bytes"`
	Mime        string `json:"mime"`
	InTeamNotes bool   `json:"in_team_notes"`
}

func (h *DocumentsHandler) PresignImageUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	var req PresignImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	item, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || access.Level != authz.LevelFull {
		http.Error(w, "Forbidden: Only editors with Full access can upload images", http.StatusForbidden)
		return
	}

	tx, err := h.dbPool.Begin(ctx)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.q.WithTx(tx)
	company, err := qtx.GetCompanyStorageDetails(ctx, pgtype.UUID{Bytes: caller.CompanyID, Valid: true})
	if err != nil {
		http.Error(w, "Company not found", http.StatusNotFound)
		return
	}

	if !plans.IsUnlimitedStorage(company.Plan) {
		currentProjected := company.StorageUsedBytes + company.StorageReservedBytes + req.SizeBytes
		if currentProjected > company.StorageLimitBytes {
			http.Error(w, "Storage quota exceeded", http.StatusPaymentRequired)
			return
		}
	}

	assetUUID := uuid.New()
	ext := "png"
	if strings.Contains(req.Filename, ".") {
		parts := strings.Split(req.Filename, ".")
		ext = parts[len(parts)-1]
	}
	storageKey := fmt.Sprintf("companies/%s/documents/%s/images/%s.%s", caller.CompanyID.String(), docUUID.String(), assetUUID.String(), ext)

	asset, err := qtx.CreateDocumentAsset(ctx, db.CreateDocumentAssetParams{
		DocumentID:  pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:   pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		StorageKey:  storageKey,
		Filename:    req.Filename,
		Mime:        req.Mime,
		SizeBytes:   req.SizeBytes,
		Width:       pgtype.Int4{Valid: false},
		Height:      pgtype.Int4{Valid: false},
		UploadedBy:  pgtype.UUID{Bytes: caller.UserID, Valid: true},
		InTeamNotes: req.InTeamNotes,
	})
	if err != nil {
		http.Error(w, "Failed to create asset record: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Transaction commit failed", http.StatusInternalServerError)
		return
	}

	if h.storageClient == nil || h.storageClient.Presign == nil {
		http.Error(w, "Storage service unavailable", http.StatusServiceUnavailable)
		return
	}
	presignClient := h.storageClient.Presign
	putReq, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.cfg.R2Bucket),
		Key:         aws.String(storageKey),
		ContentType: aws.String(req.Mime),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		http.Error(w, "Failed to generate presigned upload URL", http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"asset_id":    uuid.UUID(asset.ID.Bytes).String(),
		"storage_key": storageKey,
		"upload_url":  putReq.URL,
	})
}

type CompleteImageRequest struct {
	AssetID     string `json:"asset_id"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
	InTeamNotes bool   `json:"in_team_notes"`
}

func (h *DocumentsHandler) CompleteImageUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	var req CompleteImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	assetUUID, err := uuid.Parse(req.AssetID)
	if err != nil {
		http.Error(w, "Invalid asset ID", http.StatusBadRequest)
		return
	}

	asset, err := h.q.GetDocumentAsset(ctx, db.GetDocumentAssetParams{
		ID:        pgtype.UUID{Bytes: assetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Asset not found", http.StatusNotFound)
		return
	}

	if req.InTeamNotes != asset.InTeamNotes {
		_ = h.q.UpdateDocumentAssetInTeamNotes(ctx, db.UpdateDocumentAssetInTeamNotesParams{
			ID:          asset.ID,
			CompanyID:   asset.CompanyID,
			InTeamNotes: req.InTeamNotes,
		})
	}

	imageURL := fmt.Sprintf("/api/v1/documents/%s/images/%s", docUUID.String(), assetUUID.String())

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"asset_id": assetUUID.String(),
		"src":      imageURL,
	})
}

func (h *DocumentsHandler) GetImage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	assetUUID, err := uuid.Parse(chi.URLParam(r, "imageId"))
	if err != nil {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  doc.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: doc.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	asset, err := h.q.GetDocumentAsset(ctx, db.GetDocumentAssetParams{
		ID:        pgtype.UUID{Bytes: assetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Image asset not found", http.StatusNotFound)
		return
	}

	// Rule 4: Images that only appear inside team_notes nodes are refused for non-team callers
	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	if asset.InTeamNotes && !isTeamMember {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}

	if h.storageClient == nil || h.storageClient.Presign == nil {
		http.Error(w, "Storage service unavailable", http.StatusServiceUnavailable)
		return
	}
	presignClient := h.storageClient.Presign
	getReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.cfg.R2Bucket),
		Key:    aws.String(asset.StorageKey),
	}, s3.WithPresignExpires(1*time.Hour))
	if err != nil {
		http.Error(w, "Failed to generate presigned URL", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, getReq.URL, http.StatusTemporaryRedirect)
}

// ---------------------------------------------------------
// Document Version History (Restore Never Deletes Newer)
// ---------------------------------------------------------

func (h *DocumentsHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: doc.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	versions, err := h.q.ListDocumentVersions(ctx, db.ListDocumentVersionsParams{
		DocumentID: pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:  pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	type VersionItem struct {
		ID          string      `json:"id"`
		Name        string      `json:"name"`
		IsNamed     bool        `json:"is_named"`
		CreatedAt   time.Time   `json:"created_at"`
		AuthorName  string      `json:"author_name"`
		ContentJSON interface{} `json:"content_json"`
	}

	items := make([]VersionItem, 0, len(versions))
	for _, v := range versions {
		var cJSON map[string]interface{}
		if len(v.ContentJson) > 0 {
			_ = json.Unmarshal(v.ContentJson, &cJSON)
		}
		if cJSON == nil {
			cJSON = map[string]interface{}{"type": "doc", "content": []interface{}{}}
		}

		if !isTeamMember {
			cJSON = StripTeamNotes(cJSON)
		}

		authorName := "Team member"
		if v.AuthorName.Valid && v.AuthorName.String != "" {
			authorName = v.AuthorName.String
		}

		name := "Automatic version"
		if v.Name.Valid && v.Name.String != "" {
			name = v.Name.String
		}

		items = append(items, VersionItem{
			ID:          uuid.UUID(v.ID.Bytes).String(),
			Name:        name,
			IsNamed:     v.IsNamed,
			CreatedAt:   v.CreatedAt.Time,
			AuthorName:  authorName,
			ContentJSON: cJSON,
		})
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"versions": items,
	})
}

func (h *DocumentsHandler) NameVersion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	versionName := strings.TrimSpace(req.Name)
	if versionName == "" {
		versionName = fmt.Sprintf("Named Version %s", time.Now().Format("Jan 02, 15:04"))
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	item, _ := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}
	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || access.Level != authz.LevelFull {
		http.Error(w, "Forbidden: Only editors can name versions", http.StatusForbidden)
		return
	}

	version, err := h.q.CreateDocumentVersion(ctx, db.CreateDocumentVersionParams{
		DocumentID:   pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:    pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		Name:         pgtype.Text{String: versionName, Valid: true},
		IsNamed:      true,
		ContentState: doc.ContentState,
		ContentJson:  doc.ContentJson,
		PlainText:    doc.PlainText,
		CreatedBy:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusCreated, map[string]interface{}{
		"version_id": uuid.UUID(version.ID.Bytes).String(),
		"name":       versionName,
		"is_named":   true,
		"created_at": version.CreatedAt.Time,
	})
}

func (h *DocumentsHandler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	var versionUUID uuid.UUID
	vParam := chi.URLParam(r, "version_id")
	if vParam != "" {
		versionUUID, err = uuid.Parse(vParam)
	} else {
		var req struct {
			VersionID string `json:"version_id"`
		}
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr == nil && req.VersionID != "" {
			versionUUID, err = uuid.Parse(req.VersionID)
		}
	}
	if err != nil || versionUUID == uuid.Nil {
		http.Error(w, "Invalid version ID", http.StatusBadRequest)
		return
	}

	item, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || access.Level != authz.LevelFull {
		http.Error(w, "Forbidden: Only editors can restore versions", http.StatusForbidden)
		return
	}

	version, err := h.q.GetDocumentVersion(ctx, db.GetDocumentVersionParams{
		ID:         pgtype.UUID{Bytes: versionUUID, Valid: true},
		DocumentID: pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:  pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Version not found", http.StatusNotFound)
		return
	}

	restoreLabel := fmt.Sprintf("Restored from %s", version.Name.String)
	if version.Name.String == "" {
		restoreLabel = fmt.Sprintf("Restored from version (%s)", version.CreatedAt.Time.Format("Jan 02, 15:04"))
	}

	var parsed map[string]interface{}
	if len(version.ContentJson) > 0 {
		_ = json.Unmarshal(version.ContentJson, &parsed)
	}
	if parsed == nil {
		parsed = map[string]interface{}{"type": "doc", "content": []interface{}{}}
	}

	// 3. Restore must go through the collab service
	collabErr := h.callCollabReplaceContent(ctx, docUUID, caller.CompanyID, caller.UserID, parsed, restoreLabel)
	if collabErr == nil {
		renderJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Version restored successfully",
		})
		return
	}

	// Fallback to direct DB write if collab service is unreachable
	stripped := StripTeamNotes(parsed)
	publicPlainText := ExtractPlainTextFromNode(stripped)

	tx, err := h.dbPool.Begin(ctx)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.q.WithTx(tx)

	words := strings.Fields(version.PlainText)
	wordCount := int32(len(words))
	charCount := int32(len(version.PlainText))
	readTime := int32(1)
	if wordCount > 0 {
		readTime = int32((len(words) + 199) / 200 * 60)
	}

	_, err = qtx.UpdateDocumentCollab(ctx, db.UpdateDocumentCollabParams{
		ID:                 pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:          pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ContentState:       version.ContentState,
		ContentJson:        version.ContentJson,
		PlainText:          version.PlainText,
		PublicPlainText:    publicPlainText,
		WordCount:          wordCount,
		CharacterCount:     charCount,
		ReadingTimeSeconds: readTime,
	})
	if err != nil {
		http.Error(w, "Failed to update document: "+err.Error(), http.StatusInternalServerError)
		return
	}

	_, _ = qtx.CreateDocumentVersion(ctx, db.CreateDocumentVersionParams{
		DocumentID:   pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID:    pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		Name:         pgtype.Text{String: restoreLabel, Valid: true},
		IsNamed:      true,
		ContentState: version.ContentState,
		ContentJson:  version.ContentJson,
		PlainText:    version.PlainText,
		CreatedBy:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "Transaction commit failed", http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Version restored successfully",
	})
}

// ---------------------------------------------------------
// Video Card Preview & Access Control
// ---------------------------------------------------------

func (h *DocumentsHandler) GetCardPreview(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	itemIDStr := chi.URLParam(r, "id")
	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		renderJSON(w, http.StatusOK, map[string]interface{}{"has_access": false})
		return
	}

	item, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusOK, map[string]interface{}{"has_access": false})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        itemUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		// Rule 6: Person cannot view video -> show "No access"
		renderJSON(w, http.StatusOK, map[string]interface{}{"has_access": false})
		return
	}

	versionNum := item.LatestVersionNumber

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"has_access":     true,
		"id":             uuid.UUID(item.ID.Bytes).String(),
		"name":           item.Name,
		"thumbnail_url":  item.LatestStorageKey,
		"version_number": versionNum,
		"review_status":  item.ReviewStatus,
		"duration_ms":    0,
	})
}

// ---------------------------------------------------------
// Public Share Link Document View & Helpers
// ---------------------------------------------------------

func (h *DocumentsHandler) PublicShareGetDocumentView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	docIDStr := chi.URLParam(r, "id")

	docUUID, err := uuid.Parse(docIDStr)
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	link, _, ok := ResolvePublicShareLinkAndItem(w, r, h.q, h.cfg.SessionSecret, docUUID.String())
	if !ok {
		return
	}

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: link.CompanyID,
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	var contentJSON map[string]interface{}
	if len(doc.ContentJson) > 0 {
		_ = json.Unmarshal(doc.ContentJson, &contentJSON)
	}
	if contentJSON == nil {
		contentJSON = map[string]interface{}{"type": "doc", "content": []interface{}{}}
	}

	contentJSON = StripTeamNotes(contentJSON)

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"document_id":          uuid.UUID(doc.ID.Bytes).String(),
		"title":                doc.Title,
		"content_json":         contentJSON,
		"word_count":           doc.WordCount,
		"character_count":      doc.CharacterCount,
		"reading_time_seconds": doc.ReadingTimeSeconds,
		"updated_at":           doc.UpdatedAt.Time,
		"is_team_member":       false,
	})
}

func (h *DocumentsHandler) PublicShareGetDocumentImage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	docIDStr := chi.URLParam(r, "id")
	imageIDStr := chi.URLParam(r, "imageId")

	docUUID, err := uuid.Parse(docIDStr)
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	imageUUID, err := uuid.Parse(imageIDStr)
	if err != nil {
		http.Error(w, "Invalid image ID", http.StatusBadRequest)
		return
	}

	link, _, ok := ResolvePublicShareLinkAndItem(w, r, h.q, h.cfg.SessionSecret, docUUID.String())
	if !ok {
		return
	}

	asset, err := h.q.GetDocumentAsset(ctx, db.GetDocumentAssetParams{
		ID:        pgtype.UUID{Bytes: imageUUID, Valid: true},
		CompanyID: link.CompanyID,
	})
	if err != nil {
		http.Error(w, "Image asset not found", http.StatusNotFound)
		return
	}

	// Rule 4: Team-only images return 404 for share links
	if asset.InTeamNotes {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}

	if h.storageClient == nil || h.storageClient.Presign == nil {
		http.Error(w, "Storage service unavailable", http.StatusServiceUnavailable)
		return
	}
	presignClient := h.storageClient.Presign
	getReq, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.cfg.R2Bucket),
		Key:    aws.String(asset.StorageKey),
	}, s3.WithPresignExpires(1*time.Hour))
	if err != nil {
		http.Error(w, "Failed to generate presigned URL", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, getReq.URL, http.StatusTemporaryRedirect)
}

func (h *DocumentsHandler) PublicShareGetCardPreview(w http.ResponseWriter, r *http.Request) {
	itemIDStr := chi.URLParam(r, "id")

	itemUUID, err := uuid.Parse(itemIDStr)
	if err != nil {
		renderJSON(w, http.StatusOK, map[string]interface{}{"has_access": false})
		return
	}

	_, item, ok := ResolvePublicShareLinkAndItem(w, r, h.q, h.cfg.SessionSecret, itemUUID.String())
	if !ok || item == nil {
		renderJSON(w, http.StatusOK, map[string]interface{}{"has_access": false})
		return
	}

	versionNum := item.LatestVersionNumber

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"has_access":     true,
		"id":             uuid.UUID(item.ID.Bytes).String(),
		"name":           item.Name,
		"thumbnail_url":  item.LatestStorageKey,
		"version_number": versionNum,
		"review_status":  item.ReviewStatus,
		"duration_ms":    0,
	})
}

// ---------------------------------------------------------
// Export Document (Markdown / Text / JSON)
// ---------------------------------------------------------

func (h *DocumentsHandler) Export(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	format := strings.ToLower(chi.URLParam(r, "format"))

	doc, err := h.q.GetDocument(ctx, db.GetDocumentParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: doc.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: doc.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if !access.CanDownload {
		http.Error(w, "Forbidden: Download not permitted", http.StatusForbidden)
		return
	}

	membership, _ := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (membership.Role != "")

	var contentJSON map[string]interface{}
	if len(doc.ContentJson) > 0 {
		_ = json.Unmarshal(doc.ContentJson, &contentJSON)
	}
	if contentJSON == nil {
		contentJSON = map[string]interface{}{"type": "doc", "content": []interface{}{}}
	}

	if !isTeamMember {
		contentJSON = StripTeamNotes(contentJSON)
	}

	switch format {
	case "md", "markdown":
		mdText := prosemirrorToMarkdown(contentJSON)
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.md\"", sanitizeFilename(doc.Title)))
		w.Write([]byte(mdText))
	case "json":
		w.Header().Set("Content-Type", "application/json")
		renderJSON(w, http.StatusOK, contentJSON)
	default:
		renderJSON(w, http.StatusOK, map[string]interface{}{
			"title":        doc.Title,
			"content_json": contentJSON,
		})
	}
}

// ---------------------------------------------------------
// Import Docx (Parsed by mammoth / client into ProseMirror)
// ---------------------------------------------------------

type ImportDocxRequest struct {
	ContentJSON map[string]interface{} `json:"content_json"`
	PlainText   string                 `json:"plain_text"`
}

func (h *DocumentsHandler) ImportDocx(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	docUUID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "Invalid document ID", http.StatusBadRequest)
		return
	}

	item, err := h.q.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        pgtype.UUID{Bytes: docUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		http.Error(w, "Document not found", http.StatusNotFound)
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
	}
	itemTarget := authz.ItemTarget{
		ID:        docUUID,
		ProjectID: item.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: item.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || access.Level != authz.LevelFull {
		http.Error(w, "Forbidden: Only editors with Full access can import into documents", http.StatusForbidden)
		return
	}

	// 7. Word import: do not trust content and plain text sent by browser.
	// Convert the .docx on the server side via collab service (mammoth) with 25MB limit.
	var fileBytes []byte
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		// 25MB file limit
		if err := r.ParseMultipartForm(25 << 20); err != nil {
			http.Error(w, "File exceeds 25MB limit or invalid form", http.StatusBadRequest)
			return
		}
		file, fileHeader, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Missing file in form data", http.StatusBadRequest)
			return
		}
		defer file.Close()
		if fileHeader.Size > 25*1024*1024 {
			http.Error(w, "File exceeds 25MB limit", http.StatusBadRequest)
			return
		}
		fileBytes, err = io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read file", http.StatusBadRequest)
			return
		}
	} else {
		var req struct {
			FileBase64 string `json:"file_base64"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileBase64 == "" {
			http.Error(w, "Invalid payload: file_base64 is required", http.StatusBadRequest)
			return
		}
		decoded, err := base64.StdEncoding.DecodeString(req.FileBase64)
		if err != nil {
			http.Error(w, "Invalid base64 encoding", http.StatusBadRequest)
			return
		}
		if len(decoded) > 25*1024*1024 {
			http.Error(w, "File exceeds 25MB limit", http.StatusBadRequest)
			return
		}
		fileBytes = decoded
	}

	b64Str := base64.StdEncoding.EncodeToString(fileBytes)
	collabRes, err := h.callCollabImportDocx(ctx, docUUID, caller.CompanyID, caller.UserID, b64Str)
	if err != nil {
		http.Error(w, "Server-side docx conversion failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"success":         true,
		"message":         "Word document imported successfully",
		"version_id":      collabRes.VersionID,
		"word_count":      collabRes.WordCount,
		"character_count": collabRes.CharacterCount,
	})
}

// ---------------------------------------------------------
// Markdown Serializer & Template Builders
// ---------------------------------------------------------

func sanitizeFilename(name string) string {
	res := strings.ReplaceAll(name, "/", "-")
	res = strings.ReplaceAll(res, "\\", "-")
	return res
}

func prosemirrorToMarkdown(node map[string]interface{}) string {
	if node == nil {
		return ""
	}
	var b strings.Builder
	nodeType, _ := node["type"].(string)

	switch nodeType {
	case "doc":
		if content, ok := node["content"].([]interface{}); ok {
			for _, child := range content {
				if childMap, ok := child.(map[string]interface{}); ok {
					b.WriteString(prosemirrorToMarkdown(childMap))
					b.WriteString("\n\n")
				}
			}
		}
	case "heading":
		attrs, _ := node["attrs"].(map[string]interface{})
		level := 1
		if l, ok := attrs["level"].(float64); ok {
			level = int(l)
		}
		b.WriteString(strings.Repeat("#", level))
		b.WriteString(" ")
		b.WriteString(extractChildText(node))
	case "paragraph":
		b.WriteString(extractChildText(node))
	case "text":
		text, _ := node["text"].(string)
		b.WriteString(text)
	default:
		b.WriteString(extractChildText(node))
	}

	return strings.TrimSpace(b.String())
}

func extractChildText(node map[string]interface{}) string {
	var b strings.Builder
	if content, ok := node["content"].([]interface{}); ok {
		for _, child := range content {
			if childMap, ok := child.(map[string]interface{}); ok {
				cType, _ := childMap["type"].(string)
				if cType == "text" {
					text, _ := childMap["text"].(string)
					b.WriteString(text)
				} else {
					b.WriteString(extractChildText(childMap))
				}
			}
		}
	}
	return b.String()
}

func getTemplateContent(templateType, docTitle string) (content map[string]interface{}, fullText string, publicText string) {
	switch strings.ToLower(templateType) {
	case "brief":
		content = map[string]interface{}{
			"type": "doc",
			"content": []interface{}{
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 1},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Project Brief: " + docTitle},
					},
				},
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 2},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "1. Overview & Objectives"},
					},
				},
				map[string]interface{}{
					"type": "paragraph",
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Define the primary campaign goals, target audience, and key deliverables for this video production."},
					},
				},
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 2},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "2. Deliverables & Specifications"},
					},
				},
				map[string]interface{}{
					"type": "taskList",
					"content": []interface{}{
						map[string]interface{}{
							"type":    "taskItem",
							"attrs":   map[string]interface{}{"checked": false},
							"content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "1x 60s Main Brand Film (16:9 4K)"}}}},
						},
						map[string]interface{}{
							"type":    "taskItem",
							"attrs":   map[string]interface{}{"checked": false},
							"content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "3x 15s Social Cutdowns (9:16 Vertical)"}}}},
						},
					},
				},
				map[string]interface{}{
					"type": "team_notes",
					"content": []interface{}{
						map[string]interface{}{
							"type": "paragraph",
							"content": []interface{}{
								map[string]interface{}{"type": "text", "text": "Internal Team Only: Client Budget $24,500. Target margin: 38%. Freelance DP rate: $1,200/day."},
							},
						},
					},
				},
			},
		}
		fullText = "Project Brief: " + docTitle + " 1. Overview & Objectives Define the primary campaign goals, target audience, and key deliverables. 2. Deliverables & Specifications 1x 60s Main Brand Film 3x 15s Social Cutdowns Internal Team Only: Client Budget $24,500. Target margin: 38%. Freelance DP rate: $1,200/day."
		publicText = "Project Brief: " + docTitle + " 1. Overview & Objectives Define the primary campaign goals, target audience, and key deliverables. 2. Deliverables & Specifications 1x 60s Main Brand Film 3x 15s Social Cutdowns"

	case "script":
		content = map[string]interface{}{
			"type": "doc",
			"content": []interface{}{
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 1},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Video Script: " + docTitle},
					},
				},
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 2},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Logline & Hook"},
					},
				},
				map[string]interface{}{
					"type": "paragraph",
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Hook opens on dynamic close-up. Fast-paced UGC transition introducing the product."},
					},
				},
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 2},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Two-Column AV Table"},
					},
				},
				map[string]interface{}{
					"type": "table",
					"content": []interface{}{
						map[string]interface{}{
							"type": "tableRow",
							"content": []interface{}{
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Scene"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Visual / Action"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Audio / Voiceover"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Duration"}}}}},
							},
						},
						map[string]interface{}{
							"type": "tableRow",
							"content": []interface{}{
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "01"}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Creator unboxes package with surprised expression"}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "\"I was not expecting this at all...\""}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "00:03"}}}}},
							},
						},
					},
				},
				map[string]interface{}{
					"type": "team_notes",
					"content": []interface{}{
						map[string]interface{}{
							"type": "paragraph",
							"content": []interface{}{
								map[string]interface{}{"type": "text", "text": "Internal Director Notes: Bring backup wireless mic pack. Talent needs natural lighting, no heavy ring light glare."},
							},
						},
					},
				},
			},
		}
		fullText = "Video Script: " + docTitle + " Logline & Hook Hook opens on dynamic close-up. Scene Visual Audio Duration 01 Creator unboxes package \"I was not expecting this at all...\" 00:03 Internal Director Notes: Bring backup wireless mic pack."
		publicText = "Video Script: " + docTitle + " Logline & Hook Hook opens on dynamic close-up. Scene Visual Audio Duration 01 Creator unboxes package \"I was not expecting this at all...\" 00:03"

	case "shot_list":
		content = map[string]interface{}{
			"type": "doc",
			"content": []interface{}{
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 1},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Shot List & Schedule: " + docTitle},
					},
				},
				map[string]interface{}{
					"type": "paragraph",
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Call Time: 07:30 AM | Location: Studio B | Weather Backup: Stage 2"},
					},
				},
				map[string]interface{}{
					"type": "table",
					"content": []interface{}{
						map[string]interface{}{
							"type": "tableRow",
							"content": []interface{}{
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Shot #"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Angle & Lens"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Description"}}}}},
								map[string]interface{}{"type": "tableHeader", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Status"}}}}},
							},
						},
						map[string]interface{}{
							"type": "tableRow",
							"content": []interface{}{
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "1A"}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Wide 24mm Gimbal"}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Subject enters warehouse space"}}}}},
								map[string]interface{}{"type": "tableCell", "content": []interface{}{map[string]interface{}{"type": "paragraph", "content": []interface{}{map[string]interface{}{"type": "text", "text": "Ready"}}}}},
							},
						},
					},
				},
			},
		}
		fullText = "Shot List & Schedule: " + docTitle + " Call Time: 07:30 AM Shot Angle Description Status 1A Wide 24mm Gimbal Subject enters warehouse Ready"
		publicText = fullText

	case "creator_notes":
		content = map[string]interface{}{
			"type": "doc",
			"content": []interface{}{
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 1},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Creator UGC Guidelines: " + docTitle},
					},
				},
				map[string]interface{}{
					"type":  "heading",
					"attrs": map[string]interface{}{"level": 2},
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Concept & Hooks"},
					},
				},
				map[string]interface{}{
					"type": "paragraph",
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": "Record 3 distinct hook variations in the first 3 seconds to test in paid ads."},
					},
				},
				map[string]interface{}{
					"type": "team_notes",
					"content": []interface{}{
						map[string]interface{}{
							"type": "paragraph",
							"content": []interface{}{
								map[string]interface{}{"type": "text", "text": "Internal Rate: $750 flat fee. Usage rights: 90 days organic + paid. Payment net-15 on raw footage delivery."},
							},
						},
					},
				},
			},
		}
		fullText = "Creator UGC Guidelines: " + docTitle + " Concept & Hooks Record 3 distinct hook variations in the first 3 seconds. Internal Rate: $750 flat fee. Usage rights: 90 days."
		publicText = "Creator UGC Guidelines: " + docTitle + " Concept & Hooks Record 3 distinct hook variations in the first 3 seconds."

	default:
		content = map[string]interface{}{
			"type": "doc",
			"content": []interface{}{
				map[string]interface{}{
					"type": "paragraph",
					"content": []interface{}{
						map[string]interface{}{"type": "text", "text": ""},
					},
				},
			},
		}
		fullText = ""
		publicText = ""
	}

	return content, fullText, publicText
}
