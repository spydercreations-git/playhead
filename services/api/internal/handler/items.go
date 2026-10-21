package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
)

// ItemsHandler handles item (folder & file) operations
type ItemsHandler struct {
	queries *db.Queries
	storage *storage.Client
}

func NewItemsHandler(queries *db.Queries, storage *storage.Client) *ItemsHandler {
	return &ItemsHandler{
		queries: queries,
		storage: storage,
	}
}

// ListItems returns non-deleted items in a folder or root of a project
func (h *ItemsHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        projectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(r.Context())

	var parentUUID pgtype.UUID
	var folderUUID uuid.UUID
	parentIDStr := r.URL.Query().Get("parent_id")
	if parentIDStr != "" && parentIDStr != "null" && parentIDStr != "undefined" {
		if pid, err := uuid.Parse(parentIDStr); err == nil {
			parentUUID = pgtype.UUID{Bytes: pid, Valid: true}
			folderUUID = pid
		}
	}

	folderAccess, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}, folderUUID)
	if err != nil || !folderAccess.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	items, err := h.queries.ListItemsWithVersions(ctx, db.ListItemsWithVersionsParams{
		CompanyID: companyID,
		ProjectID: projectID,
		ParentID:  parentUUID,
		UserID:    user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_items"})
		return
	}

	// Filter by type if requested
	typeFilter := strings.ToLower(r.URL.Query().Get("type"))
	filtered := make([]map[string]interface{}, 0, len(items))

	for _, item := range items {

		if typeFilter != "" && typeFilter != "all" && item.Kind == "file" {
			mime := strings.ToLower(item.LatestMime)
			name := strings.ToLower(item.Name)
			matches := false

			switch typeFilter {
			case "videos":
				matches = strings.HasPrefix(mime, "video/") || strings.HasSuffix(name, ".mp4") || strings.HasSuffix(name, ".mov") || strings.HasSuffix(name, ".webm")
			case "audio":
				matches = strings.HasPrefix(mime, "audio/") || strings.HasSuffix(name, ".mp3") || strings.HasSuffix(name, ".wav") || strings.HasSuffix(name, ".aac")
			case "images":
				matches = strings.HasPrefix(mime, "image/") || strings.HasSuffix(name, ".png") || strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".jpeg")
			case "documents":
				matches = strings.Contains(mime, "pdf") || strings.Contains(mime, "word") || strings.Contains(mime, "document") || strings.HasSuffix(name, ".pdf") || strings.HasSuffix(name, ".docx")
			case "spreadsheets":
				matches = strings.Contains(mime, "sheet") || strings.Contains(mime, "excel") || strings.Contains(mime, "csv") || strings.HasSuffix(name, ".xlsx") || strings.HasSuffix(name, ".csv")
			default:
				matches = true
			}

			if !matches {
				continue
			}
		}

		itemMap := map[string]interface{}{
			"id":              item.ID,
			"project_id":      item.ProjectID,
			"parent_id":       item.ParentID,
			"kind":            item.Kind,
			"name":            item.Name,
			"position":        item.Position,
			"file_count":      item.FileCount,
			"folder_count":    item.FolderCount,
			"video_count":     item.VideoCount,
			"total_bytes":     item.TotalBytes,
			"review_status":   item.ReviewStatus,
			"storage_key":     item.LatestStorageKey,
			"size_bytes":      item.LatestSizeBytes,
			"mime":            item.LatestMime,
			"version_number":  item.LatestVersionNumber,
			"created_by":      item.CreatedBy,
			"created_by_name": item.CreatedByName,
			"is_starred":      item.IsStarred,
			"created_at":      item.CreatedAt,
			"updated_at":      item.UpdatedAt,
		}
		filtered = append(filtered, itemMap)
	}

	// Ancestors / Breadcrumbs if parent_id is specified
	var breadcrumbs []map[string]interface{}
	if parentUUID.Valid {
		ancestors, err := h.queries.GetItemAncestors(ctx, db.GetItemAncestorsParams{
			ItemID:    parentUUID,
			CompanyID: companyID,
		})
		if err == nil {
			for _, a := range ancestors {
				breadcrumbs = append(breadcrumbs, map[string]interface{}{
					"id":        a.ID,
					"parent_id": a.ParentID,
					"name":      a.Name,
					"kind":      a.Kind,
				})
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"project": map[string]interface{}{
			"id":              proj.ID,
			"name":            proj.Name,
			"client_id":       proj.ClientID,
			"client_name":     proj.ClientName,
			"tracker_item_id": proj.TrackerItemID,
			"file_count":      proj.FileCount,
			"folder_count":    proj.FolderCount,
			"video_count":     proj.VideoCount,
			"total_bytes":     proj.TotalBytes,
		},
		"access": map[string]interface{}{
			"level":                   folderAccess.Level,
			"can_download":            folderAccess.CanDownload,
			"can_upload":              folderAccess.CanUpload(),
			"can_manage":              folderAccess.CanManage(),
			"can_share":               authz.CanShareItem(person, folderAccess),
			"can_create_public_links": authz.CanCreatePublicShareLink(person, folderAccess),
		},
		"breadcrumbs": breadcrumbs,
		"items":       filtered,
	})
}

