package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

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
)

type DriveHandler struct {
	queries *db.Queries
	pool    *pgxpool.Pool
	storage *storage.Client
	cfg     *config.Config
}

func NewDriveHandler(queries *db.Queries, pool *pgxpool.Pool, storage *storage.Client, cfg *config.Config) *DriveHandler {
	return &DriveHandler{
		queries: queries,
		pool:    pool,
		storage: storage,
		cfg:     cfg,
	}
}

type DriveFolderItem struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Category        string   `json:"category,omitempty"`
	IsDefaultFolder bool     `json:"is_default_folder"`
	Position        string   `json:"position"`
	FileCount       int32    `json:"file_count"`
	TotalBytes      int64    `json:"total_bytes"`
	Thumbnails      []string `json:"thumbnails"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

// EnsureDefaultFolders creates Videos, Images, Documents, Music folders if missing
func (h *DriveHandler) EnsureDefaultFolders(ctx context.Context, companyID, userID pgtype.UUID) ([]db.Item, error) {
	defaults := []struct {
		Category string
		Name     string
		Position int
	}{
		{Category: "videos", Name: "Videos", Position: 0},
		{Category: "images", Name: "Images", Position: 1},
		{Category: "documents", Name: "Documents", Position: 2},
		{Category: "music", Name: "Music", Position: 3},
	}

	var results []db.Item
	for _, def := range defaults {
		folder, err := h.queries.GetDefaultDriveFolderByCategory(ctx, db.GetDefaultDriveFolderByCategoryParams{
			CompanyID:    companyID,
			DriveOwnerID: userID,
			Category:     pgtype.Text{String: def.Category, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				created, createErr := h.queries.CreateDriveFolder(ctx, db.CreateDriveFolderParams{
					CompanyID:       companyID,
					DriveOwnerID:    userID,
					ParentID:        pgtype.UUID{Valid: false},
					Name:            def.Name,
					Position:        pgtype.Numeric{Int: big.NewInt(int64(def.Position)), Valid: true},
					IsDefaultFolder: true,
					Category:        pgtype.Text{String: def.Category, Valid: true},
				})
				if createErr != nil {
					return nil, fmt.Errorf("failed to create default folder %s: %w", def.Name, createErr)
				}
				results = append(results, created)
				continue
			}
			return nil, err
		}
		results = append(results, folder)
	}

	return results, nil
}

// ListFolders returns all root folders for caller's drive with file_count and total_bytes
func (h *DriveHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if _, err := h.EnsureDefaultFolders(ctx, companyID, user.ID); err != nil {
		slog.Error("failed to ensure default folders", "error", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_initialize_drive"})
		return
	}

	folders, err := h.queries.ListDriveFolders(ctx, db.ListDriveFoldersParams{
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_folders"})
		return
	}

	response := make([]DriveFolderItem, 0, len(folders))
	for _, f := range folders {
		stats, _ := h.queries.GetDriveFolderStats(ctx, db.GetDriveFolderStatsParams{
			CompanyID:    companyID,
			DriveOwnerID: user.ID,
			ParentID:     f.ID,
		})

		posStr := "0"
		if f.Position.Valid && f.Position.Int != nil {
			posStr = f.Position.Int.String()
		}

		thumbs := make([]string, 0, 3)
		if h.pool != nil {
			tRows, qErr := h.pool.Query(ctx, `
				SELECT fv.storage_key, fv.mime, fv.preview_keys
				FROM items i
				JOIN file_versions fv ON fv.item_id = i.id
				WHERE i.company_id = $1 AND i.drive_owner_id = $2 AND i.parent_id = $3 AND i.deleted_at IS NULL AND i.kind = 'file'
				ORDER BY i.created_at DESC
				LIMIT 3
			`, companyID, user.ID, f.ID)
			if qErr == nil {
				for tRows.Next() {
					var sKey, mime string
					var pKeys []byte
					if err := tRows.Scan(&sKey, &mime, &pKeys); err == nil {
						targetKey := sKey
						if len(pKeys) > 0 {
							var m map[string]interface{}
							if json.Unmarshal(pKeys, &m) == nil {
								if p, ok := m["poster"].(string); ok && p != "" {
									targetKey = p
								}
							}
						}
						var u string
						if h.storage != nil {
							u, _ = h.storage.PresignGetObjectInline(ctx, targetKey, mime, 2*time.Hour)
						}
						if u == "" && targetKey != "" {
							u = fmt.Sprintf("http://localhost:9000/playhead-dev/%s", targetKey)
						}
						if u != "" {
							thumbs = append(thumbs, u)
						}
					}
				}
				tRows.Close()
			}
		}

		response = append(response, DriveFolderItem{
			ID:              uuid.UUID(f.ID.Bytes).String(),
			Name:            f.Name,
			Category:        f.Category.String,
			IsDefaultFolder: f.IsDefaultFolder,
			Position:        posStr,
			FileCount:       stats.FileCount,
			TotalBytes:      stats.TotalBytes,
			Thumbnails:      thumbs,
			CreatedAt:       f.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:       f.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"folders": response,
	})
}

// ListItems returns files and custom folders inside a given folder (or root drive)
func (h *DriveHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var parentID pgtype.UUID
	folderParam := r.URL.Query().Get("folder_id")
	if folderParam != "" {
		if err := parentID.Scan(folderParam); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_folder_id"})
			return
		}
		// Verify folder ownership
		targetFolder, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        parentID,
			CompanyID: companyID,
		})
		if err != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "folder_not_found"})
			return
		}
		if !targetFolder.DriveOwnerID.Valid || targetFolder.DriveOwnerID != user.ID {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
			return
		}
	}

	items, err := h.queries.ListDriveItems(ctx, db.ListDriveItemsParams{
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
		ParentID:     parentID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_items"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
	})
}

// CreateFolder creates a new custom folder in My Drive
func (h *DriveHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req struct {
		Name     string  `json:"name"`
		ParentID *string `json:"parent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required"})
		return
	}

	var parentID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "null" {
		if err := parentID.Scan(*req.ParentID); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_parent_id"})
			return
		}
		parent, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        parentID,
			CompanyID: companyID,
		})
		if err != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "parent_folder_not_found"})
			return
		}
		if !parent.DriveOwnerID.Valid || parent.DriveOwnerID != user.ID {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
			return
		}
	}

	created, err := h.queries.CreateDriveFolder(ctx, db.CreateDriveFolderParams{
		CompanyID:       companyID,
		DriveOwnerID:    user.ID,
		ParentID:        parentID,
		Name:            req.Name,
		Position:        pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		IsDefaultFolder: false,
		Category:        pgtype.Text{Valid: false},
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_folder"})
		return
	}

	respondJSON(w, http.StatusCreated, created)
}

