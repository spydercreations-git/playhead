package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/redis/go-redis/v9"
)

type SpreadsheetsHandler struct {
	dbPool        *pgxpool.Pool
	q             *db.Queries
	rdb           *redis.Client
	storageClient *storage.Client
	cfg           *config.Config
}

func NewSpreadsheetsHandler(dbPool *pgxpool.Pool, q *db.Queries, rdb *redis.Client, storageClient *storage.Client, cfg *config.Config) *SpreadsheetsHandler {
	return &SpreadsheetsHandler{
		dbPool:        dbPool,
		q:             q,
		rdb:           rdb,
		storageClient: storageClient,
		cfg:           cfg,
	}
}

func canEditSheet(access authz.AccessResult) bool {
	return access.Level == authz.LevelFull || access.Level == authz.LevelUploader
}

// ---------------------------------------------------------
// Helper Types & JSON
// ---------------------------------------------------------

type CreateSpreadsheetRequest struct {
	Title    string `json:"title"`
	ParentID string `json:"parent_id,omitempty"`
	Template string `json:"template,omitempty"` // tracker, creator_payments, production_budget, shot_schedule, blank
}

type SetCellValueRequest struct {
	SheetID string      `json:"sheet_id"`
	RowID   string      `json:"row_id"`
	ColID   string      `json:"col_id"`
	Value   interface{} `json:"value"`
}

type InsertRowRequest struct {
	SheetID string `json:"sheet_id"`
	Index   int    `json:"index"`
}

type UpdateColumnMetaRequest struct {
	SheetID string   `json:"sheet_id"`
	ColID   string   `json:"col_id"`
	Name    string   `json:"name,omitempty"`
	Width   int      `json:"width,omitempty"`
	Locked  *bool    `json:"locked,omitempty"`
	Hidden  *bool    `json:"hidden,omitempty"`
	Type    string   `json:"type,omitempty"`
	Options []string `json:"options,omitempty"`
}

type CreateCommentRequest struct {
	SheetID         string `json:"sheet_id"`
	RowID           string `json:"row_id"`
	ColID           string `json:"col_id"`
	ParentCommentID string `json:"parent_comment_id,omitempty"`
	Content         string `json:"content"`
}

type SheetCollabTicketResponse struct {
	Ticket        string `json:"ticket"`
	SpreadsheetID string `json:"spreadsheet_id"`
	ExpiresAt     int64  `json:"expires_at"`
	WsURL         string `json:"ws_url"`
	ReadOnly      bool   `json:"read_only"`
	IsTeamMember  bool   `json:"is_team_member"`
}

// ---------------------------------------------------------
// Default Templates Definition
// ---------------------------------------------------------