// ListFoldersTree returns the recursive folder hierarchy of a project for sidebar and move picker
func (h *ItemsHandler) ListFoldersTree(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var projectID pgtype.UUID
	if err := projectID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        projectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	projTarget := authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}

	folders, err := h.queries.ListAllProjectFolders(ctx, db.ListAllProjectFoldersParams{
		CompanyID: companyID,
		ProjectID: projectID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_load_folders"})
		return
	}

	var visibleFolders []db.ListAllProjectFoldersRow
	for _, f := range folders {
		fAccess, err := authz.AccessFolder(ctx, h.queries, person, projTarget, uuid.UUID(f.ID.Bytes))
		if err == nil && fAccess.CanView() {
			visibleFolders = append(visibleFolders, f)
		}
	}

	rootAccess, _ := authz.AccessFolder(ctx, h.queries, person, projTarget, uuid.Nil)
	if !rootAccess.CanView() && len(visibleFolders) == 0 {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	if visibleFolders == nil {
		visibleFolders = []db.ListAllProjectFoldersRow{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"folders": visibleFolders,
	})
}

type createFolderReq struct {
	ProjectID string  `json:"project_id"`
	ParentID  *string `json:"parent_id"`
	Name      string  `json:"name"`
}

// CreateFolder creates a new folder, or returns existing if merging same-named folder
func (h *ItemsHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req createFolderReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required"})
		return
	}

	var projID pgtype.UUID
	projIDStr := req.ProjectID
	if projIDStr == "" {
		if idParam := chi.URLParam(r, "id"); idParam != "" {
			projIDStr = idParam
		} else if pidParam := chi.URLParam(r, "project_id"); pidParam != "" {
			projIDStr = pidParam
		}
	}
	if err := projID.Scan(projIDStr); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        projID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)

	var parentUUID pgtype.UUID
	var parentFolderUUID uuid.UUID
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "null" {
		if pid, pErr := uuid.Parse(*req.ParentID); pErr == nil {
			parentUUID = pgtype.UUID{Bytes: pid, Valid: true}
			parentFolderUUID = pid
		}
	}

	access, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}, parentFolderUUID)
	if err != nil || !access.CanEdit() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to create folders here"})
		return
	}

	// Requirement 5: Folder uploads merge into existing folders with the same name
	existing, err := h.queries.FindItemInParentByName(ctx, db.FindItemInParentByNameParams{
		CompanyID: companyID,
		ProjectID: projID,
		ParentID:  parentUUID,
		Name:      req.Name,
	})
	if err == nil && existing.Kind == "folder" {
		// Existing folder found: return it directly to merge
		respondJSON(w, http.StatusOK, existing)
		return
	}

	item, err := h.queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: companyID,
		ProjectID: projID,
		ParentID:  parentUUID,
		Kind:      "folder",
		Name:      req.Name,
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_folder"})
		return
	}

	// Update counts
	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, projID)
	if parentUUID.Valid {
		_ = h.queries.RecalculateFolderCounts(ctx, parentUUID)
	}

	respondJSON(w, http.StatusCreated, item)
}