// RenameItem renames a custom drive item. Fails if default folder.
func (h *DriveHandler) RenameItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	// Fetch item
	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if !item.DriveOwnerID.Valid || item.DriveOwnerID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
		return
	}

	if item.IsDefaultFolder {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_modify_default_folder",
			"message": "Default folders cannot be renamed or deleted",
		})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required"})
		return
	}

	updated, err := h.queries.UpdateDriveItemName(ctx, db.UpdateDriveItemNameParams{
		ID:           itemID,
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
		Name:         req.Name,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_rename_item"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// DeleteItem soft deletes a drive item to trash. Fails if default folder.
func (h *DriveHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if !item.DriveOwnerID.Valid || item.DriveOwnerID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
		return
	}

	if item.IsDefaultFolder {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_delete_default_folder",
			"message": "Default folders cannot be deleted",
		})
		return
	}

	_ = h.queries.TrashDriveItemDescendants(ctx, db.TrashDriveItemDescendantsParams{
		ID:        itemID,
		CompanyID: companyID,
		DeletedBy: user.ID,
	})
	_ = h.queries.TrashDriveItem(ctx, db.TrashDriveItemParams{
		ID:        itemID,
		CompanyID: companyID,
		DeletedBy: user.ID,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "trashed"})
}

// RestoreItem restores a trashed drive item
func (h *DriveHandler) RestoreItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if !item.DriveOwnerID.Valid || item.DriveOwnerID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
		return
	}

	_ = h.queries.RestoreDriveItemDescendants(ctx, db.RestoreDriveItemDescendantsParams{
		ID:           itemID,
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
	})
	_ = h.queries.RestoreDriveItem(ctx, db.RestoreDriveItemParams{
		ID:           itemID,
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "restored"})
}

