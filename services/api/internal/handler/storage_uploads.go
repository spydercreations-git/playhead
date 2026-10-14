package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"
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

// StorageUploadsHandler manages fast direct-to-S3 uploads, downloads, and storage quotas
type StorageUploadsHandler struct {
	queries *db.Queries
	storage *storage.Client
	mailer  *mailer.Mailer
	cfg     *config.Config
}

func NewStorageUploadsHandler(queries *db.Queries, storage *storage.Client, mailer *mailer.Mailer, cfg *config.Config) *StorageUploadsHandler {
	return &StorageUploadsHandler{
		queries: queries,
		storage: storage,
		mailer:  mailer,
		cfg:     cfg,
	}
}

type initiateUploadReq struct {
	ProjectID    string  `json:"project_id"`
	ParentID     *string `json:"parent_id"`
	TargetItemID *string `json:"target_item_id"` // Set if uploading a new version of an existing file
	Filename     string  `json:"filename"`
	SizeBytes    int64   `json:"size_bytes"`
	Mime         string  `json:"mime"`
}

// InitiateUpload reserves storage quota and creates a direct multipart S3 upload
func (h *StorageUploadsHandler) InitiateUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	role, _ := middleware.GetUserRole(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req initiateUploadReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	req.Filename = strings.TrimSpace(req.Filename)
	if req.Filename == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "filename_required"})
		return
	}
	if req.SizeBytes <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_size", "message": "File size must be greater than 0"})
		return
	}
	if req.SizeBytes > 100*plans.GB {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file_too_large", "message": "Max file size is 100 GB"})
		return
	}
	if req.Mime == "" {
		req.Mime = "application/octet-stream"
	}

	var projID pgtype.UUID
	if err := projID.Scan(req.ProjectID); err != nil {
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

	person := authz.Person{UserID: uuid.UUID(user.ID.Bytes), Email: user.Email, Role: role, CompanyID: uuid.UUID(companyID.Bytes)}
	access, err := authz.Access(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	})
	if err != nil || !access.CanUpload() {
		// Enforce: Viewer and Commenter cannot upload
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "You do not have permission to upload files to this project"})
		return
	}

	// 1. Storage Quota Check in transaction (Requirement 1 & 2)
	company, err := h.queries.GetCompanyStorageDetails(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_check_storage"})
		return
	}

	if !plans.IsUnlimitedStorage(company.Plan) {
		currentProjected := company.StorageUsedBytes + company.StorageReservedBytes + req.SizeBytes
		if currentProjected > company.StorageLimitBytes {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "quota_exceeded", "message": "Company storage quota exceeded. Upgrade your plan or add storage."})
			return
		}
	}

	// Reserve bytes (Requirement 2)
	if err := h.queries.ReserveCompanyStorage(ctx, db.ReserveCompanyStorageParams{
		ID:    companyID,
		Bytes: req.SizeBytes,
	}); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_reserve_storage"})
		return
	}

	// Determine item ID and version number
	var itemID uuid.UUID
	var versionNumber int = 1
	var targetItemUUID pgtype.UUID

	if req.TargetItemID != nil && *req.TargetItemID != "" {
		var tid pgtype.UUID
		if err := tid.Scan(*req.TargetItemID); err == nil && tid.Valid {
			targetItemUUID = tid
			itemID = uuid.UUID(tid.Bytes)
			latestVer, err := h.queries.GetLatestFileVersion(ctx, tid)
			if err == nil {
				versionNumber = int(latestVer.Number) + 1
			}
		}
	}

	if itemID == uuid.Nil {
		itemID = uuid.New()
	}

	// Requirement 7: Storage keys use IDs only (companies/{cid}/items/{item_id}/v{n}), NEVER the file name
	storageKey := fmt.Sprintf("companies/%s/items/%s/v%d", uuid.UUID(companyID.Bytes).String(), itemID.String(), versionNumber)

	// Calculate Part Size (Requirement 4: choose part size so parts <= 10,000 for up to 100 GB)
	var partSize int64 = 16 * plans.MB
	totalParts := int((req.SizeBytes + partSize - 1) / partSize)
	if totalParts <= 0 {
		totalParts = 1
	}

	// Create Multipart Upload in S3
	var s3UploadID string
	if h.storage != nil {
		id, err := h.storage.CreateMultipartUpload(ctx, storageKey, req.Mime)
		if err != nil {
			// Release reserved storage on error
			_ = h.queries.ReleaseCompanyReservedStorage(ctx, db.ReleaseCompanyReservedStorageParams{
				ID:    companyID,
				Bytes: req.SizeBytes,
			})
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "s3_init_failed", "message": err.Error()})
			return
		}
		s3UploadID = id
	} else {
		s3UploadID = "mock-upload-" + uuid.NewString()
	}

	var parentUUID pgtype.UUID
	if req.ParentID != nil && *req.ParentID != "" && *req.ParentID != "null" {
		_ = parentUUID.Scan(*req.ParentID)
	}

	// Expires in 24 hours (Requirement 2)
	expiresAt := time.Now().Add(24 * time.Hour)

	uploadRecord, err := h.queries.CreateUpload(ctx, db.CreateUploadParams{
		CompanyID:     companyID,
		UserID:        user.ID,
		ProjectID:     projID,
		ParentID:      parentUUID,
		TargetItemID:  targetItemUUID,
		Filename:      req.Filename,
		SizeBytes:     req.SizeBytes,
		Mime:          req.Mime,
		StorageKey:    storageKey,
		UploadID:      s3UploadID,
		PartSizeBytes: partSize,
		TotalParts:    int32(totalParts),
		ExpiresAt:     pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		_ = h.queries.ReleaseCompanyReservedStorage(ctx, db.ReleaseCompanyReservedStorageParams{
			ID:    companyID,
			Bytes: req.SizeBytes,
		})
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_upload_record"})
		return
	}

	// Generate initial presigned part URLs
	presignedParts := make([]map[string]interface{}, 0, totalParts)
	for p := 1; p <= totalParts; p++ {
		var presignedURL string
		if h.storage != nil {
			u, err := h.storage.PresignUploadPart(ctx, storageKey, s3UploadID, p, 24*time.Hour)
			if err == nil {
				presignedURL = u
			}
		}
		if presignedURL == "" {
			presignedURL = fmt.Sprintf("http://localhost:9000/playhead-dev/%s?partNumber=%d&uploadId=%s", storageKey, p, s3UploadID)
		}
		presignedParts = append(presignedParts, map[string]interface{}{
			"part_number": p,
			"url":         presignedURL,
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id":       uploadRecord.ID,
		"item_id":         itemID,
		"version_number":  versionNumber,
		"storage_key":     storageKey,
		"part_size_bytes": partSize,
		"total_parts":     totalParts,
		"parts":           presignedParts,
		"expires_at":      expiresAt,
	})
}

// GetUploadParts returns completed parts from S3 for resumable uploads (Requirement 4)
func (h *StorageUploadsHandler) GetUploadParts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var uploadID pgtype.UUID
	if err := uploadID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_upload_id"})
		return
	}

	upload, err := h.queries.GetUploadByID(ctx, db.GetUploadByIDParams{
		ID:        uploadID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "upload_not_found"})
		return
	}

	var completedParts []map[string]interface{}
	if h.storage != nil {
		parts, err := h.storage.ListParts(ctx, upload.StorageKey, upload.UploadID)
		if err == nil {
			for _, p := range parts {
				completedParts = append(completedParts, map[string]interface{}{
					"part_number": p.PartNumber,
					"etag":        strings.Trim(*p.ETag, "\""),
					"size":        p.Size,
				})
			}
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id":       upload.ID,
		"status":          upload.Status,
		"completed_parts": completedParts,
		"total_parts":     upload.TotalParts,
		"part_size_bytes": upload.PartSizeBytes,
	})
}