type updateItemReq struct {
	Name *string `json:"name"`
}

// RenameItem renames a folder or file, or updates its restricted status
func (h *ItemsHandler) RenameItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
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

	var req updateItemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if req.Name == nil || strings.TrimSpace(*req.Name) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_fields_to_update"})
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

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var createdByUUID uuid.UUID
	if item.CreatedBy.Valid {
		createdByUUID = uuid.UUID(item.CreatedBy.Bytes)
	}

	var resultItem interface{} = item

	if item.IsTracker {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_rename_tracker",
			"message": "Project tracker cannot be renamed",
		})
		return
	}

	if req.Name != nil {
		trimmedName := strings.TrimSpace(*req.Name)
		if trimmedName == "" {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "name_required"})
			return
		}
		// Enforce Requirement 4: Uploader cannot rename someone else's file; Viewer/Commenter cannot rename
		if !access.CanModifyItem(person, createdByUUID) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to rename this item"})
			return
		}
		updated, err := h.queries.RenameItem(ctx, db.RenameItemParams{
			ID:        itemID,
			CompanyID: companyID,
			Name:      trimmedName,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_rename_item"})
			return
		}
		resultItem = updated
	}

	respondJSON(w, http.StatusOK, resultItem)
}

type moveItemReq struct {
	TargetParentID *string `json:"target_parent_id"`
}

// MoveItem moves an item to another folder, checking circular references
func (h *ItemsHandler) MoveItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
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

	var req moveItemReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
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

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if item.IsTracker {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_move_tracker",
			"message": "Project tracker cannot be moved",
		})
		return
	}

	var createdByUUID uuid.UUID
	if item.CreatedBy.Valid {
		createdByUUID = uuid.UUID(item.CreatedBy.Bytes)
	}
	if !access.CanModifyItem(person, createdByUUID) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to move this item"})
		return
	}

	var targetParentUUID pgtype.UUID
	var targetFolderUUID uuid.UUID
	if req.TargetParentID != nil && *req.TargetParentID != "" && *req.TargetParentID != "null" {
		if pid, err := uuid.Parse(*req.TargetParentID); err == nil {
			targetParentUUID = pgtype.UUID{Bytes: pid, Valid: true}
			targetFolderUUID = pid
		} else {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_target_parent_id"})
			return
		}

		// Prevent moving folder into itself
		if item.Kind == "folder" && item.ID == targetParentUUID {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot_move_into_self", "message": "Cannot move a folder into itself"})
			return
		}

		// Prevent circular moves: target cannot be a child/descendant of source folder
		if item.Kind == "folder" {
			ancestors, err := h.queries.GetItemAncestors(ctx, db.GetItemAncestorsParams{
				ItemID:    targetParentUUID,
				CompanyID: companyID,
			})
			if err == nil {
				for _, a := range ancestors {
					if a.ID == item.ID {
						respondJSON(w, http.StatusBadRequest, map[string]string{"error": "circular_move", "message": "Cannot move a folder into its own subfolder"})
						return
					}
				}
			}
		}
	}

	targetAccess, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, targetFolderUUID)
	if err != nil || !targetAccess.CanUpload() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to upload/move into target folder"})
		return
	}


	oldParentUUID := item.ParentID

	moved, err := h.queries.MoveItem(ctx, db.MoveItemParams{
		ID:          itemID,
		CompanyID:   companyID,
		NewParentID: targetParentUUID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_move_item"})
		return
	}

	// Update counts for old parent and new parent and their ancestors
	if oldParentUUID.Valid {
		h.updateAncestorsFolderCounts(ctx, oldParentUUID, companyID)
	}
	if targetParentUUID.Valid {
		h.updateAncestorsFolderCounts(ctx, targetParentUUID, companyID)
	}
	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, item.ProjectID)

	respondJSON(w, http.StatusOK, moved)
}

