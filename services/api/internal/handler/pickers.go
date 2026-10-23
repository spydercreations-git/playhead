package handler

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type PickerItem struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Subtitle     string `json:"subtitle"`
	Email        string `json:"email,omitempty"`
	Role         string `json:"role,omitempty"`
	PictureURL   string `json:"picture_url"`
	ProjectCount int    `json:"project_count,omitempty"`
	IsInternal   bool   `json:"is_internal,omitempty"`
	ClientID     string `json:"client_id,omitempty"`
	ClientName   string `json:"client_name,omitempty"`
}

type PickerResponse struct {
	Items   []PickerItem `json:"items"`
	Total   int          `json:"total"`
	Page    int          `json:"page"`
	Limit   int          `json:"limit"`
	HasMore bool         `json:"has_more"`
}

type PickerHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewPickerHandler(pool *pgxpool.Pool, queries *db.Queries) *PickerHandler {
	return &PickerHandler{
		pool:    pool,
		queries: queries,
	}
}

// GetPickerData returns paginated entities for unified picker: clients, staff, editors, client_people
func (h *PickerHandler) GetPickerData(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	person := middleware.GetPerson(ctx)

	tab := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("tab")))
	if tab == "" {
		tab = "clients"
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	contextID := strings.TrimSpace(r.URL.Query().Get("context"))

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	var items []PickerItem
	var total int

	// Client role permission restrictions:
	// Clients see only their own client and its client people; they cannot view staff or editor lists.
	if person.IsClient() || strings.EqualFold(person.Role, "client") {
		if tab == "staff" || tab == "editors" {
			respondJSON(w, http.StatusOK, PickerResponse{
				Items:   []PickerItem{},
				Total:   0,
				Page:    page,
				Limit:   limit,
				HasMore: false,
			})
			return
		}
	}

	switch tab {
	case "clients":
		items, total = h.fetchClients(ctx, companyID, person, q, limit, offset)
	case "staff":
		items, total = h.fetchStaff(ctx, companyID, person, q, limit, offset)
	case "editors":
		items, total = h.fetchEditors(ctx, companyID, person, q, limit, offset)
	case "client_people":
		items, total = h.fetchClientPeople(ctx, companyID, person, q, contextID, limit, offset)
	default:
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_tab", "message": "tab must be clients, staff, editors, or client_people"})
		return
	}

	hasMore := (offset + len(items)) < total

	respondJSON(w, http.StatusOK, PickerResponse{
		Items:   items,
		Total:   total,
		Page:    page,
		Limit:   limit,
		HasMore: hasMore,
	})
}

func (h *PickerHandler) fetchClients(ctx context.Context, companyID pgtype.UUID, person authz.Person, q string, limit, offset int) ([]PickerItem, int) {
	var items []PickerItem
	var total int

	if h.pool == nil {
		return []PickerItem{}, 0
	}

	searchPattern := ""
	if q != "" {
		searchPattern = "%" + q + "%"
	}

	// If client user, restrict to their linked client(s)
	if person.IsClient() || strings.EqualFold(person.Role, "client") {
		countQuery := `
			SELECT count(DISTINCT c.id)
			FROM clients c
			JOIN client_contacts cc ON cc.client_id = c.id
			WHERE c.company_id = $1 AND c.deleted_at IS NULL AND lower(cc.email) = lower($2)
			  AND ($3 = '' OR c.name ILIKE $3)
		`
		_ = h.pool.QueryRow(ctx, countQuery, companyID, person.Email, searchPattern).Scan(&total)

		rowsQuery := `
			SELECT c.id, c.name, COALESCE(c.logo_key, ''), c.updated_at,
			       (SELECT count(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL AND p.company_id = c.company_id) AS project_count,
			       EXISTS(SELECT 1 FROM companies comp WHERE comp.id = c.company_id AND lower(comp.name) = lower(c.name)) AS is_internal
			FROM clients c
			JOIN client_contacts cc ON cc.client_id = c.id
			WHERE c.company_id = $1 AND c.deleted_at IS NULL AND lower(cc.email) = lower($2)
			  AND ($3 = '' OR c.name ILIKE $3)
			GROUP BY c.id, c.name, c.logo_key, c.updated_at
			ORDER BY is_internal DESC, c.name ASC
			LIMIT $4 OFFSET $5
		`
		rows, err := h.pool.Query(ctx, rowsQuery, companyID, person.Email, searchPattern, limit, offset)
		if err != nil {
			return []PickerItem{}, 0
		}
		defer rows.Close()

		for rows.Next() {
			var id pgtype.UUID
			var name, logoKey string
			var updatedAt pgtype.Timestamptz
			var projCount int
			var isInternal bool
			if err := rows.Scan(&id, &name, &logoKey, &updatedAt, &projCount, &isInternal); err == nil {
				items = append(items, formatClientItem(id, name, logoKey, updatedAt, projCount, isInternal))
			}
		}
		return items, total
	}

	// Staff / Admin / Editor: see company clients
	countQuery := `
		SELECT count(*)
		FROM clients c
		WHERE c.company_id = $1 AND c.deleted_at IS NULL
		  AND ($2 = '' OR c.name ILIKE $2)
	`
	_ = h.pool.QueryRow(ctx, countQuery, companyID, searchPattern).Scan(&total)

	rowsQuery := `
		SELECT c.id, c.name, COALESCE(c.logo_key, ''), c.updated_at,
		       (SELECT count(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL AND p.company_id = c.company_id) AS project_count,
		       EXISTS(SELECT 1 FROM companies comp WHERE comp.id = c.company_id AND lower(comp.name) = lower(c.name)) AS is_internal
		FROM clients c
		WHERE c.company_id = $1 AND c.deleted_at IS NULL
		  AND ($2 = '' OR c.name ILIKE $2)
		ORDER BY is_internal DESC, c.name ASC
		LIMIT $3 OFFSET $4
	`
	rows, err := h.pool.Query(ctx, rowsQuery, companyID, searchPattern, limit, offset)
	if err != nil {
		return []PickerItem{}, 0
	}
	defer rows.Close()

	for rows.Next() {
		var id pgtype.UUID
		var name, logoKey string
		var updatedAt pgtype.Timestamptz
		var projCount int
		var isInternal bool
		if err := rows.Scan(&id, &name, &logoKey, &updatedAt, &projCount, &isInternal); err == nil {
			items = append(items, formatClientItem(id, name, logoKey, updatedAt, projCount, isInternal))
		}
	}
	return items, total
}