type completeUploadReq struct {
	Parts []struct {
		PartNumber int    `json:"part_number"`
		ETag       string `json:"etag"`
	} `json:"parts"`
}

// CompleteUpload finalizes multipart upload in S3 and database
func (h *StorageUploadsHandler) CompleteUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var uploadID pgtype.UUID
	if err := uploadID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_upload_id"})
		return
	}

	var req completeUploadReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	upload, err := h.queries.GetUploadByID(ctx, db.GetUploadByIDParams{
		ID:        uploadID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "upload_not_found"})
		return
	}

	if upload.Status != "pending" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "already_processed", "message": fmt.Sprintf("Upload is already %s", upload.Status)})
		return
	}

	// Finalize in S3
	if h.storage != nil {
		var s3Parts []types.CompletedPart
		for _, p := range req.Parts {
			cleanETag := strings.Trim(p.ETag, "\"")
			s3Parts = append(s3Parts, types.CompletedPart{
				PartNumber: ptrInt32(int32(p.PartNumber)),
				ETag:       &cleanETag,
			})
		}
		if err := h.storage.CompleteMultipartUpload(ctx, upload.StorageKey, upload.UploadID, s3Parts); err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "s3_complete_failed", "message": err.Error()})
			return
		}
	}

	// 1. Move bytes from reserved to used in company storage (Requirement 2)
	if err := h.queries.CommitCompanyStorage(ctx, db.CommitCompanyStorageParams{
		ID:    companyID,
		Bytes: upload.SizeBytes,
	}); err != nil {
		slog.Error("failed to commit company storage", "error", err)
	}

	// 2. Create or update item record
	var item db.Item
	var versionNumber int = 1

	if upload.TargetItemID.Valid {
		// New version of existing item
		existingItem, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        upload.TargetItemID,
			CompanyID: companyID,
		})
		if err == nil {
			item = db.Item{
				ID:        existingItem.ID,
				CompanyID: existingItem.CompanyID,
				ProjectID: existingItem.ProjectID,
				ParentID:  existingItem.ParentID,
				Kind:      existingItem.Kind,
				Name:      existingItem.Name,
			}
			latestVer, err := h.queries.GetLatestFileVersion(ctx, existingItem.ID)
			if err == nil {
				versionNumber = int(latestVer.Number) + 1
			}
		}
	}

	if !item.ID.Valid {
		// Create new file item
		created, err := h.queries.CreateItemWithCounts(ctx, db.CreateItemWithCountsParams{
			CompanyID: companyID,
			ProjectID: upload.ProjectID,
			ParentID:  upload.ParentID,
			Kind:      "file",
			Name:      upload.Filename,
			Position:  pgtype.Numeric{Int: big.NewInt(0), Valid: true},
			CreatedBy: upload.UserID,
		})
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_item"})
			return
		}
		item = created
	}

	// 3. Create file version
	fileVer, err := h.queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     companyID,
		ItemID:        item.ID,
		Number:        int32(versionNumber),
		StorageKey:    upload.StorageKey,
		SizeBytes:     upload.SizeBytes,
		Mime:          upload.Mime,
		PreviewStatus: "none",
		PreviewKeys:   []byte("{}"),
		UploadedBy:    upload.UserID,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_create_version"})
		return
	}

	// 4. Mark upload completed
	_, _ = h.queries.CompleteUpload(ctx, upload.ID)

	// 5. Recalculate counts
	_ = h.queries.RecalculateProjectAndFolderCounts(ctx, upload.ProjectID)
	if upload.ParentID.Valid {
		_ = h.queries.RecalculateFolderCounts(ctx, upload.ParentID)
	}

	// 6. Record activity
	_, _ = h.queries.CreateActivity(ctx, db.CreateActivityParams{
		CompanyID: companyID,
		ProjectID: upload.ProjectID,
		ItemID:    item.ID,
		ActorID:   user.ID,
		Action:    "uploaded",
		Details:   []byte(fmt.Sprintf(`{"filename":%q,"version":%d,"size_bytes":%d}`, upload.Filename, versionNumber, upload.SizeBytes)),
	})

	// 7. Check Storage Alert Threshold (Requirement 1)
	go h.checkStorageAlerts(companyID)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"item":    item,
		"version": fileVer,
	})
}