// CopyItem makes a server-side copy of an item (Requirement 9: zero bytes through API)
func (h *ItemsHandler) CopyItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
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

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	var parentFolderUUID uuid.UUID
	if item.ParentID.Valid {
		parentFolderUUID = uuid.UUID(item.ParentID.Bytes)
	}

	destAccess, err := authz.AccessFolder(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, parentFolderUUID)
	if err != nil || !destAccess.CanUpload() {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to copy items here"})
		return
	}

	copyName := fmt.Sprintf("%s (Copy)", item.Name)
	newItem, err := h.queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
		CompanyID: companyID,
		ProjectID: item.ProjectID,
		ParentID:  item.ParentID,
		Kind:      item.Kind,
		Name:      copyName,
		Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
		CreatedBy: user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_copy_item"})
		return
	}

	// If file, copy S3 storage key server-side: Requirement 7 & 9
	if item.Kind == "file" && item.LatestStorageKey != "" {
		newStorageKey := fmt.Sprintf("companies/%s/items/%s/v1", uuid.UUID(companyID.Bytes).String(), uuid.UUID(newItem.ID.Bytes).String())
		if h.storage != nil {
			_ = h.storage.CopyObject(ctx, item.LatestStorageKey, newStorageKey)
		}

		_, _ = h.queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
			CompanyID:     companyID,
			ItemID:        newItem.ID,
			Number:        1,
			StorageKey:    newStorageKey,
			SizeBytes:     item.LatestSizeBytes,
			Mime:          item.LatestMime,
			PreviewStatus: "none",
			PreviewKeys:   []byte("{}"),
			UploadedBy:    user.ID,
		})

		_ = h.queries.CommitCompanyStorage(ctx, db.CommitCompanyStorageParams{
			ID:    companyID,
			Bytes: item.LatestSizeBytes,
		})
	}

	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, item.ProjectID)
	if item.ParentID.Valid {
		_ = h.queries.RecalculateFolderCounts(ctx, item.ParentID)
	}

	respondJSON(w, http.StatusCreated, newItem)
}

