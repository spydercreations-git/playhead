package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/playhead/playhead/services/shared/transcode"
)

type ProcessJob struct {
	CompanyID  pgtype.UUID
	ItemID     pgtype.UUID
	VersionID  pgtype.UUID
	StorageKey string
	Mime       string
}

type Processor struct {
	queries    *db.Queries
	storage    *storage.Client
	transcoder *transcode.Transcoder
	sem        chan struct{} // limits to at most 2 video jobs concurrently
	activeJobs sync.WaitGroup
}

func NewProcessor(queries *db.Queries, storageClient *storage.Client) *Processor {
	return &Processor{
		queries:    queries,
		storage:    storageClient,
		transcoder: transcode.New(),
		sem:        make(chan struct{}, 2), // Run at most 2 video jobs at once
	}
}

func pgUUIDToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuid.UUID(u.Bytes).String()
}

// Process handles a single video transcoding and asset generation job
func (p *Processor) Process(ctx context.Context, job ProcessJob) error {
	// Enforce at most 2 concurrent video processing jobs
	select {
	case p.sem <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-p.sem }()

	slog.Info("worker processing video version", "version_id", pgUUIDToString(job.VersionID), "storage_key", job.StorageKey)

	// Set status to processing
	if p.queries != nil {
		_, _ = p.queries.UpdateVersionPreviewStatus(ctx, db.UpdateVersionPreviewStatusParams{
			ID:            job.VersionID,
			CompanyID:     job.CompanyID,
			PreviewStatus: "processing",
		})
	}

	// Create temp working directory on disk
	tempDir, err := os.MkdirTemp("", "playhead-proc-*")
	if err != nil {
		p.markFailed(ctx, job, fmt.Errorf("failed to create temp dir: %w", err))
		return err
	}
	// Always delete temp files after
	defer os.RemoveAll(tempDir)

	inputPath := filepath.Join(tempDir, "input_media")
	outDir := filepath.Join(tempDir, "output")

	// Stream original source from storage to temp disk
	if p.storage != nil && job.StorageKey != "" {
		rc, _, err := p.storage.GetObject(ctx, job.StorageKey)
		if err != nil {
			p.markFailed(ctx, job, fmt.Errorf("failed to stream source from storage: %w", err))
			return err
		}
		outFile, err := os.Create(inputPath)
		if err != nil {
			_ = rc.Close()
			p.markFailed(ctx, job, fmt.Errorf("failed to create temp input file: %w", err))
			return err
		}
		_, copyErr := io.Copy(outFile, rc)
		_ = outFile.Close()
		_ = rc.Close()
		if copyErr != nil {
			p.markFailed(ctx, job, fmt.Errorf("failed to write temp input file: %w", copyErr))
			return copyErr
		}
	} else {
		// If mock or local dummy input, create a small dummy file
		_ = os.WriteFile(inputPath, []byte("mock-data"), 0644)
	}

	// Run transcode pipeline
	res, err := p.transcoder.Transcode(ctx, inputPath, outDir)
	if err != nil {
		p.markFailed(ctx, job, fmt.Errorf("transcoding failed: %w", err))
		return err
	}

	// Upload preview outputs to R2 storage
	prefix := fmt.Sprintf("previews/%s/%s", pgUUIDToString(job.CompanyID), pgUUIDToString(job.VersionID))
	previewKeys := make(map[string]string)

	if p.storage != nil {
		_ = filepath.Walk(outDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			rel, _ := filepath.Rel(outDir, path)
			rel = filepath.ToSlash(rel)
			targetKey := prefix + "/" + rel

			f, openErr := os.Open(path)
			if openErr != nil {
				return nil
			}
			defer f.Close()

			contentType := "application/octet-stream"
			switch {
			case strings.HasSuffix(rel, ".m3u8"):
				contentType = "application/vnd.apple.mpegurl"
			case strings.HasSuffix(rel, ".ts"):
				contentType = "video/mp2t"
			case strings.HasSuffix(rel, ".jpg") || strings.HasSuffix(rel, ".jpeg"):
				contentType = "image/jpeg"
			case strings.HasSuffix(rel, ".json"):
				contentType = "application/json"
			}

			_ = p.storage.PutObject(ctx, targetKey, f, info.Size(), contentType)

			switch rel {
			case "master.m3u8":
				previewKeys["hls_master"] = targetKey
			case "720p.m3u8":
				previewKeys["hls_720p"] = targetKey
			case "1080p.m3u8":
				previewKeys["hls_1080p"] = targetKey
			case "poster.jpg":
				previewKeys["poster"] = targetKey
			case "sprite.jpg":
				previewKeys["sprite"] = targetKey
			case "sprite.json":
				previewKeys["sprite_json"] = targetKey
			case "waveform.json":
				previewKeys["waveform"] = targetKey
			}
			return nil
		})
	} else {
		previewKeys["hls_master"] = prefix + "/master.m3u8"
		previewKeys["hls_720p"] = prefix + "/720p.m3u8"
		previewKeys["poster"] = prefix + "/poster.jpg"
		previewKeys["sprite"] = prefix + "/sprite.jpg"
		previewKeys["sprite_json"] = prefix + "/sprite.json"
		previewKeys["waveform"] = prefix + "/waveform.json"
	}

	keysJSON, _ := json.Marshal(previewKeys)

	fpsBig := big.NewInt(int64(res.MediaInfo.FPS * 100))
	fpsNumeric := pgtype.Numeric{Int: fpsBig, Exp: -2, Valid: true}

	if p.queries != nil {
		_, err = p.queries.UpdateVersionMetadataAndPreview(ctx, db.UpdateVersionMetadataAndPreviewParams{
			ID:            job.VersionID,
			CompanyID:     job.CompanyID,
			DurationMs:    pgtype.Int4{Int32: int32(res.MediaInfo.DurationMs), Valid: true},
			Width:         pgtype.Int4{Int32: int32(res.MediaInfo.Width), Valid: true},
			Height:        pgtype.Int4{Int32: int32(res.MediaInfo.Height), Valid: true},
			Fps:           fpsNumeric,
			PreviewStatus: "ready",
			PreviewKeys:   keysJSON,
		})
		if err != nil {
			slog.Error("failed to update version preview metadata in database", "error", err)
			return err
		}
	}

	slog.Info("successfully processed video version", "version_id", pgUUIDToString(job.VersionID), "renditions", res.Renditions)
	return nil
}

func (p *Processor) markFailed(ctx context.Context, job ProcessJob, reason error) {
	slog.Error("marking video preview as failed", "version_id", pgUUIDToString(job.VersionID), "error", reason)
	if p.queries != nil {
		_, _ = p.queries.UpdateVersionPreviewStatus(ctx, db.UpdateVersionPreviewStatusParams{
			ID:            job.VersionID,
			CompanyID:     job.CompanyID,
			PreviewStatus: "failed",
		})
	}
}