// MoveToProject moves a drive item and all its subfolders/renditions into a project
func (h *DriveHandler) MoveToProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if !item.DriveOwnerID.Valid || item.DriveOwnerID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
		return
	}

	if item.IsDefaultFolder {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_move_default_folder",
			"message": "Default folders cannot be moved into projects",
		})
		return
	}

	var req struct {
		TargetProjectID string  `json:"target_project_id"`
		TargetParentID  *string `json:"target_parent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var targetProjectID pgtype.UUID
	if err := targetProjectID.Scan(req.TargetProjectID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_target_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        targetProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "target_project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	var targetParentUUID uuid.UUID
	var targetParentID pgtype.UUID
	if req.TargetParentID != nil && *req.TargetParentID != "" && *req.TargetParentID != "null" {
		if pid, err := uuid.Parse(*req.TargetParentID); err == nil {
			targetParentUUID = pid
			_ = targetParentID.Scan(*req.TargetParentID)
		}
	}

	access, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, targetParentUUID)
	if err != nil || !access.CanUpload() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to add files to this project"})
		return
	}

	// Move root item and descendants in an atomic database transaction
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_begin_transaction", "message": err.Error()})
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.queries.WithTx(tx)

	moved, err := qtx.MoveDriveItemToProject(ctx, db.MoveDriveItemToProjectParams{
		ID:           itemID,
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
		ProjectID:    targetProjectID,
		ParentID:     targetParentID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_move_item", "message": err.Error()})
		return
	}

	// Move all descendants
	err = qtx.MoveDriveDescendantsToProject(ctx, db.MoveDriveDescendantsToProjectParams{
		ID:        itemID,
		CompanyID: companyID,
		ProjectID: targetProjectID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_move_descendants", "message": err.Error()})
		return
	}

	if err := qtx.RecalculateProjectAndFolderCounts(ctx, targetProjectID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_recalculate_counts", "message": err.Error()})
		return
	}
	if targetParentID.Valid {
		if err := qtx.RecalculateFolderCounts(ctx, targetParentID); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_recalculate_folder_counts", "message": err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_commit_move", "message": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, moved)
}

// CopyToProject copies a drive item and all its subfolders/renditions into a project
func (h *DriveHandler) CopyToProject(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if !item.DriveOwnerID.Valid || item.DriveOwnerID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Access to another user's drive is forbidden"})
		return
	}

	var req struct {
		TargetProjectID string  `json:"target_project_id"`
		TargetParentID  *string `json:"target_parent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var targetProjectID pgtype.UUID
	if err := targetProjectID.Scan(req.TargetProjectID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_target_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        targetProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "target_project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	var targetParentUUID uuid.UUID
	var targetParentID pgtype.UUID
	if req.TargetParentID != nil && *req.TargetParentID != "" && *req.TargetParentID != "null" {
		if pid, err := uuid.Parse(*req.TargetParentID); err == nil {
			targetParentUUID = pid
			_ = targetParentID.Scan(*req.TargetParentID)
		}
	}

	access, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, targetParentUUID)
	if err != nil || !access.CanUpload() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to add files to this project"})
		return
	}

	// Fetch all items in tree to calculate total bytes and clone
	descendants, err := h.queries.ListDriveDescendants(ctx, db.ListDriveDescendantsParams{
		ID:           itemID,
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_inspect_items"})
		return
	}

	var totalBytesToCopy int64 = 0
	for _, it := range descendants {
		if it.Kind == "file" {
			totalBytesToCopy += it.TotalBytes
		}
	}

	// Storage Quota Check
	company, err := h.queries.GetCompanyStorageDetails(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_check_storage"})
		return
	}
	if !plans.IsUnlimitedStorage(company.Plan) {
		if company.StorageLimitBytes == 0 || (company.StorageUsedBytes+totalBytesToCopy > company.StorageLimitBytes) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "quota_exceeded",
				"message": "Company storage quota exceeded. Upgrade your plan or add storage.",
			})
			return
		}
	}

	// Start atomic database transaction for copy operation
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_begin_transaction", "message": err.Error()})
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.queries.WithTx(tx)

	// Map old item ID -> new item ID
	idMap := make(map[string]pgtype.UUID)

	var rootNewItem db.Item

	for idx, it := range descendants {
		var parent pgtype.UUID
		if idx == 0 {
			parent = targetParentID
		} else if it.ParentID.Valid {
			oldParentStr := uuid.UUID(it.ParentID.Bytes).String()
			if mappedParent, ok := idMap[oldParentStr]; ok {
				parent = mappedParent
			}
		}

		name := it.Name
		if idx == 0 {
			name = fmt.Sprintf("%s (Copy)", it.Name)
		}

		created, err := qtx.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: companyID,
			ProjectID: targetProjectID,
			ParentID:  parent,
			Kind:      it.Kind,
			Name:      name,
			Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
			CreatedBy: user.ID,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_copied_item", "message": err.Error()})
			return
		}

		oldIDStr := uuid.UUID(it.ID.Bytes).String()
		idMap[oldIDStr] = created.ID

		if idx == 0 {
			rootNewItem = created
		}

		// If file, copy file_versions and renditions
		if it.Kind == "file" {
			versions, err := qtx.GetFileVersionsForItem(ctx, it.ID)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_get_file_versions", "message": err.Error()})
				return
			}
			for _, ver := range versions {
				newStorageKey := fmt.Sprintf("companies/%s/items/%s/v%d",
					uuid.UUID(companyID.Bytes).String(),
					uuid.UUID(created.ID.Bytes).String(),
					ver.Number,
				)
				if h.storage != nil {
					_ = h.storage.CopyObject(ctx, ver.StorageKey, newStorageKey)
				}

				_, err = qtx.CreateFileVersion(ctx, db.CreateFileVersionParams{
					CompanyID:     companyID,
					ItemID:        created.ID,
					Number:        ver.Number,
					StorageKey:    newStorageKey,
					SizeBytes:     ver.SizeBytes,
					Mime:          ver.Mime,
					DurationMs:    ver.DurationMs,
					Width:         ver.Width,
					Height:        ver.Height,
					Fps:           ver.Fps,
					PreviewStatus: ver.PreviewStatus,
					PreviewKeys:   ver.PreviewKeys,
					UploadedBy:    user.ID,
				})
				if err != nil {
					respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_copied_file_version", "message": err.Error()})
					return
				}
			}
		}
	}

	if totalBytesToCopy > 0 {
		if err := qtx.CommitCompanyStorage(ctx, db.CommitCompanyStorageParams{
			ID:    companyID,
			Bytes: totalBytesToCopy,
		}); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_commit_company_storage", "message": err.Error()})
			return
		}
	}

	if err := qtx.RecalculateProjectAndFolderCounts(ctx, targetProjectID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_recalculate_counts", "message": err.Error()})
		return
	}
	if targetParentID.Valid {
		if err := qtx.RecalculateFolderCounts(ctx, targetParentID); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_recalculate_folder_counts", "message": err.Error()})
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_commit_copy", "message": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, rootNewItem)
}