// DeleteItem soft deletes an item into Trash (recalculating active counts)
func (h *ItemsHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
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

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if item.IsTracker {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "cannot_delete_tracker",
			"message": "Project tracker cannot be deleted",
		})
		return
	}

	var createdByUUID uuid.UUID
	if item.CreatedBy.Valid {
		createdByUUID = uuid.UUID(item.CreatedBy.Bytes)
	}
	if !access.CanModifyItem(person, createdByUUID) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to delete this item"})
		return
	}

	batchID := uuid.New()
	batchPgUUID := pgtype.UUID{Bytes: batchID, Valid: true}

	if item.Kind == "folder" {
		descendants, dErr := h.queries.GetItemDescendants(ctx, db.GetItemDescendantsParams{
			ItemID:    itemID,
			CompanyID: companyID,
		})
		var itemIDs []pgtype.UUID
		if dErr == nil && len(descendants) > 0 {
			for _, d := range descendants {
				itemIDs = append(itemIDs, d.ID)
			}
		} else {
			itemIDs = []pgtype.UUID{itemID}
		}
		_ = h.queries.SoftDeleteItemsCascade(ctx, db.SoftDeleteItemsCascadeParams{
			CompanyID:     companyID,
			ItemIds:       itemIDs,
			DeletedBy:     user.ID,
			DeleteBatchID: batchPgUUID,
		})
	} else {
		_ = h.queries.SoftDeleteItemsCascade(ctx, db.SoftDeleteItemsCascadeParams{
			CompanyID:     companyID,
			ItemIds:       []pgtype.UUID{itemID},
			DeletedBy:     user.ID,
			DeleteBatchID: batchPgUUID,
		})
	}

	// Recalculate counts without Trash
	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, item.ProjectID)
	if item.ParentID.Valid {
		h.updateAncestorsFolderCounts(ctx, item.ParentID, companyID)
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

type batchActionReq struct {
	ItemIDs        []string `json:"item_ids"`
	Action         string   `json:"action"` // "delete", "move"
	TargetParentID *string  `json:"target_parent_id"`
}

// BatchAction performs multiple item moves or soft-deletes
func (h *ItemsHandler) BatchAction(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req batchActionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if len(req.ItemIDs) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_item_ids_provided"})
		return
	}

	affectedProjects := make(map[pgtype.UUID]bool)
	person := middleware.GetPerson(ctx)

	type folderKey struct {
		projectID uuid.UUID
		parentID  uuid.UUID
	}
	folderAccessCache := make(map[folderKey]authz.AccessResult)
	projectCache := make(map[uuid.UUID]db.GetProjectByIDRow)

	getProject := func(projID pgtype.UUID) (db.GetProjectByIDRow, error) {
		pUUID := uuid.UUID(projID.Bytes)
		if p, ok := projectCache[pUUID]; ok {
			return p, nil
		}
		p, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
			ID:        projID,
			CompanyID: companyID,
		})
		if err == nil {
			projectCache[pUUID] = p
		}
		return p, err
	}

	getParentFolderAccess := func(proj db.GetProjectByIDRow, parentFolderID uuid.UUID) (authz.AccessResult, error) {
		key := folderKey{
			projectID: uuid.UUID(proj.ID.Bytes),
			parentID:  parentFolderID,
		}
		if res, ok := folderAccessCache[key]; ok {
			return res, nil
		}
		pt := authz.ProjectTarget{
			ID:        uuid.UUID(proj.ID.Bytes),
			CompanyID: uuid.UUID(proj.CompanyID.Bytes),
			ClientID:  uuid.UUID(proj.ClientID.Bytes),
		}
		res, err := authz.AccessFolder(ctx, h.queries, person, pt, parentFolderID)
		if err == nil {
			folderAccessCache[key] = res
		}
		return res, err
	}

	for _, idStr := range req.ItemIDs {
		var itemID pgtype.UUID
		if err := itemID.Scan(idStr); err != nil {
			continue
		}

		item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        itemID,
			CompanyID: companyID,
		})
		if err != nil {
			continue
		}

		proj, err := getProject(item.ProjectID)
		if err != nil {
			continue
		}

		var parentUUID uuid.UUID
		if item.ParentID.Valid {
			parentUUID = uuid.UUID(item.ParentID.Bytes)
		}

		parentAccess, err := getParentFolderAccess(proj, parentUUID)
		if err != nil {
			continue
		}

		var itemAccess authz.AccessResult
		if parentAccess.Level == authz.LevelFull {
			itemAccess = parentAccess
		} else {
			pt := authz.ProjectTarget{
				ID:        uuid.UUID(proj.ID.Bytes),
				CompanyID: uuid.UUID(proj.CompanyID.Bytes),
				ClientID:  uuid.UUID(proj.ClientID.Bytes),
			}
			itTarget := authz.ItemTarget{
				ID:        uuid.UUID(item.ID.Bytes),
				ProjectID: uuid.UUID(item.ProjectID.Bytes),
				CompanyID: uuid.UUID(item.CompanyID.Bytes),
				CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
			}
			itemAccess, err = authz.AccessItem(ctx, h.queries, person, pt, itTarget)
			if err != nil {
				continue
			}
		}

		var createdByUUID uuid.UUID
		if item.CreatedBy.Valid {
			createdByUUID = uuid.UUID(item.CreatedBy.Bytes)
		}
		if !itemAccess.CanModifyItem(person, createdByUUID) {
			continue
		}

		if req.Action == "delete" {
			affectedProjects[item.ProjectID] = true
			_, _ = h.queries.SoftDeleteItem(ctx, db.SoftDeleteItemParams{
				ID:        itemID,
				CompanyID: companyID,
				DeletedBy: user.ID,
			})
			if item.ParentID.Valid {
				_ = h.queries.RecalculateFolderCounts(ctx, item.ParentID)
			}
		} else if req.Action == "move" {
			var targetParentUUID pgtype.UUID
			var targetFolderUUID uuid.UUID
			if req.TargetParentID != nil && *req.TargetParentID != "" && *req.TargetParentID != "null" {
				if pid, err := uuid.Parse(*req.TargetParentID); err == nil {
					targetParentUUID = pgtype.UUID{Bytes: pid, Valid: true}
					targetFolderUUID = pid
				} else {
					continue
				}
			}

			// Must have upload access to destination folder
			destAccess, err := getParentFolderAccess(proj, targetFolderUUID)
			if err != nil || !destAccess.CanUpload() {
				continue
			}

			// Prevent moving a folder into itself or a subfolder
			if item.Kind == "folder" {
				if targetParentUUID.Valid && item.ID == targetParentUUID {
					continue
				}
				if targetParentUUID.Valid {
					ancestors, err := h.queries.GetItemAncestors(ctx, db.GetItemAncestorsParams{
						ItemID:    targetParentUUID,
						CompanyID: companyID,
					})
					isCircular := false
					if err == nil {
						for _, a := range ancestors {
							if a.ID == item.ID {
								isCircular = true
								break
							}
						}
					}
					if isCircular {
						continue
					}
				}
			}

			affectedProjects[item.ProjectID] = true
			_, _ = h.queries.MoveItem(ctx, db.MoveItemParams{
				ID:          itemID,
				CompanyID:   companyID,
				NewParentID: targetParentUUID,
			})
			if item.ParentID.Valid {
				_ = h.queries.RecalculateFolderCounts(ctx, item.ParentID)
			}
			if targetParentUUID.Valid {
				_ = h.queries.RecalculateFolderCounts(ctx, targetParentUUID)
			}
		}
	}

	for pID := range affectedProjects {
		_ = h.queries.RecalculateProjectAndFolderCounts(ctx, pID)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// StarItem stars an item
func (h *ItemsHandler) StarItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
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
	if err != nil || item.DeletedAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if err := h.queries.StarItem(ctx, db.StarItemParams{
		CompanyID: companyID,
		UserID:    user.ID,
		ItemID:    itemID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_star_item"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"starred": true})
}

// UnstarItem unstars an item
func (h *ItemsHandler) UnstarItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
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
	if err != nil || item.DeletedAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	person := middleware.GetPerson(ctx)
	access, err := authz.AccessItem(ctx, h.queries, person, authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}, authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	if err := h.queries.UnstarItem(ctx, db.UnstarItemParams{
		CompanyID: companyID,
		UserID:    user.ID,
		ItemID:    itemID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_unstar_item"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"starred": false})
}

// ListStarred lists user's starred items across projects
func (h *ItemsHandler) ListStarred(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	items, err := h.queries.ListStarredItems(ctx, db.ListStarredItemsParams{
		CompanyID: companyID,
		UserID:    user.ID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_starred_items"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": items,
	})
}

// ListTrash lists soft-deleted items
func (h *ItemsHandler) ListTrash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	person := middleware.GetPerson(ctx)

	items, err := h.queries.ListTrashItems(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_list_trash_items"})
		return
	}

	// Admins and full access roles see all trash items in the company
	if person.IsFullAccess() || person.HasPermission(authz.PermFilesEmptyTrash) {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"items": items,
		})
		return
	}

	// Others: only items in folders/projects where they have Uploader or Full access
	type folderKey struct {
		projectID uuid.UUID
		parentID  uuid.UUID
	}
	folderAccessCache := make(map[folderKey]bool)
	projectCache := make(map[uuid.UUID]db.GetProjectByIDRow)
	var visibleItems []db.ListTrashItemsRow
	for _, it := range items {
		pUUID := uuid.UUID(it.ProjectID.Bytes)
		var parentUUID uuid.UUID
		if it.OriginalParentID.Valid {
			parentUUID = uuid.UUID(it.OriginalParentID.Bytes)
		}
		key := folderKey{projectID: pUUID, parentID: parentUUID}

		hasAccess, found := folderAccessCache[key]
		if !found {
			proj, ok := projectCache[pUUID]
			if !ok {
				var err error
				proj, err = h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
					ID:        it.ProjectID,
					CompanyID: companyID,
				})
				if err != nil {
					folderAccessCache[key] = false
					continue
				}
				projectCache[pUUID] = proj
			}
			pt := authz.ProjectTarget{
				ID:        uuid.UUID(proj.ID.Bytes),
				CompanyID: uuid.UUID(proj.CompanyID.Bytes),
				ClientID:  uuid.UUID(proj.ClientID.Bytes),
			}
			acc, err := authz.AccessFolder(ctx, h.queries, person, pt, parentUUID)
			if err == nil && (acc.Level == authz.LevelFull || acc.Level == authz.LevelUploader) {
				hasAccess = true
			} else {
				hasAccess = false
			}
			folderAccessCache[key] = hasAccess
		}
		if hasAccess {
			visibleItems = append(visibleItems, it)
		}
	}

	if visibleItems == nil {
		visibleItems = []db.ListTrashItemsRow{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items": visibleItems,
	})
}