func formatClientItem(id pgtype.UUID, name, logoKey string, updatedAt pgtype.Timestamptz, projCount int, isInternal bool) PickerItem {
	idStr := uuid.UUID(id.Bytes).String()
	var picURL string
	if logoKey != "" {
		if strings.HasPrefix(logoKey, "/api/v1/") {
			picURL = strings.Replace(logoKey, "/512.webp", "/128.webp", 1)
		} else {
			ts := updatedAt.Time.Unix()
			if ts <= 0 {
				ts = 1
			}
			picURL = fmt.Sprintf("/api/v1/clients/%s/picture/128.webp?v=%d", idStr, ts)
		}
	}

	var subtitle string
	if projCount == 1 {
		subtitle = "1 project"
	} else if projCount > 1 {
		subtitle = fmt.Sprintf("%d projects", projCount)
	} else {
		subtitle = "No projects yet"
	}

	if isInternal {
		subtitle = "internal · " + subtitle
	}

	return PickerItem{
		ID:           idStr,
		Name:         name,
		Subtitle:     subtitle,
		PictureURL:   picURL,
		ProjectCount: projCount,
		IsInternal:   isInternal,
	}
}

func (h *PickerHandler) fetchStaff(ctx context.Context, companyID pgtype.UUID, person authz.Person, q string, limit, offset int) ([]PickerItem, int) {
	var items []PickerItem
	var total int

	if h.pool == nil {
		return []PickerItem{}, 0
	}

	searchPattern := ""
	if q != "" {
		searchPattern = "%" + q + "%"
	}

	countQuery := `
		SELECT count(*)
		FROM memberships m
		JOIN users u ON m.user_id = u.id
		WHERE m.company_id = $1
		  AND m.role IN ('Owner', 'Admin', 'CEO', 'COO', 'CFO', 'CSO', 'DesignHead', 'Staff', 'ProjectManager')
		  AND ($2 = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
	`
	_ = h.pool.QueryRow(ctx, countQuery, companyID, searchPattern).Scan(&total)

	rowsQuery := `
		SELECT u.id, u.name, u.email, COALESCE(u.avatar_url, ''), u.updated_at, m.role
		FROM memberships m
		JOIN users u ON m.user_id = u.id
		WHERE m.company_id = $1
		  AND m.role IN ('Owner', 'Admin', 'CEO', 'COO', 'CFO', 'CSO', 'DesignHead', 'Staff', 'ProjectManager')
		  AND ($2 = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
		ORDER BY u.name ASC
		LIMIT $3 OFFSET $4
	`
	rows, err := h.pool.Query(ctx, rowsQuery, companyID, searchPattern, limit, offset)
	if err != nil {
		return []PickerItem{}, 0
	}
	defer rows.Close()

	for rows.Next() {
		var id pgtype.UUID
		var name, email, avatarURL, role string
		var updatedAt pgtype.Timestamptz
		if err := rows.Scan(&id, &name, &email, &avatarURL, &updatedAt, &role); err == nil {
			idStr := uuid.UUID(id.Bytes).String()
			picURL := ""
			if avatarURL != "" {
				picURL = strings.Replace(avatarURL, "/512.webp", "/128.webp", 1)
			}
			subtitle := fmt.Sprintf("%s · %s", role, email)
			items = append(items, PickerItem{
				ID:         idStr,
				Name:       name,
				Subtitle:   subtitle,
				Email:      email,
				Role:       role,
				PictureURL: picURL,
			})
		}
	}
	return items, total
}