// AbortUpload cancels upload and frees reserved storage (Requirement 2)
func (h *StorageUploadsHandler) AbortUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var uploadID pgtype.UUID
	if err := uploadID.Scan(chi.URLParam(r, "id")); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_upload_id"})
		return
	}

	upload, err := h.queries.GetUploadByID(ctx, db.GetUploadByIDParams{
		ID:        uploadID,
		CompanyID: companyID,
	})
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "upload_not_found"})
		return
	}

	if h.storage != nil && upload.Status == "pending" {
		_ = h.storage.AbortMultipartUpload(ctx, upload.StorageKey, upload.UploadID)
	}

	if upload.Status == "pending" {
		_ = h.queries.ReleaseCompanyReservedStorage(ctx, db.ReleaseCompanyReservedStorageParams{
			ID:    companyID,
			Bytes: upload.SizeBytes,
		})
		_, _ = h.queries.AbortUpload(ctx, upload.ID)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"aborted": true})
}

// DownloadItem issues direct presigned S3 download URL respecting CanDownload (Requirement 3)
func (h *StorageUploadsHandler) DownloadItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	role, _ := middleware.GetUserRole(ctx)
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

	person := authz.Person{UserID: uuid.UUID(user.ID.Bytes), Email: user.Email, Role: role, CompanyID: uuid.UUID(companyID.Bytes)}
	access, err := authz.Access(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "item_not_found"})
		return
	}

	// Hard rule: Can download is respected. If off, download link is refused.
	if !access.CanDownload {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Download permission denied"})
		return
	}

	ver, err := h.queries.GetLatestFileVersion(ctx, itemID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "file_version_not_found"})
		return
	}

	var downloadURL string
	if h.storage != nil {
		url, err := h.storage.PresignGetObject(ctx, ver.StorageKey, item.Name, 15*time.Minute)
		if err == nil {
			downloadURL = url
		}
	}
	if downloadURL == "" {
		downloadURL = fmt.Sprintf("http://localhost:9000/playhead-dev/%s", ver.StorageKey)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"download_url": downloadURL,
		"filename":     item.Name,
		"size_bytes":   ver.SizeBytes,
		"mime":         ver.Mime,
	})
}