// RestoreTrashItem restores an item from Trash
func (h *ItemsHandler) RestoreTrashItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, okU := middleware.GetAuthenticatedUser(ctx)
	if !okU {
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
	if !item.DeletedAt.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "item_not_in_trash"})
		return
	}

	person := middleware.GetPerson(ctx)

	// Check access: Full access, or the person who deleted or uploaded the item
	isUploader := item.CreatedBy.Valid && item.CreatedBy == user.ID
	isDeleter := item.DeletedBy.Valid && item.DeletedBy == user.ID

	proj, err := h.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	projTarget := authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}

	var parentFolderUUID uuid.UUID
	if item.OriginalParentID.Valid {
		parentFolderUUID = uuid.UUID(item.OriginalParentID.Bytes)
	}

	folderAccess, err := authz.AccessFolder(ctx, h.queries, person, projTarget, parentFolderUUID)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	canRestore := false
	if folderAccess.Level == authz.LevelFull {
		canRestore = true
	} else if isUploader || isDeleter {
		if folderAccess.Level == authz.LevelUploader || folderAccess.Level == authz.LevelFull {
			canRestore = true
		}
	}

	if !canRestore {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "The uploader or deleter can restore only if they still have at least Uploader access to the project or folder",
		})
		return
	}

	// Addition 4: restoring anything restores only items with the same delete_batch_id
	if item.DeleteBatchID.Valid {
		_ = h.queries.RestoreItemsCascade(ctx, db.RestoreItemsCascadeParams{
			CompanyID:     companyID,
			DeleteBatchID: item.DeleteBatchID,
		})
	} else {
		_, err = h.queries.RestoreItem(ctx, db.RestoreItemParams{
			ID:        itemID,
			CompanyID: companyID,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_restore_item"})
			return
		}
	}

	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, item.ProjectID)
	if item.ParentID.Valid {
		h.updateAncestorsFolderCounts(ctx, item.ParentID, companyID)
	}
	if item.OriginalParentID.Valid {
		h.updateAncestorsFolderCounts(ctx, item.OriginalParentID, companyID)
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "restored"})
}

