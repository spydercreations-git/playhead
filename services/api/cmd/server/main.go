package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/playhead/playhead/services/api/internal/handler"
	"github.com/playhead/playhead/services/api/internal/middleware"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/jobs"
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
	if err := cfg.Validate(); err != nil {
		slog.Error("FATAL: server configuration validation failed", "error", err)
		os.Exit(1)
	}
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
		checkMigrations(ctx, dbPool.Pool)
		if cfg.Environment != "production" {
			_ = handler.EnsureDevAdmins(ctx, dbPool.Pool, queries, cfg.DevAdminEmails)
		}
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
	authHandler.SetEnvironment(cfg.Environment)
	authHandler.SetGoogleClientSecret(cfg.GoogleClientSecret)
	companyHandler := handler.NewCompanyHandler(queries)
	inviteHandler := handler.NewInviteHandler(queries, mailClient)
	clientHandler := handler.NewClientHandler(queries, mailClient)
	projectHandler := handler.NewProjectHandler(queries)
	itemsHandler := handler.NewItemsHandler(queries, storageClient)
	storageUploadsHandler := handler.NewStorageUploadsHandler(queries, storageClient, mailClient, cfg)
	rateLimiter := middleware.NewRateLimiter(rdb, 5, 15*time.Minute) // 5 attempts per 15 min per IP/email
	authMw := middleware.NewAuthMiddleware(queries)

	rolesHandler := handler.NewRolesHandler(queries)
	rolesHandler.SetRedisClient(rdb)
	companyHandler.SetRedisClient(rdb)
	notifHandler := handler.NewNotificationSettingsHandler(queries)
	shareLinksHandler := handler.NewShareLinksHandler(queries, storageClient, cfg.SessionSecret, cfg.Environment)
	grantsHandler := handler.NewGrantsHandler(queries, mailClient)
	grantsHandler.SetRedisClient(rdb)
	reviewHandler := handler.NewReviewHandler(queries, storageClient, cfg)
	var pgxPool *pgxpool.Pool
	if dbPool != nil {
		pgxPool = dbPool.Pool
	}
	documentsHandler := handler.NewDocumentsHandler(pgxPool, queries, rdb, storageClient, cfg)
	spreadsheetsHandler := handler.NewSpreadsheetsHandler(pgxPool, queries, rdb, storageClient, cfg)
	driveHandler := handler.NewDriveHandler(queries, pgxPool, storageClient, cfg)
	if pgxPool != nil {
		projectHandler.SetPool(pgxPool)
	}
	if storageClient != nil {
		projectHandler.SetStorage(storageClient)
	}

	// Background job queue via Redis asynq
	var asynqClient *asynq.Client
	if cfg.RedisURL != "" {
		asynqClient = asynq.NewClient(jobs.ParseRedisOpt(cfg.RedisURL))
		defer asynqClient.Close()
	}
	storageUploadsHandler.SetAsynqClient(asynqClient)
	shareLinksHandler.SetAsynqClient(asynqClient)
	reviewHandler.SetAsynqClient(asynqClient)
	reviewHandler.SetMailer(mailClient)

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

	// Internal service endpoints (e.g. Hocuspocus Collab Service)
	r.Post("/api/internal/collab/verify", documentsHandler.InternalCollabVerify)

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
			auth.With(rateLimiter.LimitAuth("code_send")).Post("/resend-verification", authHandler.ResendVerification)
			auth.Get("/google/url", authHandler.GoogleOAuthURL)
			auth.Get("/google/callback", authHandler.GoogleOAuthCallback)
			auth.Post("/google/callback", authHandler.GoogleOAuthCallback)
			auth.Post("/logout", authHandler.Logout)

			if cfg.Environment == "development" {
				auth.Post("/dev-login", authHandler.DevLogin)
			}
		})

		// Public invite preview
		api.Get("/invites/{token}", inviteHandler.GetInvite)

		// Public Share Link Visitor Endpoints (P3)
		api.Route("/s/{token}", func(share chi.Router) {
			share.Get("/", shareLinksHandler.PublicGet)
			share.Post("/unlock", shareLinksHandler.PublicUnlock)
			share.Post("/identify", shareLinksHandler.PublicIdentify)
			share.Get("/items/{itemId}/download", shareLinksHandler.PublicDownload)
			share.Post("/upload", shareLinksHandler.PublicUpload)
			share.Post("/upload/complete", shareLinksHandler.PublicUploadComplete)
			share.Post("/upload/abort", shareLinksHandler.PublicUploadAbort)

			// Video review & comments on share links (P4)
			share.Get("/items/{id}/playlist.m3u8", reviewHandler.PublicPlaylistProxy)
			share.Get("/items/{id}/{playlist}", reviewHandler.PublicPlaylistProxy)
			share.Get("/items/{id}/comments", reviewHandler.PublicListComments)
			share.Post("/items/{id}/comments", reviewHandler.PublicCreateComment)
			share.Post("/items/{id}/review", reviewHandler.PublicSubmitReview)
			share.Get("/items/{id}/comments/export", reviewHandler.PublicExportCommentsCSV)

			// Document views and images on share links (P5)
			share.Get("/documents/{id}/view", documentsHandler.PublicShareGetDocumentView)
			share.Get("/documents/{id}/images/{imageId}", documentsHandler.PublicShareGetDocumentImage)
			share.Get("/documents/{id}/items/{itemId}/card-preview", documentsHandler.PublicShareGetCardPreview)
		})

		// Protected endpoints (Requires authentication, CSRF token validation, and verified email)
		api.Group(func(protected chi.Router) {
			protected.Use(authMw.Authenticate)
			protected.Use(middleware.CSRF)
			protected.Use(middleware.RequireVerifiedEmail)

			protected.Get("/me", authHandler.Me)
			protected.Get("/auth/me", authHandler.Me)

			// Company management
			protected.Post("/companies", companyHandler.Create)
			protected.Get("/companies/{company_id}/members", companyHandler.GetMembers)
			protected.With(middleware.RequirePermission(authz.PermTeamChangeRoles)).Patch("/companies/{company_id}/members/{user_id}", companyHandler.UpdateMemberRole)
			protected.With(middleware.RequirePermission(authz.PermTeamChangeRoles)).Delete("/companies/{company_id}/members/{user_id}", companyHandler.RemoveMember)

			// Custom Roles RBAC (P3)
			protected.Get("/roles", rolesHandler.List)
			protected.Post("/roles", rolesHandler.Create)
			protected.Patch("/roles/{id}", rolesHandler.Update)
			protected.Delete("/roles/{id}", rolesHandler.Delete)

			// Notification Preferences & Project Bell (P3)
			protected.Get("/settings/notifications", notifHandler.GetSettings)
			protected.Put("/settings/notifications", notifHandler.UpdateSettings)
			protected.Get("/projects/{id}/notifications", notifHandler.GetProjectBell)
			protected.Put("/projects/{id}/notifications", notifHandler.UpdateProjectBell)

			// Invites
			protected.With(middleware.RequirePermission(authz.PermTeamInvite)).Post("/companies/{company_id}/invites", inviteHandler.Create)
			protected.With(middleware.RequirePermission(authz.PermTeamInvite)).Get("/companies/{company_id}/invites", inviteHandler.ListForCompany)
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

			// Projects and People (P1 & P3)
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

			// Grants & Sharing (P3)
			protected.Get("/projects/{id}/access", grantsHandler.ListProjectGrants)
			protected.Post("/projects/{id}/access", grantsHandler.AddProjectGrant)
			protected.Get("/items/{id}/access", grantsHandler.ListItemGrants)
			protected.Post("/items/{id}/access", grantsHandler.AddItemGrant)
			protected.Delete("/grants/{id}", grantsHandler.DeleteGrant)
			protected.Post("/items/{id}/check-move", grantsHandler.CheckMove)
			protected.Get("/shared-with-me", grantsHandler.ListSharedWithMe)

			// Project Share Links (P3)
			protected.Get("/projects/{id}/share-links", shareLinksHandler.ListProjectLinks)
			protected.Post("/projects/{id}/share-links", shareLinksHandler.Create)
			protected.Patch("/share-links/{id}", shareLinksHandler.Update)
			protected.Delete("/share-links/{id}", shareLinksHandler.Delete)

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
			protected.Get("/items/{id}/view", storageUploadsHandler.ViewItem)
			protected.Get("/items/{id}/download", storageUploadsHandler.DownloadItem)
			protected.Post("/downloads/prepare", storageUploadsHandler.PrepareDownload)
			protected.Post("/downloads/zip", storageUploadsHandler.ZipDownload)

			// Video Review & Comments (P4)
			protected.Get("/items/{id}/versions", reviewHandler.GetVersions)
			protected.Get("/items/{id}/versions/{v}/playlist.m3u8", reviewHandler.PlaylistProxy)
			protected.Get("/items/{id}/versions/{v}/{playlist}", reviewHandler.PlaylistProxy)
			protected.Get("/items/{id}/comments", reviewHandler.ListComments)
			protected.Post("/items/{id}/comments", reviewHandler.CreateComment)
			protected.Patch("/comments/{id}", reviewHandler.UpdateComment)
			protected.Delete("/comments/{id}", reviewHandler.DeleteComment)
			protected.Post("/comments/{id}/resolve", reviewHandler.ResolveComment)
			protected.Post("/comments/{id}/reopen", reviewHandler.ReopenComment)
			protected.Get("/items/{id}/comments/export", reviewHandler.ExportCommentsCSV)
			protected.Post("/items/{id}/review", reviewHandler.SubmitReview)
			protected.Post("/items/{id}/reopen", reviewHandler.ReopenReview)
			protected.Get("/items/{id}/reviews", reviewHandler.ListReviews)
			protected.Get("/items/{id}/mentionable", reviewHandler.ListMentionable)
			protected.Get("/reviews", reviewHandler.ListReviewsFeed)

			// Admin Storage Dashboard (P2 Requirement 1)
			protected.With(middleware.RequirePermission(authz.PermAdminStorage)).Get("/admin/storage", storageUploadsHandler.GetStorageAdminStats)

			// Documents (P5)
			protected.Get("/documents", documentsHandler.List)
			protected.Post("/documents", documentsHandler.Create)
			protected.Post("/projects/{id}/documents", documentsHandler.Create)
			protected.Get("/documents/{id}", documentsHandler.Get)
			protected.Get("/documents/{id}/view", documentsHandler.GetSanitizedView)
			protected.Post("/documents/{id}/collab-ticket", documentsHandler.IssueCollabTicket)
			protected.Patch("/documents/{id}/title", documentsHandler.Rename)
			protected.Post("/documents/{id}/images/presign", documentsHandler.PresignImageUpload)
			protected.Post("/documents/{id}/images/complete", documentsHandler.CompleteImageUpload)
			protected.Get("/documents/{id}/images/{imageId}", documentsHandler.GetImage)
			protected.Get("/documents/{id}/versions", documentsHandler.ListVersions)
			protected.Post("/documents/{id}/versions/{versionId}/name", documentsHandler.NameVersion)
			protected.Post("/documents/{id}/restore", documentsHandler.RestoreVersion)
			protected.Post("/documents/{id}/versions/{version_id}/restore", documentsHandler.RestoreVersion)
			protected.Get("/documents/{id}/items/{itemId}/card-preview", documentsHandler.GetCardPreview)
			protected.Get("/documents/{id}/export/{format}", documentsHandler.Export)
			protected.Post("/documents/{id}/export/pdf", documentsHandler.ExportPdf)
			protected.Get("/documents/{id}/export/pdf", documentsHandler.ExportPdf)
			protected.Post("/documents/{id}/preview-pdf-html", documentsHandler.PreviewPdfHtml)
			protected.Post("/documents/{id}/import/docx", documentsHandler.ImportDocx)
			protected.Post("/documents/{id}/import-docx", documentsHandler.ImportDocx)
			protected.Delete("/documents/{id}", itemsHandler.DeleteItem)

			// Spreadsheets (Milestone P6)
			protected.Get("/spreadsheets", spreadsheetsHandler.ListSpreadsheets)
			protected.Post("/spreadsheets", spreadsheetsHandler.CreateSpreadsheet)
			protected.Post("/projects/{projectId}/spreadsheets", spreadsheetsHandler.CreateSpreadsheet)
			protected.Get("/projects/{projectId}/spreadsheets", spreadsheetsHandler.ListSpreadsheets)
			protected.Get("/spreadsheets/{id}", spreadsheetsHandler.GetSpreadsheet)
			protected.Delete("/spreadsheets/{id}", itemsHandler.DeleteItem)
			protected.Get("/spreadsheets/{id}/view", spreadsheetsHandler.GetSpreadsheetView)
			protected.Post("/spreadsheets/{id}/export/pdf", spreadsheetsHandler.ExportPdf)
			protected.Get("/spreadsheets/{id}/export/pdf", spreadsheetsHandler.ExportPdf)
			protected.Post("/spreadsheets/{id}/preview-pdf-html", spreadsheetsHandler.PreviewPdfHtml)
			protected.Post("/spreadsheets/{id}/cells", spreadsheetsHandler.SetCellValue)
			protected.Post("/spreadsheets/{id}/rows", spreadsheetsHandler.InsertRow)
			protected.Patch("/spreadsheets/{id}/columns", spreadsheetsHandler.UpdateColumnMeta)
			protected.Post("/spreadsheets/{id}/collab-ticket", spreadsheetsHandler.CreateCollabTicket)
			protected.Post("/spreadsheets/{id}/import", spreadsheetsHandler.ImportSpreadsheet)
			protected.Get("/spreadsheets/{id}/versions", spreadsheetsHandler.ListVersions)
			protected.Post("/spreadsheets/{id}/versions/{versionId}/restore", spreadsheetsHandler.RestoreVersion)
			protected.Get("/spreadsheets/{id}/comments", spreadsheetsHandler.ListComments)
			protected.Post("/spreadsheets/{id}/comments", spreadsheetsHandler.CreateComment)
			protected.Patch("/spreadsheets/{id}/comments/{commentId}/resolve", spreadsheetsHandler.ResolveComment)

			// My Drive & Recent Items (P2 & P3)
			protected.Get("/drive/folders", driveHandler.ListFolders)
			protected.Get("/drive/items", driveHandler.ListItems)
			protected.Post("/drive/folders", driveHandler.CreateFolder)
			protected.Patch("/drive/items/{id}", driveHandler.RenameItem)
			protected.Delete("/drive/items/{id}", driveHandler.DeleteItem)
			protected.Post("/drive/items/{id}/restore", driveHandler.RestoreItem)
			protected.Post("/drive/items/{id}/move", driveHandler.MoveToProject)
			protected.Post("/drive/items/{id}/copy", driveHandler.CopyToProject)
			protected.Get("/drive/recent", driveHandler.ListRecentItems)
			protected.Post("/drive/recent", driveHandler.RecordRecentItem)
			protected.Get("/drive/trash", driveHandler.ListTrash)
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

// checkMigrations verifies on startup that all database migrations in db/migrations have run.
// If the database is behind, it logs a warning and prints "Database is behind: run make migrate" in the terminal.
func checkMigrations(ctx context.Context, pool *pgxpool.Pool) {
	if pool == nil {
		return
	}

	// 1. Find migrations directory and locate highest version
	candidatePaths := []string{"db/migrations", "../../db/migrations", "../db/migrations"}
	var latestVersion int64 = 0

	for _, p := range candidatePaths {
		entries, err := os.ReadDir(p)
		if err == nil && len(entries) > 0 {
			for _, e := range entries {
				name := e.Name()
				if strings.HasSuffix(name, ".sql") {
					parts := strings.SplitN(name, "_", 2)
					if len(parts) > 0 {
						if v, err := strconv.ParseInt(parts[0], 10, 64); err == nil && v > latestVersion {
							latestVersion = v
						}
					}
				}
			}
			if latestVersion > 0 {
				break
			}
		}
	}

	if latestVersion == 0 {
		return
	}

	// 2. Query goose_db_version
	var exists bool
	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_name = 'goose_db_version'
		)
	`).Scan(&exists)

	if err != nil || !exists {
		slog.Warn("Database is behind: run make migrate", "applied_version", 0, "latest_version", latestVersion)
		fmt.Fprintf(os.Stderr, "\n⚠️  Database is behind: run make migrate (applied: 0, latest: %d)\n\n", latestVersion)
		return
	}

	var appliedVersion int64 = 0
	err = pool.QueryRow(ctx, `
		SELECT COALESCE(MAX(version_id), 0)
		FROM goose_db_version
		WHERE is_applied = true
	`).Scan(&appliedVersion)

	if err != nil || appliedVersion < latestVersion {
		slog.Warn("Database is behind: run make migrate", "applied_version", appliedVersion, "latest_version", latestVersion)
		fmt.Fprintf(os.Stderr, "\n⚠️  Database is behind: run make migrate (applied: %d, latest: %d)\n\n", appliedVersion, latestVersion)
	} else {
		slog.Info("database migrations are up to date", "applied_version", appliedVersion)
	}
}