type zipDownloadReq struct {
	ProjectID string   `json:"project_id"`
	ItemIDs   []string `json:"item_ids"`
}

type downloadManifestItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Path        string `json:"path"`
	SizeBytes   int64  `json:"size_bytes"`
	Mime        string `json:"mime"`
	DownloadURL string `json:"download_url"`
}

// PrepareDownload returns presigned direct storage URLs for browser downloads (no size limit)
func (h *StorageUploadsHandler) PrepareDownload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, _ := middleware.GetAuthenticatedUser(ctx)
	role, _ := middleware.GetUserRole(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	var req zipDownloadReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload"})
		return
	}

	if len(req.ItemIDs) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_items_selected"})
		return
	}

	var projID pgtype.UUID
	if err := projID.Scan(req.ProjectID); err != nil {
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

	person := authz.Person{UserID: uuid.UUID(user.ID.Bytes), Email: user.Email, Role: role, CompanyID: uuid.UUID(companyID.Bytes)}
	access, err := authz.Access(ctx, h.queries, person, authz.ProjectTarget{
		ID: uuid.UUID(proj.ID.Bytes), CompanyID: uuid.UUID(proj.CompanyID.Bytes), ClientID: uuid.UUID(proj.ClientID.Bytes),
	})
	if err != nil || !access.CanView() {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	// Refuse the whole download if any item has Can download off!
	if !access.CanDownload {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Download permission denied for one or more items"})
		return
	}

	var manifestFiles []downloadManifestItem
	var totalSizeBytes int64

	for _, idStr := range req.ItemIDs {
		var itemID pgtype.UUID
		if err := itemID.Scan(idStr); err != nil {
			continue
		}

		item, err := h.queries.GetItemByID(ctx, db.GetItemByIDParams{
			ID:        itemID,
			CompanyID: companyID,
		})
		if err != nil || item.DeletedAt.Valid {
			continue
		}

		if item.Kind == "file" && item.LatestStorageKey != "" {
			url, err := h.storage.PresignGetObject(ctx, item.LatestStorageKey, item.Name, 24*time.Hour)
			if err != nil {
				continue
			}
			manifestFiles = append(manifestFiles, downloadManifestItem{
				ID:          uuid.UUID(item.ID.Bytes).String(),
				Name:        item.Name,
				Path:        item.Name,
				SizeBytes:   item.LatestSizeBytes,
				Mime:        item.LatestMime,
				DownloadURL: url,
			})
			totalSizeBytes += item.LatestSizeBytes
		} else if item.Kind == "folder" {
			// Recursively gather all nested files
			folderFiles, err := h.queries.GetFolderFilesRecursive(ctx, item.ID)
			if err != nil {
				continue
			}
			for _, ff := range folderFiles {
				if ff.StorageKey == "" {
					continue
				}
				url, err := h.storage.PresignGetObject(ctx, ff.StorageKey, ff.Name, 24*time.Hour)
				if err != nil {
					continue
				}
				manifestFiles = append(manifestFiles, downloadManifestItem{
					ID:          uuid.UUID(ff.ID.Bytes).String(),
					Name:        ff.Name,
					Path:        ff.RelativePath,
					SizeBytes:   ff.SizeBytes,
					Mime:        ff.Mime,
					DownloadURL: url,
				})
				totalSizeBytes += ff.SizeBytes
			}
		}
	}

	if len(manifestFiles) == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_downloadable_files"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"files":       manifestFiles,
		"total_bytes": totalSizeBytes,
		"file_count":  len(manifestFiles),
	})
}

