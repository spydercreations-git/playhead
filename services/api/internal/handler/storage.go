package handler

import (
	"math"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/db"
)

type StorageHandler struct {
	queries *db.Queries
}

func NewStorageHandler(queries *db.Queries) *StorageHandler {
	return &StorageHandler{
		queries: queries,
	}
}

// GetStorage handles GET /api/v1/storage
func (h *StorageHandler) GetStorage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	person := middleware.GetPerson(ctx)
	if person.UserID == uuid.Nil {
		renderJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !person.IsStaff() {
		renderJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "Only staff can view storage"})
		return
	}

	companyUUID := pgtype.UUID{Bytes: person.CompanyID, Valid: true}

	overview, err := h.queries.GetStorageOverview(ctx, companyUUID)
	if err != nil {
		renderJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to get storage overview"})
		return
	}

	clientsUsage, err := h.queries.GetStorageByClient(ctx, companyUUID)
	if err != nil {
		clientsUsage = []db.GetStorageByClientRow{}
	}

	totalBytes := overview.TotalBytes
	calcPct := func(bytes int64) float64 {
		if totalBytes <= 0 {
			return 0
		}
		pct := (float64(bytes) / float64(totalBytes)) * 100
		return math.Round(pct*10) / 10
	}

	type ClientRow struct {
		ClientID        string  `json:"client_id"`
		ClientName      string  `json:"client_name"`
		ProjectCount    int32   `json:"project_count"`
		UsedBytes       int64   `json:"used_bytes"`
		SharePercentage float64 `json:"share_percentage"`
	}

	clientList := make([]ClientRow, 0, len(clientsUsage))
	for _, cu := range clientsUsage {
		clientList = append(clientList, ClientRow{
			ClientID:        uuid.UUID(cu.ClientID.Bytes).String(),
			ClientName:      cu.ClientName,
			ProjectCount:    cu.ProjectCount,
			UsedBytes:       cu.UsedBytes,
			SharePercentage: calcPct(cu.UsedBytes),
		})
	}

	resp := map[string]interface{}{
		"total_bytes":    totalBytes,
		"files_count":    overview.FilesCount,
		"projects_count": overview.ProjectsCount,
		"clients_count":  overview.ClientsCount,
		"breakdown": map[string]interface{}{
			"videos_bytes":      overview.VideosBytes,
			"videos_pct":        calcPct(overview.VideosBytes),
			"images_bytes":      overview.ImagesBytes,
			"images_pct":        calcPct(overview.ImagesBytes),
			"documents_bytes":   overview.DocumentsBytes,
			"documents_pct":     calcPct(overview.DocumentsBytes),
			"other_bytes":       overview.OtherBytes,
			"other_pct":         calcPct(overview.OtherBytes),
		},
		"clients": clientList,
	}

	renderJSON(w, http.StatusOK, resp)
}