func (h *PickerHandler) fetchEditors(ctx context.Context, companyID pgtype.UUID, person authz.Person, q string, limit, offset int) ([]PickerItem, int) {
	var items []PickerItem
	var total int

	if h.pool == nil {
		return []PickerItem{}, 0
	}

	searchPattern := ""
	if q != "" {
		searchPattern = "%" + q + "%"
	}

	countQuery := `
		SELECT count(*)
		FROM memberships m
		JOIN users u ON m.user_id = u.id
		WHERE m.company_id = $1
		  AND m.role = 'Editor'
		  AND ($2 = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
	`
	_ = h.pool.QueryRow(ctx, countQuery, companyID, searchPattern).Scan(&total)

	rowsQuery := `
		SELECT u.id, u.name, u.email, COALESCE(u.avatar_url, ''), u.updated_at, m.role
		FROM memberships m
		JOIN users u ON m.user_id = u.id
		WHERE m.company_id = $1
		  AND m.role = 'Editor'
		  AND ($2 = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
		ORDER BY u.name ASC
		LIMIT $3 OFFSET $4
	`
	rows, err := h.pool.Query(ctx, rowsQuery, companyID, searchPattern, limit, offset)
	if err != nil {
		return []PickerItem{}, 0
	}
	defer rows.Close()

	for rows.Next() {
		var id pgtype.UUID
		var name, email, avatarURL, role string
		var updatedAt pgtype.Timestamptz
		if err := rows.Scan(&id, &name, &email, &avatarURL, &updatedAt, &role); err == nil {
			idStr := uuid.UUID(id.Bytes).String()
			picURL := ""
			if avatarURL != "" {
				picURL = strings.Replace(avatarURL, "/512.webp", "/128.webp", 1)
			}
			subtitle := fmt.Sprintf("Editor · %s", email)
			items = append(items, PickerItem{
				ID:         idStr,
				Name:       name,
				Subtitle:   subtitle,
				Email:      email,
				Role:       role,
				PictureURL: picURL,
			})
		}
	}
	return items, total
}