// PermanentDeleteTrashItem permanently removes an item and deletes all versions from S3 (Requirement 9)
func (h *ItemsHandler) PermanentDeleteTrashItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
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

	_, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Permanent delete is strictly restricted to Admins (admin switch required)
	person := middleware.GetPerson(ctx)
	if !person.IsAdmin() && !person.HasPermission(authz.PermFilesDeleteForever) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only administrators can permanently delete items"})
		return
	}

	// Find all versions to delete from S3
	versions, err := h.queries.ListFileVersions(ctx, itemID)
	if err == nil && len(versions) > 0 {
		var keysToDelete []string
		var bytesToFree int64
		for _, v := range versions {
			if v.StorageKey != "" {
				keysToDelete = append(keysToDelete, v.StorageKey)
			}
			bytesToFree += v.SizeBytes
		}

		if h.storage != nil && len(keysToDelete) > 0 {
			_ = h.storage.DeleteObjects(ctx, keysToDelete)
		}

		// Decrement storage_used_bytes
		_ = h.queries.DecrementCompanyStorage(ctx, db.DecrementCompanyStorageParams{
			ID:    companyID,
			Bytes: bytesToFree,
		})
	}

	if err := h.queries.PermanentDeleteItem(ctx, db.PermanentDeleteItemParams{
		ID:        itemID,
		CompanyID: companyID,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_permanently_delete_item"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

// EmptyTrash permanently purges all items currently in Trash for the company (Admin only)
func (h *ItemsHandler) EmptyTrash(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	person := middleware.GetPerson(ctx)
	if !person.IsAdmin() && !person.HasPermission(authz.PermFilesEmptyTrash) {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error":   "forbidden",
			"message": "Only administrators can empty the trash",
		})
		return
	}

	// List all trash items in the company to delete their versions from storage
	items, err := h.queries.ListTrashItems(ctx, companyID)
	if err == nil && len(items) > 0 {
		for _, it := range items {
			versions, err := h.queries.ListFileVersions(ctx, it.ID)
			if err == nil && len(versions) > 0 {
				var keysToDelete []string
				var bytesToFree int64
				for _, v := range versions {
					if v.StorageKey != "" {
						keysToDelete = append(keysToDelete, v.StorageKey)
					}
					bytesToFree += v.SizeBytes
				}
				if h.storage != nil && len(keysToDelete) > 0 {
					_ = h.storage.DeleteObjects(ctx, keysToDelete)
				}
				_ = h.queries.DecrementCompanyStorage(ctx, db.DecrementCompanyStorageParams{
					ID:    companyID,
					Bytes: bytesToFree,
				})
			}
			_ = h.queries.PermanentDeleteItem(ctx, db.PermanentDeleteItemParams{
				ID:        it.ID,
				CompanyID: companyID,
			})
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"emptied": true})
}

