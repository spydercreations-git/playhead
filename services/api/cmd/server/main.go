package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/handler"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/storage"
	"github.com/redis/go-redis/v9"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	slog.Info("starting playhead api server", "port", cfg.Port)

	// Attempt database connection
	dbPool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Warn("database connection failed (will retry on requests)", "error", err)
	} else {
		slog.Info("connected to postgres database")
		defer dbPool.Close()
	}

	// Attempt Redis connection
	var rdb *redis.Client
	if cfg.RedisURL != "" {
		opt, err := redis.ParseURL(cfg.RedisURL)
		if err == nil {
			rdb = redis.NewClient(opt)
			defer rdb.Close()
		}
	}

	// Attempt Storage connection
	storageClient, err := storage.NewClient(ctx, storage.Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		Bucket:          cfg.R2Bucket,
		UsePathStyle:    true,
	})
	if err != nil {
		slog.Warn("storage client initialization warning", "error", err)
	} else {
		_ = storageClient.EnsureBucket(ctx)
	}

	// Initialize router
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(middleware.CORS(cfg.AppURL))

	// Health check
	healthHandler := handler.NewHealthHandler(dbPool, rdb, storageClient)
	r.Get("/healthz", healthHandler.Check)
	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/health", healthHandler.Check)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("listening on address", "addr", srv.Addr)
		serverErrors <- srv.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	case sig := <-shutdown:
		slog.Info("shutdown signal received", "signal", sig.String())
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
			_ = srv.Close()
		}
	}

	slog.Info("api server stopped")
}