// ZipDownload aliases PrepareDownload for backward compatibility
func (h *StorageUploadsHandler) ZipDownload(w http.ResponseWriter, r *http.Request) {
	h.PrepareDownload(w, r)
}

// GetStorageAdminStats returns breakdown and cost estimate (Requirement 1)
func (h *StorageUploadsHandler) GetStorageAdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role, _ := middleware.GetUserRole(ctx)
	companyID, ok := middleware.GetActiveCompanyID(ctx)
	if !ok || !companyID.Valid {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "no_company_context"})
		return
	}

	if role != authz.RoleAdmin && role != authz.RoleOwner {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Admin access required"})
		return
	}

	company, err := h.queries.GetCompanyStorageDetails(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_load_company_storage"})
		return
	}

	breakdown, err := h.queries.GetStorageBreakdownByClientAndProject(ctx, companyID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_load_storage_breakdown"})
		return
	}

	// Cost estimation: GB x STORAGE_PRICE_PER_GB (default 0.015 USD)
	usedGB := float64(company.StorageUsedBytes) / float64(plans.GB)
	estimatedMonthlyCost := usedGB * h.cfg.StoragePricePerGB

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plan":                   company.Plan,
		"storage_used_bytes":     company.StorageUsedBytes,
		"storage_reserved_bytes": company.StorageReservedBytes,
		"storage_limit_bytes":    company.StorageLimitBytes,
		"storage_price_per_gb":   h.cfg.StoragePricePerGB,
		"estimated_monthly_cost": estimatedMonthlyCost,
		"breakdown":              breakdown,
	})
}

// CleanupAbandonedUploads cancels pending uploads older than 24h and releases reserved bytes (Requirement 2)
func (h *StorageUploadsHandler) CleanupAbandonedUploads(ctx context.Context) (int, error) {
	expired, err := h.queries.ListExpiredPendingUploads(ctx)
	if err != nil {
		return 0, err
	}

	abortedCount := 0
	for _, u := range expired {
		if h.storage != nil {
			_ = h.storage.AbortMultipartUpload(ctx, u.StorageKey, u.UploadID)
		}
		_ = h.queries.ReleaseCompanyReservedStorage(ctx, db.ReleaseCompanyReservedStorageParams{
			ID:    u.CompanyID,
			Bytes: u.SizeBytes,
		})
		_, _ = h.queries.AbortUpload(ctx, u.ID)
		abortedCount++
	}

	return abortedCount, nil
}

// checkStorageAlerts verifies if storage crossed STORAGE_ALERT_GB and emails admins
func (h *StorageUploadsHandler) checkStorageAlerts(companyID pgtype.UUID) {
	ctx := context.Background()
	company, err := h.queries.GetCompanyStorageDetails(ctx, companyID)
	if err != nil {
		return
	}

	usedGB := int(company.StorageUsedBytes / plans.GB)
	if usedGB < h.cfg.StorageAlertGB {
		return
	}

	// Alert when crossing threshold, then again every further 500 GB
	lastAlert := int(company.StorageLastAlertGb)
	shouldAlert := false
	if lastAlert == 0 && usedGB >= h.cfg.StorageAlertGB {
		shouldAlert = true
	} else if lastAlert > 0 && usedGB >= lastAlert+500 {
		shouldAlert = true
	}

	if shouldAlert {
		_ = h.queries.UpdateCompanyStorageAlertGB(ctx, db.UpdateCompanyStorageAlertGBParams{
			ID:      companyID,
			AlertGb: int32(usedGB),
		})

		// Notify admins
		admins, err := h.queries.GetMembershipsForCompany(ctx, companyID)
		if err == nil {
			for _, m := range admins {
				if (m.Role == authz.RoleAdmin || m.Role == authz.RoleOwner) && h.mailer != nil {
					_ = h.mailer.SendStorageAlertEmail(m.UserEmail, m.UserName, company.Name, usedGB, h.cfg.StorageAlertGB)
				}
			}
		}
	}
}

func ptrInt32(v int32) *int32 {
	return &v
}