type checkConflictReq struct {
	ProjectID string  `json:"project_id"`
	ParentID  *string `json:"parent_id"`
	Name      string  `json:"name"`
}

// CheckNameConflict checks if a file with the given name already exists in target folder (Requirement 5)
func (h *ItemsHandler) CheckNameConflict(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req checkConflictReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	var projID pgtype.UUID
	if err := projID.Scan(req.ProjectID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "null" {
		_ = parentUUID.Scan(*req.ParentID)
	}

	existing, err := h.queries.FindItemInParentByName(ctx, db.FindItemInParentByNameParams{
		CompanyID: companyID,
		ProjectID: projID,
		ParentID:  parentUUID,
		Name:      req.Name,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondJSON(w, http.StatusOK, map[string]interface{}{"conflict": false})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_check_conflict"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"conflict":      true,
		"existing_id":   existing.ID,
		"existing_kind": existing.Kind,
		"existing_name": existing.Name,
	})
}

// updateAncestorsFolderCounts updates counts for a folder and its parent hierarchy
func (h *ItemsHandler) updateAncestorsFolderCounts(ctx context.Context, folderID pgtype.UUID, companyID pgtype.UUID) {
	if !folderID.Valid {
		return
	}
	_ = h.queries.RecalculateFolderCounts(ctx, folderID)
	ancestors, err := h.queries.GetItemAncestors(ctx, db.GetItemAncestorsParams{
		ItemID:    folderID,
		CompanyID: companyID,
	})
	if err == nil {
		for _, a := range ancestors {
			if a.Kind == "folder" {
				_ = h.queries.RecalculateFolderCounts(ctx, a.ID)
			}
		}
	}
}
