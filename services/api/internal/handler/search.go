package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

type SearchHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewSearchHandler(pool *pgxpool.Pool, queries *db.Queries) *SearchHandler {
	return &SearchHandler{
		pool:    pool,
		queries: queries,
	}
}

type SearchResultItem struct {
	ID        string `json:"id"`
	Type      string `json:"type"` // client, project, folder, file, task, document
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle"`
	URL       string `json:"url"`
	Category  string `json:"category,omitempty"`
	Status    string `json:"status,omitempty"`
	ProjectID string `json:"project_id,omitempty"`
	ClientID  string `json:"client_id,omitempty"`
}

// UniversalSearch handles GET /api/v1/search?q={query}
func (h *SearchHandler) UniversalSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		renderJSON(w, http.StatusOK, map[string]interface{}{"results": []SearchResultItem{}})
		return
	}

	results, err := h.performSearch(ctx, person, q)
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "search failed", "details": err.Error()})
		return
	}

	renderJSON(w, http.StatusOK, map[string]interface{}{"results": results})
}

func (h *SearchHandler) performSearch(ctx context.Context, person authz.Person, q string) ([]SearchResultItem, error) {
	results := make([]SearchResultItem, 0, 30)

	pattern := "%" + q + "%"
	tsQuery := strings.Join(strings.Fields(q), " & ")

	// 1. Clients
	clientQuery := `
		SELECT c.id, c.name, COALESCE(c.website, '') as website
		FROM clients c
		WHERE c.company_id = $1 AND c.deleted_at IS NULL
		  AND (
		    to_tsvector('english', c.name) @@ plainto_tsquery('english', $2)
		    OR c.name ILIKE $3
		  )
	`
	var clientArgs []interface{}
	if person.IsStaff() {
		clientArgs = []interface{}{person.CompanyID, q, pattern}
	} else if person.IsClient() {
		clientQuery += ` AND c.id = $4`
		clientArgs = []interface{}{person.CompanyID, q, pattern, person.ClientID}
	} else if person.IsEditor() {
		clientQuery += ` AND EXISTS (
			SELECT 1 FROM projects p
			JOIN grants g ON g.target_type = 'project' AND g.target_id = p.id
			WHERE p.client_id = c.id AND g.user_id = $4
		)`
		clientArgs = []interface{}{person.CompanyID, q, pattern, person.UserID}
	} else {
		return results, nil
	}
	clientQuery += ` LIMIT 5`

	rows, err := h.pool.Query(ctx, clientQuery, clientArgs...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			var name, website string
			if err := rows.Scan(&id, &name, &website); err == nil {
				results = append(results, SearchResultItem{
					ID:       id.String(),
					Type:     "client",
					Title:    name,
					Subtitle: "Client",
					URL:      fmt.Sprintf("/library/clients/%s", id.String()),
				})
			}
		}
	}

	// 2. Projects
	projQuery := `
		SELECT p.id, p.name, c.name as client_name, p.client_id
		FROM projects p
		JOIN clients c ON c.id = p.client_id
		WHERE p.company_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
		  AND (
		    to_tsvector('english', p.name) @@ plainto_tsquery('english', $2)
		    OR p.name ILIKE $3
		  )
	`
	var projArgs []interface{}
	if person.IsStaff() {
		projArgs = []interface{}{person.CompanyID, q, pattern}
	} else if person.IsClient() {
		projQuery += ` AND p.client_id = $4`
		projArgs = []interface{}{person.CompanyID, q, pattern, person.ClientID}
	} else if person.IsEditor() {
		projQuery += ` AND EXISTS (
			SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = p.id AND g.user_id = $4
		)`
		projArgs = []interface{}{person.CompanyID, q, pattern, person.UserID}
	}
	projQuery += ` LIMIT 8`

	projRows, err := h.pool.Query(ctx, projQuery, projArgs...)
	if err == nil {
		defer projRows.Close()
		for projRows.Next() {
			var id, clientID uuid.UUID
			var name, clientName string
			if err := projRows.Scan(&id, &name, &clientName, &clientID); err == nil {
				results = append(results, SearchResultItem{
					ID:        id.String(),
					Type:      "project",
					Title:     name,
					Subtitle:  fmt.Sprintf("Project · %s", clientName),
					URL:       fmt.Sprintf("/library/projects/%s", id.String()),
					ClientID:  clientID.String(),
					ProjectID: id.String(),
				})
			}
		}
	}

	// 3. Folders & Files
	itemQuery := `
		SELECT i.id, i.kind, i.name, COALESCE(i.category, '') as category,
		       p.id as project_id, p.name as project_name, c.name as client_name,
		       COALESCE(i.review_status, 'none') as review_status
		FROM items i
		JOIN projects p ON p.id = i.project_id
		JOIN clients c ON c.id = p.client_id
		WHERE i.company_id = $1 AND i.deleted_at IS NULL AND p.deleted_at IS NULL
		  AND i.kind IN ('folder', 'file')
		  AND (
		    to_tsvector('english', i.name) @@ plainto_tsquery('english', $2)
		    OR i.name ILIKE $3
		  )
	`
	var itemArgs []interface{}
	if person.IsStaff() {
		itemArgs = []interface{}{person.CompanyID, q, pattern}
	} else if person.IsClient() {
		itemQuery += ` AND p.client_id = $4`
		itemArgs = []interface{}{person.CompanyID, q, pattern, person.ClientID}
	} else if person.IsEditor() {
		itemQuery += ` AND EXISTS (
			SELECT 1 FROM grants g WHERE g.target_type = 'project' AND g.target_id = p.id AND g.user_id = $4
		)`
		itemArgs = []interface{}{person.CompanyID, q, pattern, person.UserID}
	}
	itemQuery += ` LIMIT 12`

	itemRows, err := h.pool.Query(ctx, itemQuery, itemArgs...)
	if err == nil {
		defer itemRows.Close()
		for itemRows.Next() {
			var id, projectID uuid.UUID
			var kind, name, category, projectName, clientName, reviewStatus string
			if err := itemRows.Scan(&id, &kind, &name, &category, &projectID, &projectName, &clientName, &reviewStatus); err == nil {
				itemURL := fmt.Sprintf("/library/projects/%s?folder=%s", projectID.String(), id.String())
				if kind == "file" {
					itemURL = fmt.Sprintf("/library/projects/%s/items/%s/review", projectID.String(), id.String())
				}
				subtitle := fmt.Sprintf("%s · %s", clientName, projectName)
				if kind == "folder" {
					subtitle = fmt.Sprintf("Folder in %s", projectName)
				}
				results = append(results, SearchResultItem{
					ID:        id.String(),
					Type:      kind,
					Title:     name,
					Subtitle:  subtitle,
					URL:       itemURL,
					Category:  category,
					Status:    reviewStatus,
					ProjectID: projectID.String(),
				})
			}
		}
	}

	// 4. Tasks (Never return internal comments to clients!)
	taskQuery := `
		SELECT t.id, t.name, t.status, c.name as client_name, t.client_id
		FROM tasks t
		JOIN clients c ON c.id = t.client_id
		WHERE t.company_id = $1 AND t.deleted_at IS NULL AND c.deleted_at IS NULL
		  AND (
		    to_tsvector('english', t.name || ' ' || COALESCE(t.description_title, '') || ' ' || COALESCE(t.description_html, '')) @@ plainto_tsquery('english', $2)
		    OR t.name ILIKE $3
		    OR t.description_html ILIKE $3
		  )
	`
	var taskArgs []interface{}
	if person.IsStaff() {
		taskArgs = []interface{}{person.CompanyID, q, pattern}
	} else if person.IsClient() {
		taskQuery += ` AND t.client_id = $4`
		taskArgs = []interface{}{person.CompanyID, q, pattern, person.ClientID}
	} else if person.IsEditor() {
		taskQuery += ` AND EXISTS (
			SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $4
		)`
		taskArgs = []interface{}{person.CompanyID, q, pattern, person.UserID}
	}
	taskQuery += ` LIMIT 8`

	taskRows, err := h.pool.Query(ctx, taskQuery, taskArgs...)
	if err == nil {
		defer taskRows.Close()
		for taskRows.Next() {
			var id, clientID uuid.UUID
			var name, status, clientName string
			if err := taskRows.Scan(&id, &name, &status, &clientName, &clientID); err == nil {
				results = append(results, SearchResultItem{
					ID:       id.String(),
					Type:     "task",
					Title:    name,
					Subtitle: fmt.Sprintf("Task · %s · %s", clientName, strings.ReplaceAll(status, "_", " ")),
					URL:      fmt.Sprintf("/tasks?task=%s", id.String()),
					Status:   status,
					ClientID: clientID.String(),
				})
			}
		}
	}

	// 5. Standalone Documents
	docQuery := `
		SELECT d.id, i.name as title, u.name as creator_name
		FROM documents d
		JOIN items i ON i.id = d.id
		LEFT JOIN users u ON u.id = i.created_by
		WHERE d.company_id = $1 AND i.deleted_at IS NULL
		  AND (
		    to_tsvector('english', d.plain_text) @@ plainto_tsquery('english', $2)
		    OR i.name ILIKE $3
		    OR d.plain_text ILIKE $3
		  )
	`
	var docArgs []interface{}
	if person.IsStaff() {
		docArgs = []interface{}{person.CompanyID, q, pattern}
	} else {
		// Owner or shared via document_shares
		docQuery += ` AND (
			i.created_by = $4
			OR EXISTS (
				SELECT 1 FROM document_shares ds WHERE ds.document_id = d.id AND ds.user_id = $4
			)
		)`
		docArgs = []interface{}{person.CompanyID, q, pattern, person.UserID}
	}
	docQuery += ` LIMIT 8`

	docRows, err := h.pool.Query(ctx, docQuery, docArgs...)
	if err == nil {
		defer docRows.Close()
		for docRows.Next() {
			var id uuid.UUID
			var title string
			var creatorName *string
			if err := docRows.Scan(&id, &title, &creatorName); err == nil {
				cName := "Playhead"
				if creatorName != nil && *creatorName != "" {
					cName = *creatorName
				}
				results = append(results, SearchResultItem{
					ID:       id.String(),
					Type:     "document",
					Title:    title,
					Subtitle: fmt.Sprintf("Document · by %s", cName),
					URL:      fmt.Sprintf("/documents/%s", id.String()),
				})
			}
		}
	}

	_ = tsQuery
	return results, nil
}