func (h *PickerHandler) fetchClientPeople(ctx context.Context, companyID pgtype.UUID, person authz.Person, q, contextID string, limit, offset int) ([]PickerItem, int) {
	var items []PickerItem
	var total int

	if h.pool == nil {
		return []PickerItem{}, 0
	}

	searchPattern := ""
	if q != "" {
		searchPattern = "%" + q + "%"
	}

	// Check if contextID resolves to a client (either direct client ID or project/item client ID)
	var contextClientID pgtype.UUID
	if contextID != "" {
		if cUUID, err := uuid.Parse(contextID); err == nil {
			var foundClientID pgtype.UUID
			// Try client direct
			_ = h.pool.QueryRow(ctx, `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`, cUUID, companyID).Scan(&foundClientID)
			// Try project
			if !foundClientID.Valid {
				_ = h.pool.QueryRow(ctx, `SELECT client_id FROM projects WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`, cUUID, companyID).Scan(&foundClientID)
			}
			// Try item
			if !foundClientID.Valid {
				_ = h.pool.QueryRow(ctx, `SELECT p.client_id FROM items i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 AND i.company_id = $2 AND i.deleted_at IS NULL`, cUUID, companyID).Scan(&foundClientID)
			}
			// Try document
			if !foundClientID.Valid {
				_ = h.pool.QueryRow(ctx, `SELECT client_id FROM documents WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`, cUUID, companyID).Scan(&foundClientID)
			}
			// Try task
			if !foundClientID.Valid {
				_ = h.pool.QueryRow(ctx, `SELECT client_id FROM tasks WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`, cUUID, companyID).Scan(&foundClientID)
			}
			contextClientID = foundClientID
		}
	}

	// If client user, restrict strictly to their own client's people
	if person.IsClient() || strings.EqualFold(person.Role, "client") {
		countQuery := `
			SELECT count(DISTINCT cc.id)
			FROM client_contacts cc
			JOIN clients c ON cc.client_id = c.id
			JOIN client_contacts my_cc ON my_cc.client_id = c.id
			WHERE cc.company_id = $1 AND c.deleted_at IS NULL AND lower(my_cc.email) = lower($2)
			  AND ($3 = '' OR cc.name ILIKE $3 OR cc.email ILIKE $3 OR c.name ILIKE $3)
		`
		_ = h.pool.QueryRow(ctx, countQuery, companyID, person.Email, searchPattern).Scan(&total)

		rowsQuery := `
			SELECT DISTINCT cc.id, cc.name, cc.email, cc.client_id, c.name AS client_name,
			       COALESCE(u.id, '00000000-0000-0000-0000-000000000000'::uuid) AS user_id,
			       COALESCE(u.avatar_url, '') AS avatar_url
			FROM client_contacts cc
			JOIN clients c ON cc.client_id = c.id
			JOIN client_contacts my_cc ON my_cc.client_id = c.id
			LEFT JOIN users u ON lower(u.email) = lower(cc.email)
			WHERE cc.company_id = $1 AND c.deleted_at IS NULL AND lower(my_cc.email) = lower($2)
			  AND ($3 = '' OR cc.name ILIKE $3 OR cc.email ILIKE $3 OR c.name ILIKE $3)
			ORDER BY cc.name ASC
			LIMIT $4 OFFSET $5
		`
		rows, err := h.pool.Query(ctx, rowsQuery, companyID, person.Email, searchPattern, limit, offset)
		if err != nil {
			return []PickerItem{}, 0
		}
		defer rows.Close()

		for rows.Next() {
			var id, clientID, userID pgtype.UUID
			var name, email, clientName, avatarURL string
			if err := rows.Scan(&id, &name, &email, &clientID, &clientName, &userID, &avatarURL); err == nil {
				items = append(items, formatClientPersonItem(id, clientID, userID, name, email, clientName, avatarURL))
			}
		}
		return items, total
	}

	// For Staff / Editors
	// If contextClientID is present, optionally filter or order context clients first
	countQuery := `
		SELECT count(*)
		FROM client_contacts cc
		JOIN clients c ON cc.client_id = c.id
		WHERE cc.company_id = $1 AND c.deleted_at IS NULL
		  AND ($2 = '' OR cc.name ILIKE $2 OR cc.email ILIKE $2 OR c.name ILIKE $2)
		  AND ($3::uuid IS NULL OR cc.client_id = $3)
	`
	var filterClientID *pgtype.UUID
	if contextClientID.Valid {
		filterClientID = &contextClientID
	}
	_ = h.pool.QueryRow(ctx, countQuery, companyID, searchPattern, filterClientID).Scan(&total)

	rowsQuery := `
		SELECT cc.id, cc.name, cc.email, cc.client_id, c.name AS client_name,
		       COALESCE(u.id, '00000000-0000-0000-0000-000000000000'::uuid) AS user_id,
		       COALESCE(u.avatar_url, '') AS avatar_url
		FROM client_contacts cc
		JOIN clients c ON cc.client_id = c.id
		LEFT JOIN users u ON lower(u.email) = lower(cc.email)
		WHERE cc.company_id = $1 AND c.deleted_at IS NULL
		  AND ($2 = '' OR cc.name ILIKE $2 OR cc.email ILIKE $2 OR c.name ILIKE $2)
		  AND ($3::uuid IS NULL OR cc.client_id = $3)
		ORDER BY cc.name ASC
		LIMIT $4 OFFSET $5
	`
	rows, err := h.pool.Query(ctx, rowsQuery, companyID, searchPattern, filterClientID, limit, offset)
	if err != nil {
		return []PickerItem{}, 0
	}
	defer rows.Close()

	for rows.Next() {
		var id, clientID, userID pgtype.UUID
		var name, email, clientName, avatarURL string
		if err := rows.Scan(&id, &name, &email, &clientID, &clientName, &userID, &avatarURL); err == nil {
			items = append(items, formatClientPersonItem(id, clientID, userID, name, email, clientName, avatarURL))
		}
	}
	return items, total
}

func formatClientPersonItem(id, clientID, userID pgtype.UUID, name, email, clientName, avatarURL string) PickerItem {
	picURL := ""
	if avatarURL != "" {
		picURL = strings.Replace(avatarURL, "/512.webp", "/128.webp", 1)
	}

	subtitle := fmt.Sprintf("%s · %s", clientName, email)
	idStr := uuid.UUID(id.Bytes).String()
	if userID.Valid && userID.Bytes != [16]byte{} {
		// If linked user exists, we can use user id or contact id
		idStr = uuid.UUID(userID.Bytes).String()
	}

	return PickerItem{
		ID:         idStr,
		Name:       name,
		Subtitle:   subtitle,
		Email:      email,
		Role:       "Client",
		PictureURL: picURL,
		ClientID:   uuid.UUID(clientID.Bytes).String(),
		ClientName: clientName,
	}
}
