package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/jobs"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/playhead/playhead/services/worker"
	"github.com/redis/go-redis/v9"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func parseUUID(s string) pgtype.UUID {
	u, err := uuid.Parse(s)
	if err != nil {
		return pgtype.UUID{Valid: false}
	}
	return pgtype.UUID{Bytes: u, Valid: true}
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	requeueFlag := flag.Bool("requeue", false, "Re-queue all file versions stuck in pending preview status and exit")
	flag.Parse()

	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable")
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379")
	r2Endpoint := getEnv("R2_ENDPOINT", "http://localhost:9000")
	r2Bucket := getEnv("R2_BUCKET", "playhead-dev")
	r2AccessKey := getEnv("R2_ACCESS_KEY_ID", "playhead")
	r2SecretKey := getEnv("R2_SECRET_ACCESS_KEY", "playheadsecret")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize DB pool
	dbPool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbPool.Close()

	queries := db.New(dbPool)

	// Initialize Storage Client
	var storageClient *storage.Client
	st, err := storage.NewClient(ctx, storage.Config{
		Endpoint:        r2Endpoint,
		Bucket:          r2Bucket,
		AccessKeyID:     r2AccessKey,
		SecretAccessKey: r2SecretKey,
		UsePathStyle:    strings.Contains(r2Endpoint, "localhost") || strings.Contains(r2Endpoint, "127.0.0.1"),
	})
	if err != nil {
		slog.Warn("storage client failed to initialize, running with mock storage", "error", err)
	} else {
		storageClient = st
		_ = storageClient.EnsureBucket(ctx)
	}

	redisOpt := jobs.ParseRedisOpt(redisURL)

	// Mode: Re-queue pending versions
	if *requeueFlag {
		slog.Info("running re-queue for pending video versions")
		client := asynq.NewClient(redisOpt)
		defer client.Close()

		pending, err := queries.ListPendingVideoVersions(ctx)
		if err != nil {
			slog.Error("failed to list pending versions", "error", err)
			os.Exit(1)
		}

		slog.Info("found pending video versions", "count", len(pending))
		enqueued := 0
		for _, v := range pending {
			task, err := jobs.NewProcessVideoTask(jobs.ProcessVideoPayload{
				CompanyID:  fmt.Sprintf("%x-%x-%x-%x-%x", v.CompanyID.Bytes[0:4], v.CompanyID.Bytes[4:6], v.CompanyID.Bytes[6:8], v.CompanyID.Bytes[8:10], v.CompanyID.Bytes[10:16]),
				ItemID:     fmt.Sprintf("%x-%x-%x-%x-%x", v.ItemID.Bytes[0:4], v.ItemID.Bytes[4:6], v.ItemID.Bytes[6:8], v.ItemID.Bytes[8:10], v.ItemID.Bytes[10:16]),
				VersionID:  fmt.Sprintf("%x-%x-%x-%x-%x", v.ID.Bytes[0:4], v.ID.Bytes[4:6], v.ID.Bytes[6:8], v.ID.Bytes[8:10], v.ID.Bytes[10:16]),
				StorageKey: v.StorageKey,
				Mime:       v.Mime,
			})
			if err != nil {
				slog.Error("failed to create task for version", "version_id", v.ID, "error", err)
				continue
			}
			if _, err := client.Enqueue(task); err != nil {
				slog.Error("failed to enqueue task", "version_id", v.ID, "error", err)
			} else {
				enqueued++
			}
		}
		slog.Info("re-queue complete", "enqueued", enqueued)
		return
	}

	// Normal Worker Server Mode
	slog.Info("starting playhead media processing worker with asynq", "concurrency", 2)

	processor := worker.NewProcessor(queries, storageClient)

	rdb := redis.NewClient(&redis.Options{
		Addr:     redisOpt.Addr,
		Password: redisOpt.Password,
		DB:       redisOpt.DB,
	})
	defer rdb.Close()

	mailClient := mailer.New(mailer.Config{
		SMTPHost:     getEnv("SMTP_HOST", "localhost"),
		SMTPPort:     1025,
		ResendAPIKey: getEnv("RESEND_API_KEY", ""),
		FrontendURL:  getEnv("APP_URL", "http://localhost:3000"),
		FromEmail:    getEnv("FROM_EMAIL", "no-reply@playhead.app"),
		FromName:     "Playhead",
	})
	notifier := worker.NewNotifier(queries, mailClient, rdb)

	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: 2,
			Queues: map[string]int{
				"default": 1,
			},
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				return time.Duration(n*5) * time.Second
			},
		},
	)

	mux := asynq.NewServeMux()

	// Handler for video and audio processing
	mux.HandleFunc(jobs.TypeProcessVideoVersion, func(c context.Context, t *asynq.Task) error {
		var payload jobs.ProcessVideoPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			slog.Error("failed to unmarshal process video payload", "error", err)
			return fmt.Errorf("invalid payload: %w", err)
		}

		slog.Info("worker picked up video processing task",
			"version_id", payload.VersionID,
			"company_id", payload.CompanyID,
			"storage_key", payload.StorageKey,
		)

		job := worker.ProcessJob{
			CompanyID:  parseUUID(payload.CompanyID),
			ItemID:     parseUUID(payload.ItemID),
			VersionID:  parseUUID(payload.VersionID),
			StorageKey: payload.StorageKey,
			Mime:       payload.Mime,
		}

		if err := processor.Process(c, job); err != nil {
			slog.Error("processor error for version", "version_id", payload.VersionID, "error", err)
			return err
		}

		slog.Info("worker successfully completed video processing task", "version_id", payload.VersionID)
		return nil
	})

	// Handler for grouped comment notifications
	mux.HandleFunc(jobs.TypeGroupedCommentNotification, func(c context.Context, t *asynq.Task) error {
		var payload jobs.GroupedCommentNotificationPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			slog.Error("failed to unmarshal comment notification payload", "error", err)
			return err
		}
		slog.Info("processing grouped comment notification", "item_id", payload.ItemID, "company_id", payload.CompanyID)
		if err := notifier.ProcessGroupedCommentsNotification(c, payload); err != nil {
			slog.Error("failed to process grouped comment notification", "error", err, "item_id", payload.ItemID)
			return err
		}
		return nil
	})

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-stop
		slog.Info("worker shutting down gracefully", "signal", sig.String())
		srv.Shutdown()
		cancel()
	}()

	if err := srv.Run(mux); err != nil {
		slog.Error("asynq server error", "error", err)
		os.Exit(1)
	}
}
