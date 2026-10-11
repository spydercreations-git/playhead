package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/playhead/playhead/services/api/internal/response"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	db      *db.Pool
	redis   *redis.Client
	storage *storage.Client
}

func NewHealthHandler(dbPool *db.Pool, rdb *redis.Client, storageClient *storage.Client) *HealthHandler {
	return &HealthHandler{
		db:      dbPool,
		redis:   rdb,
		storage: storageClient,
	}
}

type HealthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	Redis    string `json:"redis"`
	Storage  string `json:"storage"`
}

func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	resp := HealthResponse{
		Status:   "ok",
		Database: "connected",
		Redis:    "connected",
		Storage:  "connected",
	}

	if h.db != nil {
		if err := h.db.Ping(ctx); err != nil {
			resp.Database = "error: " + err.Error()
			resp.Status = "degraded"
		}
	} else {
		resp.Database = "not_configured"
	}

	if h.redis != nil {
		if err := h.redis.Ping(ctx).Err(); err != nil {
			resp.Redis = "error: " + err.Error()
			resp.Status = "degraded"
		}
	} else {
		resp.Redis = "not_configured"
	}

	if h.storage != nil {
		if err := h.storage.Ping(ctx); err != nil {
			resp.Storage = "error: " + err.Error()
			resp.Status = "degraded"
		}
	} else {
		resp.Storage = "not_configured"
	}

	statusCode := http.StatusOK
	if resp.Status == "degraded" {
		statusCode = http.StatusServiceUnavailable
	}

	response.JSON(w, statusCode, resp)
}