// ListRecentItems returns recent items for the caller
func (h *DriveHandler) ListRecentItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	items, err := h.queries.ListRecentItems(ctx, db.ListRecentItemsParams{
		CompanyID: companyID,
		UserID:    user.ID,
		Limit:     20,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_recent_items"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
	})
}

// RecordRecentItem updates or inserts a record into recent_items
func (h *DriveHandler) RecordRecentItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req struct {
		ItemID    string  `json:"item_id"`
		ItemType  string  `json:"item_type"`
		ProjectID *string `json:"project_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var itemID pgtype.UUID
	if err := itemID.Scan(req.ItemID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
		return
	}

	var projectID pgtype.UUID
	if req.ProjectID != nil && *req.ProjectID != "" && *req.ProjectID != "null" {
		_ = projectID.Scan(*req.ProjectID)
	}

	itemType := req.ItemType
	if itemType == "" {
		itemType = "file"
	}

	err := h.queries.RecordRecentItem(ctx, db.RecordRecentItemParams{
		CompanyID: companyID,
		UserID:    user.ID,
		ItemID:    itemID,
		ItemType:  itemType,
		ProjectID: projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_record_recent"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"status": "recorded"})
}

// ListTrash returns soft-deleted items in My Drive
func (h *DriveHandler) ListTrash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, ok := middleware.GetAuthenticatedUser(ctx)
	if !ok || !user.ID.Valid {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	items, err := h.queries.ListTrashedDriveItems(ctx, db.ListTrashedDriveItemsParams{
		CompanyID:    companyID,
		DriveOwnerID: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_trash"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
	})
}