func GetSpreadsheetTemplate(templateName string, projectMembers []string) []map[string]interface{} {
	switch strings.ToLower(templateName) {
	case "tracker":
		return []map[string]interface{}{
			{
				"id":     "sheet_1",
				"name":   "Video Tracker",
				"status": 1,
				"row":    20,
				"column": 6,
				"columnMeta": []map[string]interface{}{
					{"colIndex": 0, "name": "Video Name", "width": 240, "type": "text"},
					{"colIndex": 1, "name": "Status", "width": 140, "type": "dropdown", "options": []string{"Backlog", "In Progress", "Review Ready", "Client Feedback", "Approved"}},
					{"colIndex": 2, "name": "Editor", "width": 160, "type": "person", "options": projectMembers},
					{"colIndex": 3, "name": "Version", "width": 100, "type": "text"},
					{"colIndex": 4, "name": "Due Date", "width": 130, "type": "date"},
					{"colIndex": 5, "name": "File Link", "width": 200, "type": "file"},
				},
				"celldata": []map[string]interface{}{
					{"r": 0, "c": 0, "v": map[string]interface{}{"v": "Video Name", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					{"r": 0, "c": 1, "v": map[string]interface{}{"v": "Status", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					{"r": 0, "c": 2, "v": map[string]interface{}{"v": "Editor", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					{"r": 0, "c": 3, "v": map[string]interface{}{"v": "Version", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					{"r": 0, "c": 4, "v": map[string]interface{}{"v": "Due Date", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					{"r": 0, "c": 5, "v": map[string]interface{}{"v": "File Link", "bl": 1, "bg": "#2A2B30", "fc": "#E0E0E0"}},
					// Sample Row
					{"r": 1, "c": 0, "v": map[string]interface{}{"v": "Brand Anthem 60s"}},
					{"r": 1, "c": 1, "v": map[string]interface{}{"v": "Review Ready"}},
					{"r": 1, "c": 3, "v": map[string]interface{}{"v": "v2"}},
					{"r": 1, "c": 4, "v": map[string]interface{}{"v": "2026-10-25"}},
				},
			},
		}
	case "creator_payments":
		return []map[string]interface{}{
			{
				"id":     "sheet_1",
				"name":   "Creator Payments",
				"status": 1,
				"row":    25,
				"column": 6,
				"columnMeta": []map[string]interface{}{
					{"colIndex": 0, "name": "Creator", "width": 180, "type": "text"},
					{"colIndex": 1, "name": "Platform", "width": 120, "type": "dropdown", "options": []string{"YouTube", "TikTok", "Instagram"}},
					{"colIndex": 2, "name": "Deliverable", "width": 200, "type": "text"},
					{"colIndex": 3, "name": "Status", "width": 130, "type": "dropdown", "options": []string{"Draft", "Approved", "Paid"}},
					{"colIndex": 4, "name": "Fee ($)", "width": 120, "type": "number"},
					{"colIndex": 5, "name": "Payment Date", "width": 130, "type": "date"},
				},
				"celldata": []map[string]interface{}{
					{"r": 0, "c": 0, "v": map[string]interface{}{"v": "Creator", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 1, "v": map[string]interface{}{"v": "Platform", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 2, "v": map[string]interface{}{"v": "Deliverable", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 3, "v": map[string]interface{}{"v": "Status", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 4, "v": map[string]interface{}{"v": "Fee ($)", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 5, "v": map[string]interface{}{"v": "Payment Date", "bl": 1, "bg": "#2A2B30"}},
				},
			},
		}
	case "production_budget":
		return []map[string]interface{}{
			{
				"id":     "sheet_1",
				"name":   "Production Budget",
				"status": 1,
				"row":    30,
				"column": 6,
				"columnMeta": []map[string]interface{}{
					{"colIndex": 0, "name": "Category", "width": 160, "type": "dropdown", "options": []string{"Pre-Production", "Production", "Post-Production", "Equipment", "Travel"}},
					{"colIndex": 1, "name": "Item", "width": 220, "type": "text"},
					{"colIndex": 2, "name": "Estimated ($)", "width": 130, "type": "number"},
					{"colIndex": 3, "name": "Actual ($)", "width": 130, "type": "number"},
					{"colIndex": 4, "name": "Variance ($)", "width": 130, "type": "number"},
					{"colIndex": 5, "name": "Status", "width": 120, "type": "dropdown", "options": []string{"Pending", "Approved", "Paid"}},
				},
				"celldata": []map[string]interface{}{
					{"r": 0, "c": 0, "v": map[string]interface{}{"v": "Category", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 1, "v": map[string]interface{}{"v": "Item", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 2, "v": map[string]interface{}{"v": "Estimated ($)", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 3, "v": map[string]interface{}{"v": "Actual ($)", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 4, "v": map[string]interface{}{"v": "Variance ($)", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 5, "v": map[string]interface{}{"v": "Status", "bl": 1, "bg": "#2A2B30"}},
				},
			},
		}
	case "shot_schedule":
		return []map[string]interface{}{
			{
				"id":     "sheet_1",
				"name":   "Shot Schedule",
				"status": 1,
				"row":    30,
				"column": 7,
				"columnMeta": []map[string]interface{}{
					{"colIndex": 0, "name": "Scene", "width": 80, "type": "number"},
					{"colIndex": 1, "name": "Shot", "width": 80, "type": "text"},
					{"colIndex": 2, "name": "Description", "width": 260, "type": "text"},
					{"colIndex": 3, "name": "Location", "width": 160, "type": "text"},
					{"colIndex": 4, "name": "Talent / Cast", "width": 160, "type": "text"},
					{"colIndex": 5, "name": "Time", "width": 100, "type": "text"},
					{"colIndex": 6, "name": "Status", "width": 120, "type": "dropdown", "options": []string{"Scheduled", "Completed", "Delayed"}},
				},
				"celldata": []map[string]interface{}{
					{"r": 0, "c": 0, "v": map[string]interface{}{"v": "Scene", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 1, "v": map[string]interface{}{"v": "Shot", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 2, "v": map[string]interface{}{"v": "Description", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 3, "v": map[string]interface{}{"v": "Location", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 4, "v": map[string]interface{}{"v": "Talent / Cast", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 5, "v": map[string]interface{}{"v": "Time", "bl": 1, "bg": "#2A2B30"}},
					{"r": 0, "c": 6, "v": map[string]interface{}{"v": "Status", "bl": 1, "bg": "#2A2B30"}},
				},
			},
		}
	default:
		return []map[string]interface{}{
			{
				"id":     "sheet_1",
				"name":   "Sheet 1",
				"status": 1,
				"row":    36,
				"column": 26,
				"celldata": []map[string]interface{}{},
			},
		}
	}
}

// ---------------------------------------------------------
// Collab Service Communication Helper
// ---------------------------------------------------------

func (h *SpreadsheetsHandler) callCollabInternal(endpoint string, reqBody interface{}) ([]byte, int, error) {
	collabURL := h.cfg.CollabURL
	if collabURL == "" {
		collabURL = "http://localhost:8082"
	}
	fullURL := fmt.Sprintf("%s/internal/%s", collabURL, endpoint)

	payloadBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	req, err := http.NewRequestWithContext(context.Background(), "POST", fullURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Collab-Secret", h.cfg.CollabInternalSecret)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return body, resp.StatusCode, nil
}

// ---------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------

// CreateSpreadsheet (POST /api/v1/projects/{projectId}/spreadsheets)
func (h *SpreadsheetsHandler) CreateSpreadsheet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	projectIDStr := chi.URLParam(r, "projectId")
	projectUUID, err := uuid.Parse(projectIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	var req CreateSpreadsheetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Untitled Spreadsheet"
	}

	projTarget := authz.ProjectTarget{
		ID:        projectUUID,
		CompanyID: caller.CompanyID,
	}

	access, err := authz.Access(ctx, h.q, *caller, projTarget)
	if err != nil || (!access.CanUpload() && access.Level != authz.LevelFull) {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You cannot create spreadsheets in this project"})
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentID != "" {
		if pID, pErr := uuid.Parse(req.ParentID); pErr == nil {
			parentUUID = pgtype.UUID{Bytes: pID, Valid: true}
		}
	}

	// 1. Create base item (kind = spreadsheet)
	var pos pgtype.Numeric
	_ = pos.Scan("1")
	item, err := h.q.CreateItem(ctx, db.CreateItemParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ProjectID: pgtype.UUID{Bytes: projectUUID, Valid: true},
		ParentID:  parentUUID,
		Kind:      "spreadsheet",
		Name:      title,
		Position:  pos,
		CreatedBy: pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_item", "details": err.Error()})
		return
	}

	sheetUUID := item.ID.Bytes

	// 2. Build initial template
	templateData := GetSpreadsheetTemplate(req.Template, nil)
	initJSON, _ := json.Marshal(templateData)

	// 3. Insert record in spreadsheets table
	spreadsheet, err := h.q.CreateSpreadsheet(ctx, db.CreateSpreadsheetParams{
		ID:              pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID:       pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ContentState:    nil,
		ContentJson:     initJSON,
		PlainText:       title,
		PublicPlainText: title,
		RowCount:        int32(templateData[0]["row"].(int)),
		ColCount:        int32(templateData[0]["column"].(int)),
		CellCount:       0,
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_spreadsheet", "details": err.Error()})
		return
	}

	// 4. Initialize Y.Doc in Collab service
	_, _, _ = h.callCollabInternal("init-sheet", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sheets_data":    templateData,
	})

	renderJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         uuid.UUID(sheetUUID).String(),
		"title":      item.Name,
		"project_id": projectUUID.String(),
		"row_count":  spreadsheet.RowCount,
		"col_count":  spreadsheet.ColCount,
		"created_at": spreadsheet.CreatedAt.Time,
	})
}

// GetSpreadsheet (GET /api/v1/spreadsheets/{id})
func (h *SpreadsheetsHandler) GetSpreadsheet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		} else {
			renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		}
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// If client contact, redirect them to the sanitized view
	if !isTeamMember {
		h.GetSpreadsheetView(w, r)
		return
	}

	// For team members: return live or stored content JSON
	var contentData interface{}
	_ = json.Unmarshal(sheetRow.ContentJson, &contentData)

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":             uuid.UUID(sheetUUID).String(),
		"title":          sheetRow.Title,
		"project_id":     uuid.UUID(sheetRow.ProjectID.Bytes).String(),
		"project_name":   sheetRow.ProjectName,
		"client_id":      uuid.UUID(sheetRow.ClientID.Bytes).String(),
		"client_name":    sheetRow.ClientName,
		"can_edit":       canEditSheet(access),
		"is_team_member": true,
		"row_count":      sheetRow.RowCount,
		"col_count":      sheetRow.ColCount,
		"cell_count":     sheetRow.CellCount,
		"sheets":         contentData,
		"created_at":     sheetRow.CreatedAt.Time,
		"updated_at":     sheetRow.UpdatedAt.Time,
	})
}

// GetSpreadsheetView (GET /api/v1/spreadsheets/{id}/view)
// Server sanitized view: hidden columns are completely removed, locked columns are marked read-only.
func (h *SpreadsheetsHandler) GetSpreadsheetView(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Call collab service to get the sanitized view
	respBody, status, err := h.callCollabInternal("sheet/get-view", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sanitized":      !isTeamMember, // Clients get sanitized view
	})

	if err != nil || status != http.StatusOK {
		// Fallback: load from database and sanitize
		var sheets []map[string]interface{}
		_ = json.Unmarshal(sheetRow.ContentJson, &sheets)

		if !isTeamMember {
			// Strip hidden columns
			for sIdx := range sheets {
				if colMeta, ok := sheets[sIdx]["columnMeta"].([]interface{}); ok {
					var safeCols []interface{}
					hiddenIndices := make(map[int]bool)
					for cIdx, c := range colMeta {
						if cm, ok := c.(map[string]interface{}); ok {
							if hid, _ := cm["hidden"].(bool); hid {
								hiddenIndices[cIdx] = true
								continue
							}
						}
						safeCols = append(safeCols, c)
					}
					sheets[sIdx]["columnMeta"] = safeCols

					// Strip celldata
					if celldata, ok := sheets[sIdx]["celldata"].([]interface{}); ok {
						var safeCells []interface{}
						for _, cell := range celldata {
							if cObj, ok := cell.(map[string]interface{}); ok {
								cNum := int(cObj["c"].(float64))
								if !hiddenIndices[cNum] {
									safeCells = append(safeCells, cell)
								}
							}
						}
						sheets[sIdx]["celldata"] = safeCells
					}
				}
			}
		}

		renderJSON(w, http.StatusOK, map[string]interface{}{
			"id":             uuid.UUID(sheetUUID).String(),
			"title":          sheetRow.Title,
			"project_id":     uuid.UUID(sheetRow.ProjectID.Bytes).String(),
			"project_name":   sheetRow.ProjectName,
			"client_id":      uuid.UUID(sheetRow.ClientID.Bytes).String(),
			"client_name":    sheetRow.ClientName,
			"can_edit":       canEditSheet(access),
			"is_team_member": isTeamMember,
			"sheets":         sheets,
			"updated_at":     sheetRow.UpdatedAt.Time,
		})
		return
	}

	var collabView struct {
		Sheets []map[string]interface{} `json:"sheets"`
	}
	_ = json.Unmarshal(respBody, &collabView)

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":             uuid.UUID(sheetUUID).String(),
		"title":          sheetRow.Title,
		"project_id":     uuid.UUID(sheetRow.ProjectID.Bytes).String(),
		"project_name":   sheetRow.ProjectName,
		"client_id":      uuid.UUID(sheetRow.ClientID.Bytes).String(),
		"client_name":    sheetRow.ClientName,
		"can_edit":       canEditSheet(access),
		"is_team_member": isTeamMember,
		"sheets":         collabView.Sheets,
		"updated_at":     sheetRow.UpdatedAt.Time,
	})
}

// SetCellValue (POST /api/v1/spreadsheets/{id}/cells)
// Client and non-team edit endpoint with strict permission checks, locked column check, and validation.
func (h *SpreadsheetsHandler) SetCellValue(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	var req SetCellValueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !canEditSheet(access) {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have edit access to this spreadsheet"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// If not a team member, enforce client edit constraints (Requirement 4)
	if !isTeamMember {
		// 1. Check if column is locked or hidden
		var sheets []map[string]interface{}
		_ = json.Unmarshal(sheetRow.ContentJson, &sheets)
		for _, s := range sheets {
			if cols, ok := s["columnMeta"].([]interface{}); ok {
				for _, col := range cols {
					if cm, ok := col.(map[string]interface{}); ok {
						if cm["colId"] == req.ColID {
							if locked, _ := cm["locked"].(bool); locked {
								renderJSON(w, http.StatusForbidden, map[string]string{"error": "column_locked", "message": "This column is locked by an administrator"})
								return
							}
							if hidden, _ := cm["hidden"].(bool); hidden {
								renderJSON(w, http.StatusForbidden, map[string]string{"error": "column_hidden", "message": "This column is hidden"})
								return
							}
							// Value type validation
							colType, _ := cm["type"].(string)
							switch colType {
							case "dropdown":
								if req.Value != nil {
									valStr := fmt.Sprintf("%v", req.Value)
									if valMap, ok := req.Value.(map[string]interface{}); ok {
										valStr = fmt.Sprintf("%v", valMap["v"])
									}
									matched := false
									if opts, ok := cm["options"].([]interface{}); ok {
										for _, opt := range opts {
											if fmt.Sprintf("%v", opt) == valStr {
												matched = true
												break
											}
										}
									}
									if !matched && valStr != "" {
										renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_dropdown_value", "message": "Value does not match dropdown options"})
										return
									}
								}
							case "date":
								if req.Value != nil {
									valStr := fmt.Sprintf("%v", req.Value)
									if valMap, ok := req.Value.(map[string]interface{}); ok {
										valStr = fmt.Sprintf("%v", valMap["v"])
									}
									if valStr != "" {
										if _, dErr := time.Parse("2006-01-02", valStr); dErr != nil {
											renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_date_format", "message": "Date must be YYYY-MM-DD"})
											return
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	// Forward cell edit to collab service
	respBody, status, err := h.callCollabInternal("sheet/set-cell", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sheet_id":       req.SheetID,
		"row_id":         req.RowID,
		"col_id":         req.ColID,
		"value":          req.Value,
	})

	if err != nil || status != http.StatusOK {
		renderJSON(w, http.StatusBadGateway, map[string]string{"error": "collab_service_error", "details": string(respBody)})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"row_id":         req.RowID,
		"col_id":         req.ColID,
	})
}

// InsertRow (POST /api/v1/spreadsheets/{id}/rows)
func (h *SpreadsheetsHandler) InsertRow(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	var req InsertRowRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !canEditSheet(access) {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	respBody, status, err := h.callCollabInternal("sheet/insert-row", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sheet_id":       req.SheetID,
		"index":          req.Index,
	})

	if err != nil || status != http.StatusOK {
		renderJSON(w, http.StatusBadGateway, map[string]string{"error": "collab_service_error", "details": string(respBody)})
		return
	}

	var resData map[string]interface{}
	_ = json.Unmarshal(respBody, &resData)

	renderJSON(w, http.StatusOK, resData)
}

// UpdateColumnMeta (PATCH /api/v1/spreadsheets/{id}/columns)
// Admin/Manager only or Team Full access: lock or hide column
func (h *SpreadsheetsHandler) UpdateColumnMeta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	var req UpdateColumnMetaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Clients are NEVER allowed to lock, hide, or alter columns
	if !isTeamMember {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only team members can configure columns"})
		return
	}

	metaUpdates := make(map[string]interface{})
	if req.Name != "" {
		metaUpdates["name"] = req.Name
	}
	if req.Width > 0 {
		metaUpdates["width"] = req.Width
	}
	if req.Locked != nil {
		metaUpdates["locked"] = *req.Locked
	}
	if req.Hidden != nil {
		metaUpdates["hidden"] = *req.Hidden
	}
	if req.Type != "" {
		metaUpdates["type"] = req.Type
	}
	if len(req.Options) > 0 {
		metaUpdates["options"] = req.Options
	}

	respBody, status, err := h.callCollabInternal("sheet/set-column-meta", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sheet_id":       req.SheetID,
		"col_id":         req.ColID,
		"meta":           metaUpdates,
	})

	if err != nil || status != http.StatusOK {
		renderJSON(w, http.StatusBadGateway, map[string]string{"error": "collab_service_error", "details": string(respBody)})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"col_id":         req.ColID,
	})
}

// CreateCollabTicket (POST /api/v1/spreadsheets/{id}/collab-ticket)
func (h *SpreadsheetsHandler) CreateCollabTicket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !access.CanView() {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Hard Rule: Non-team people NEVER get live Yjs connection
	if !isTeamMember {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Non-team members cannot connect to live collaboration"})
		return
	}

	expiresAt := time.Now().Add(60 * time.Second)
	ticket := GenerateCollabTicket(h.cfg.CollabInternalSecret, sheetUUID, caller.UserID, expiresAt)

	collabWsURL := strings.Replace(h.cfg.CollabURL, "http://", "ws://", 1)
	collabWsURL = strings.Replace(collabWsURL, "https://", "wss://", 1)

	renderJSON(w, http.StatusOK, SheetCollabTicketResponse{
		Ticket:        ticket,
		SpreadsheetID: uuid.UUID(sheetUUID).String(),
		ExpiresAt:     expiresAt.Unix(),
		WsURL:         collabWsURL,
		ReadOnly:      !canEditSheet(access),
		IsTeamMember:  true,
	})
}

// ImportSpreadsheet (POST /api/v1/spreadsheets/{id}/import)
func (h *SpreadsheetsHandler) ImportSpreadsheet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	// 25MB Limit check
	const MAX_IMPORT_BYTES = 25 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, MAX_IMPORT_BYTES)

	err = r.ParseMultipartForm(MAX_IMPORT_BYTES)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "file_too_large", "message": "File exceeds 25MB limit"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_file"})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_read_file"})
		return
	}

	sheetRow, err := h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		ClientID:  sheetRow.ClientID.Bytes,
	}
	itemTarget := authz.ItemTarget{
		ID:        sheetUUID,
		ProjectID: sheetRow.ProjectID.Bytes,
		CompanyID: caller.CompanyID,
		CreatedBy: sheetRow.CreatedBy.Bytes,
	}

	access, err := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
	if err != nil || !canEditSheet(access) {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	b64File := base64.StdEncoding.EncodeToString(fileBytes)

	respBody, status, err := h.callCollabInternal("sheet/import-excel", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"file_base64":    b64File,
		"filename":       header.Filename,
		"user_id":        caller.UserID.String(),
	})

	if err != nil || status != http.StatusOK {
		renderJSON(w, http.StatusBadGateway, map[string]string{"error": "import_failed", "details": string(respBody)})
		return
	}

	var resData map[string]interface{}
	_ = json.Unmarshal(respBody, &resData)

	renderJSON(w, http.StatusOK, resData)
}

// ListSpreadsheets (GET /api/v1/spreadsheets or GET /api/v1/projects/{projectId}/spreadsheets)
func (h *SpreadsheetsHandler) ListSpreadsheets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var projFilter pgtype.UUID
	projectIDStr := chi.URLParam(r, "projectId")
	if projectIDStr != "" {
		if pID, pErr := uuid.Parse(projectIDStr); pErr == nil {
			projFilter = pgtype.UUID{Bytes: pID, Valid: true}
		}
	}

	sheets, err := h.q.ListSpreadsheetsForCompany(ctx, db.ListSpreadsheetsForCompanyParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
		ProjectID: projFilter,
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		return
	}

	type SheetItem struct {
		ID          string    `json:"id"`
		Title       string    `json:"title"`
		ProjectID   string    `json:"project_id"`
		ProjectName string    `json:"project_name"`
		ClientID    string    `json:"client_id"`
		ClientName  string    `json:"client_name"`
		RowCount    int32     `json:"row_count"`
		ColCount    int32     `json:"col_count"`
		CellCount   int32     `json:"cell_count"`
		UpdatedAt   time.Time `json:"updated_at"`
		CreatedAt   time.Time `json:"created_at"`
		IsStarred   bool      `json:"is_starred"`
		CanEdit     bool      `json:"can_edit"`
	}

	var items []SheetItem
	for _, s := range sheets {
		projTarget := authz.ProjectTarget{
			ID:        s.ProjectID.Bytes,
			CompanyID: caller.CompanyID,
			ClientID:  s.ClientID.Bytes,
		}
		itemTarget := authz.ItemTarget{
			ID:        s.ID.Bytes,
			ProjectID: s.ProjectID.Bytes,
			CompanyID: caller.CompanyID,
			CreatedBy: s.CreatedBy.Bytes,
		}

		access, aErr := authz.AccessItem(ctx, h.q, *caller, projTarget, itemTarget)
		if aErr != nil || !access.CanView() {
			continue
		}

		items = append(items, SheetItem{
			ID:          uuid.UUID(s.ID.Bytes).String(),
			Title:       s.Title,
			ProjectID:   uuid.UUID(s.ProjectID.Bytes).String(),
			ProjectName: s.ProjectName,
			ClientID:    uuid.UUID(s.ClientID.Bytes).String(),
			ClientName:  s.ClientName,
			RowCount:    s.RowCount,
			ColCount:    s.ColCount,
			CellCount:   s.CellCount,
			UpdatedAt:   s.UpdatedAt.Time,
			CreatedAt:   s.CreatedAt.Time,
			IsStarred:   s.IsStarred,
			CanEdit:     canEditSheet(access),
		})
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"spreadsheets": items,
		"count":        len(items),
	})
}

// ListVersions (GET /api/v1/spreadsheets/{id}/versions)
func (h *SpreadsheetsHandler) ListVersions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	_, err = h.q.GetSpreadsheet(ctx, db.GetSpreadsheetParams{
		ID:        pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "spreadsheet_not_found"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")

	// Clients cannot see version history (Requirement 9)
	if !isTeamMember {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Version history is only available to team members"})
		return
	}

	versions, err := h.q.ListSpreadsheetVersions(ctx, db.ListSpreadsheetVersionsParams{
		SpreadsheetID: pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID:     pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		return
	}

	type VersionItem struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		IsNamed     bool      `json:"is_named"`
		AuthorName  string    `json:"author_name"`
		AuthorEmail string    `json:"author_email"`
		CreatedAt   time.Time `json:"created_at"`
	}

	var items []VersionItem
	for _, v := range versions {
		author := "Automatic"
		if v.AuthorName.Valid && v.AuthorName.String != "" {
			author = v.AuthorName.String
		}
		name := "Version"
		if v.Name.Valid && v.Name.String != "" {
			name = v.Name.String
		}
		items = append(items, VersionItem{
			ID:          uuid.UUID(v.ID.Bytes).String(),
			Name:        name,
			IsNamed:     v.IsNamed,
			AuthorName:  author,
			AuthorEmail: v.AuthorEmail.String,
			CreatedAt:   v.CreatedAt.Time,
		})
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"versions": items,
	})
}

// RestoreVersion (POST /api/v1/spreadsheets/{id}/versions/{versionId}/restore)
func (h *SpreadsheetsHandler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	versionIDStr := chi.URLParam(r, "versionId")
	versionUUID, err := uuid.Parse(versionIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_version_id"})
		return
	}

	membership, mErr := h.q.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		UserID:    pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	isTeamMember := (mErr == nil && membership.Role != "")
	if !isTeamMember {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only team members can restore versions"})
		return
	}

	vRow, err := h.q.GetSpreadsheetVersion(ctx, db.GetSpreadsheetVersionParams{
		ID:            pgtype.UUID{Bytes: versionUUID, Valid: true},
		SpreadsheetID: pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID:     pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusNotFound, map[string]string{"error": "version_not_found"})
		return
	}

	var sheetsData interface{}
	_ = json.Unmarshal(vRow.ContentJson, &sheetsData)

	respBody, status, err := h.callCollabInternal("sheet/replace-content", map[string]interface{}{
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"sheets_data":    sheetsData,
		"version_name":   fmt.Sprintf("Restored: %s", vRow.Name.String),
		"is_named":       true,
		"user_id":        caller.UserID.String(),
	})

	if err != nil || status != http.StatusOK {
		renderJSON(w, http.StatusBadGateway, map[string]string{"error": "collab_service_error", "details": string(respBody)})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"ok":             true,
		"spreadsheet_id": uuid.UUID(sheetUUID).String(),
		"version_id":     versionIDStr,
	})
}

// ListComments (GET /api/v1/spreadsheets/{id}/comments)
func (h *SpreadsheetsHandler) ListComments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	comments, err := h.q.ListSpreadsheetComments(ctx, db.ListSpreadsheetCommentsParams{
		SpreadsheetID: pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID:     pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "database_error"})
		return
	}

	type CommentItem struct {
		ID              string    `json:"id"`
		SheetID         string    `json:"sheet_id"`
		RowID           string    `json:"row_id"`
		ColID           string    `json:"col_id"`
		AuthorID        string    `json:"author_id"`
		AuthorName      string    `json:"author_name"`
		AuthorEmail     string    `json:"author_email"`
		AuthorAvatarURL string    `json:"author_avatar_url"`
		ParentCommentID string    `json:"parent_comment_id,omitempty"`
		Content         string    `json:"content"`
		Resolved        bool      `json:"resolved"`
		CreatedAt       time.Time `json:"created_at"`
	}

	var items []CommentItem
	for _, c := range comments {
		var parentID string
		if c.ParentCommentID.Valid {
			parentID = uuid.UUID(c.ParentCommentID.Bytes).String()
		}
		items = append(items, CommentItem{
			ID:              uuid.UUID(c.ID.Bytes).String(),
			SheetID:         c.SheetID,
			RowID:           c.RowID,
			ColID:           c.ColID,
			AuthorID:        uuid.UUID(c.AuthorID.Bytes).String(),
			AuthorName:      c.AuthorName,
			AuthorEmail:     c.AuthorEmail,
			AuthorAvatarURL: c.AuthorAvatarUrl.String,
			ParentCommentID: parentID,
			Content:         c.Content,
			Resolved:        c.Resolved,
			CreatedAt:       c.CreatedAt.Time,
		})
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"comments": items,
	})
}

// CreateComment (POST /api/v1/spreadsheets/{id}/comments)
func (h *SpreadsheetsHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sheetIDStr := chi.URLParam(r, "id")
	sheetUUID, err := uuid.Parse(sheetIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_spreadsheet_id"})
		return
	}

	var req CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentCommentID != "" {
		if pID, pErr := uuid.Parse(req.ParentCommentID); pErr == nil {
			parentUUID = pgtype.UUID{Bytes: pID, Valid: true}
		}
	}

	comment, err := h.q.CreateSpreadsheetComment(ctx, db.CreateSpreadsheetCommentParams{
		SpreadsheetID:   pgtype.UUID{Bytes: sheetUUID, Valid: true},
		CompanyID:       pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		SheetID:         req.SheetID,
		RowID:           req.RowID,
		ColID:           req.ColID,
		AuthorID:        pgtype.UUID{Bytes: caller.UserID, Valid: true},
		ParentCommentID: parentUUID,
		Content:         strings.TrimSpace(req.Content),
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_comment"})
		return
	}

	renderJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         uuid.UUID(comment.ID.Bytes).String(),
		"sheet_id":   comment.SheetID,
		"row_id":     comment.RowID,
		"col_id":     comment.ColID,
		"content":    comment.Content,
		"created_at": comment.CreatedAt.Time,
	})
}

// ResolveComment (PATCH /api/v1/spreadsheets/{id}/comments/{commentId}/resolve)
func (h *SpreadsheetsHandler) ResolveComment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller := getCaller(ctx)
	if caller == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	commentIDStr := chi.URLParam(r, "commentId")
	commentUUID, err := uuid.Parse(commentIDStr)
	if err != nil {
		renderJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id"})
		return
	}

	resolved, err := h.q.ResolveSpreadsheetComment(ctx, db.ResolveSpreadsheetCommentParams{
		ID:         pgtype.UUID{Bytes: commentUUID, Valid: true},
		CompanyID:  pgtype.UUID{Bytes: caller.CompanyID, Valid: true},
		ResolvedBy: pgtype.UUID{Bytes: caller.UserID, Valid: true},
	})
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_resolve_comment"})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{
		"id":       uuid.UUID(resolved.ID.Bytes).String(),
		"resolved": resolved.Resolved,
	})
}
