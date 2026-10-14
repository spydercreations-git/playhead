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
	"github.com/playhead/playhead/services/shared/mailer"
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

	// Initialize database queries and mailer
	var queries *db.Queries
	if dbPool != nil {
		queries = db.New(dbPool)
	}

	mailClient := mailer.New(mailer.Config{
		FromEmail:    "no-reply@playhead.app",
		FromName:     "Playhead",
		ResendAPIKey: cfg.ResendAPIKey,
		SMTPHost:     cfg.SMTPHost,
		SMTPPort:     cfg.SMTPPort,
		FrontendURL:  cfg.AppURL,
	})

	// Handlers and middleware
	authHandler := handler.NewAuthHandler(queries, mailClient, cfg.GoogleClientID, cfg.AppURL, cfg.Environment == "production")
	companyHandler := handler.NewCompanyHandler(queries)
	inviteHandler := handler.NewInviteHandler(queries, mailClient)
	clientHandler := handler.NewClientHandler(queries, mailClient)
	projectHandler := handler.NewProjectHandler(queries)
	itemsHandler := handler.NewItemsHandler(queries, storageClient)
	storageUploadsHandler := handler.NewStorageUploadsHandler(queries, storageClient, mailClient, cfg)
	rateLimiter := middleware.NewRateLimiter(rdb, 5, 15*time.Minute) // 5 attempts per 15 min per IP/email
	authMw := middleware.NewAuthMiddleware(queries)

	// Hourly abandoned upload cleanup (Requirement 2)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if count, err := storageUploadsHandler.CleanupAbandonedUploads(context.Background()); err == nil && count > 0 {
				slog.Info("hourly cleanup aborted abandoned uploads", "count", count)
			}
		}
	}()

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

		// Public & Rate-Limited Authentication routes
		api.Route("/auth", func(auth chi.Router) {
			auth.With(rateLimiter.LimitAuth("signup")).Post("/signup", authHandler.Signup)
			auth.With(rateLimiter.LimitAuth("login")).Post("/login", authHandler.Login)
			auth.With(rateLimiter.LimitAuth("code_send")).Post("/code/send", authHandler.SendLoginCode)
			auth.With(rateLimiter.LimitAuth("code_verify")).Post("/code/verify", authHandler.VerifyLoginCode)
			auth.With(rateLimiter.LimitAuth("forgot")).Post("/forgot-password", authHandler.ForgotPassword)
			auth.With(rateLimiter.LimitAuth("reset")).Post("/reset-password", authHandler.ResetPassword)
			auth.Post("/verify-email", authHandler.VerifyEmail)
			auth.Get("/google/url", authHandler.GoogleOAuthURL)
			auth.Post("/logout", authHandler.Logout)
		})

		// Public invite preview
		api.Get("/invites/{token}", inviteHandler.GetInvite)

		// Protected endpoints (Requires authentication and CSRF token validation)
		api.Group(func(protected chi.Router) {
			protected.Use(authMw.Authenticate)
			protected.Use(middleware.CSRF)

			protected.Get("/me", authHandler.Me)

			// Company management
			protected.Post("/companies", companyHandler.Create)
			protected.Get("/companies/{company_id}/members", companyHandler.GetMembers)
			protected.With(middleware.RequireRole("admin")).Patch("/companies/{company_id}/members/{user_id}", companyHandler.UpdateMemberRole)
			protected.With(middleware.RequireRole("admin")).Delete("/companies/{company_id}/members/{user_id}", companyHandler.RemoveMember)

			// Invites
			protected.With(middleware.RequireRole("admin")).Post("/companies/{company_id}/invites", inviteHandler.Create)
			protected.With(middleware.RequireRole("admin")).Get("/companies/{company_id}/invites", inviteHandler.ListForCompany)
			protected.Post("/invites/{token}/accept", inviteHandler.Accept)

			// Clients and Contacts (P1)
			protected.Get("/clients", clientHandler.List)
			protected.Post("/clients", clientHandler.Create)
			protected.Get("/clients/{id}", clientHandler.Get)
			protected.Patch("/clients/{id}", clientHandler.Update)
			protected.Delete("/clients/{id}", clientHandler.Delete)
			protected.Get("/clients/{id}/contacts", clientHandler.ListContacts)
			protected.Post("/clients/{id}/contacts", clientHandler.AddContact)
			protected.Patch("/contacts/{id}", clientHandler.UpdateContact)
			protected.Delete("/contacts/{id}", clientHandler.DeleteContact)

			// Projects and People (P1)
			protected.Get("/projects", projectHandler.List)
			protected.Post("/projects", projectHandler.Create)
			protected.Get("/projects/{id}", projectHandler.Get)
			protected.Patch("/projects/{id}", projectHandler.Update)
			protected.Post("/projects/{id}/archive", projectHandler.Archive)
			protected.Delete("/projects/{id}", projectHandler.Delete)

			protected.Get("/projects/{id}/people", projectHandler.GetPeople)
			protected.Post("/projects/{id}/people", projectHandler.AddPerson)
			protected.Patch("/projects/{id}/people/{person_id}", projectHandler.UpdatePerson)
			protected.Delete("/projects/{id}/people/{person_id}", projectHandler.RemovePerson)

			// Items and Workspace (P2)
			protected.Get("/projects/{id}/items", itemsHandler.ListItems)
			protected.Get("/projects/{id}/folders/tree", itemsHandler.ListFoldersTree)
			protected.Post("/items/folder", itemsHandler.CreateFolder)
			protected.Patch("/items/{id}", itemsHandler.RenameItem)
			protected.Post("/items/{id}/move", itemsHandler.MoveItem)
			protected.Post("/items/{id}/copy", itemsHandler.CopyItem)
			protected.Delete("/items/{id}", itemsHandler.DeleteItem)
			protected.Post("/items/batch", itemsHandler.BatchAction)
			protected.Post("/items/check-conflict", itemsHandler.CheckNameConflict)
			protected.Post("/items/{id}/star", itemsHandler.StarItem)
			protected.Delete("/items/{id}/star", itemsHandler.UnstarItem)
			protected.Get("/starred", itemsHandler.ListStarred)
			protected.Get("/trash", itemsHandler.ListTrash)
			protected.Post("/trash/{id}/restore", itemsHandler.RestoreTrashItem)
			protected.Delete("/trash/{id}", itemsHandler.PermanentDeleteTrashItem)

			// Uploads & Downloads (P2)
			protected.Post("/uploads/initiate", storageUploadsHandler.InitiateUpload)
			protected.Get("/uploads/{id}/parts", storageUploadsHandler.GetUploadParts)
			protected.Post("/uploads/{id}/complete", storageUploadsHandler.CompleteUpload)
			protected.Delete("/uploads/{id}", storageUploadsHandler.AbortUpload)
			protected.Get("/items/{id}/download", storageUploadsHandler.DownloadItem)
			protected.Post("/downloads/prepare", storageUploadsHandler.PrepareDownload)
			protected.Post("/downloads/zip", storageUploadsHandler.ZipDownload)

			// Admin Storage Dashboard (P2 Requirement 1)
			protected.With(middleware.RequireRole("admin")).Get("/admin/storage", storageUploadsHandler.GetStorageAdminStats)
		})
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
