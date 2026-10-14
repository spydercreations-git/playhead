# Playhead Build Progress

Tracking the implementation of Playhead across milestones according to Section 16 of `docs/PLAYHEAD_BUILD_SPEC.md`.

---

## Milestone 1: Foundation

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Monorepo Structure**: Complete directory layout (`apps/web`, `services/api`, `services/shared`, `services/worker`, `infra`, `db`, `docs`).
2. **Local Infrastructure**: Docker Compose configuration for PostgreSQL 16, Redis 7, MinIO (Cloudflare R2 local stand-in), and Mailpit.
3. **Database Foundation**: Goose migration `00001_foundation.sql` containing core identity tables (`users`, `sessions`, `companies`, `memberships`, `invites`) and `sqlc` generation.
4. **Shared Domain Rules**: `services/shared/plans/plans.go` implementing plan definitions, storage quota calculation in integer bytes, and feature gating.
5. **Go API Skeleton**: `chi` router with middleware (structured logging, CORS, recovery, request ID), standard error responses, and `GET /api/v1/health`.
6. **Frontend App**: Next.js App Router, Tailwind CSS, dark theme styling with CSS variables, responsive app layout (sidebar, header, content area), and skeleton states.
7. **CI Pipeline**: GitHub Actions workflow testing Go code and TypeScript compilation.
8. **Automation Commands**: Root `Makefile` with `make dev`, `make test`, and `make stop`.

### How to run it:
- `make dev`: Starts the local databases/services in Docker, runs database migrations, and boots both the Go API and Next.js web application.
- `make test`: Runs all backend unit tests, database checks, and frontend TypeScript type checks.
- `make stop`: Shuts down the background servers and local database containers cleanly.

---

---

## Milestone 2: Auth and Companies

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Full Authentication & Session Engine**:
   - `services/shared/authz`: Argon2id password hashing and verification, constant-time SHA-256 token hashing, role hierarchy enforcement (`owner > admin > member > guest`), and `Authorize()` rules.
   - `services/shared/mailer`: Email dispatch supporting local Mailpit SMTP (`localhost:1025`) and Resend API for production.
   - Session management with 30-day sliding expiry, `HttpOnly` cookie (`playhead_session`), and token hash indexing.
2. **Security & Rate Limiting**:
   - Redis-backed rate limiting (5 attempts per 15 minutes per IP and per email) on login, signup, forgot password, and reset password endpoints.
   - Double-submit cookie CSRF protection (`playhead_csrf` / `X-CSRF-Token`) for all state-mutating requests.
3. **Email Verification**:
   - Verification token generated at signup.
   - Verification required prior to company workspace creation.
   - Frontend verification page (`/verify-email?token=...`) with automatic verification and onboarding CTA.
4. **Company Workspace & 14-Day Agency Trial**:
   - Company creation with slug generator, activating 14-day agency trial with 1 TB storage.
   - **Trial Seat Limit**: Hard-capped at 5 team seats (1 owner + 4 members/invites) during the 14-day trial in `services/shared/plans/plans.go` and database transaction validation.
5. **Onboarding Flow (`/onboarding`)**:
   - 2-step onboarding: Step 1 (Company Name & Workspace URL) and Step 2 (Invite up to 4 team members with role selector).
   - Step 3 (First Project) deferred to Milestone 3 per approved plan.
6. **Strict Team Invites (`/invite/[token]` & `/team`)**:
   - Invites expire after 7 days (`time.Now().Add(7 * 24 * time.Hour)`).
   - Strict security check: Invitations can only be accepted by an account with the matching email.
   - Team management page (`/team`) displaying active members, role management, seat usage count, and pending invites.
7. **Brand Assets & Typography**:
   - Vector brand assets integrated from `/design/playhead-icon-white.svg` and `/design/playhead-logo-white.svg`.
   - Used `PlayheadIcon` as browser favicon and `PlayheadLogoWithText` on auth and onboarding screens.

### How to test locally:
1. **View local emails**: Open Mailpit in your browser at `http://localhost:8025` to see all signup verification emails, invite links, and password reset links.
2. **Run all tests**: Run `make test` to verify backend handler tests, middleware CSRF tests, authz tests, plans limit tests, and web TypeScript checks.
3. **Run dev server**: Run `make dev` to launch the API and Next.js frontend.

### How to configure Google Login later:
Google Login is built into the backend and UI, but hidden until configured. When you are ready:
1. Go to Google Cloud Console (`https://console.cloud.google.com`).
2. Create a new project and configure the "OAuth consent screen".
3. Under "Credentials", create an **OAuth 2.0 Client ID** (Web application).
4. Set Authorized redirect URIs to: `http://localhost:8080/api/v1/auth/google/callback` (and your production domain later).
5. Copy your Client ID and Client Secret into your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here
   ```
6. The "Continue with Google" button will automatically appear on the Login and Signup pages.

---

---

## Milestone P1: Roles, Clients, Projects

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Roles and Access Engine**:
   - `services/shared/authz`: Migrated to V2 roles (`admin`, `manager`, `editor`). Added centralized `authz.Access(person, project)` returning `{Level, CanDownload}` combining company membership, project grants, and client contact defaults ("Access to all projects" above None).
   - Enforced project management rules: Only Admins, Managers, and Full access grantees can add/edit/remove members on a project.
   - Case-insensitive email normalization across users, client contacts, grants, and login codes.
2. **Authentication Updates**:
   - Disabled public self-signup; redirected to closed workspace notice.
   - Added passwordless 6-digit email sign-in code flow (`/auth/login-code/send`, `/auth/login-code/verify`) with SHA-256 hash storage and 10-minute expiry.
   - Known email validation: unregistered emails get friendly notification *"This email doesn't have access to Playhead yet. Ask the person who invited you."*
   - Client user company resolution fallback granting streamlined client sidebar navigation (Home, Projects, Shared with me, Starred, Trash; hiding internal-only tabs and "+ New" unless permitted).
3. **Database Migration & Models**:
   - `00003_p1_roles_clients_projects.sql`: Migrated roles; created `login_codes`, `clients`, `client_contacts`, `projects`, `items`, and `grants` tables.
   - Sqlc queries in `db/queries/clients_projects.sql` with type-safe Go models.
4. **Clients & Contacts**:
   - Backend CRUD (`/api/v1/clients`, `/api/v1/clients/{id}/contacts`).
   - Frontend Clients page (`/clients`) with grid/list views and search.
   - Client detail page (`/clients/[id]`) with Projects list, Contacts manager with default project access controls, and plain text Notes tab.
   - New Client dialog with instant initial contact creation.
5. **Projects & Workspace**:
   - Backend CRUD (`/api/v1/projects`).
   - Templates support: Blank project and Video Project (pre-populating folders `Briefs`, `Raw footage`, `Edits`, `Deliverables`).
   - Frontend Projects page (`/projects`) with status filters, client filter, grid/table view.
   - Project Workspace shell (`/projects/[id]`) with folder tree navigator, storage quota display, and People & Access dialog.
6. **Automated Testing Suite**:
   - Full suite in `services/api/internal/handler/p1_projects_clients_test.go` covering client contacts, role restrictions, editor 404 isolation, commenter permission limits, and case-insensitive email matching.

### How to test locally:
1. Run `make test` to verify all Go unit and integration tests and Next.js TypeScript compilation.
2. Run `make dev` and visit `http://localhost:3000` to interact with Clients, Projects, and People management.
3. Check Mailpit at `http://localhost:8025` for login verification codes.

---

## Milestone P2: Files, Folders, Fast Upload and Download

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Pay-as-you-go Storage & "Internal" Plan**:
   - Added `internal` plan in `services/shared/plans/plans.go` with unlimited storage, no trial expiry, no seat limit, and up to 100 GB max file size.
   - Database migration `00004_p2_items_uploads_storage.sql` automatically moved company "Idyll Productions" to the `internal` plan.
   - Byte-accurate tracking of all versions and soft-deleted Trash items in integer bytes.
   - Admin Storage Dashboard (`/settings/storage`): Displays total storage used, reserved bytes, estimated monthly cost (calculated from `STORAGE_PRICE_PER_GB`, default $0.015 USD), and breakdown per client and project.
   - Storage alerts (`STORAGE_ALERT_GB`, default 1000 GB): Emails workspace administrators via `mailer.SendStorageAlertEmail` when storage threshold is crossed and every further 500 GB.

2. **Reserved Bytes & Quota Lifecycle**:
   - `storage_reserved_bytes` reserved atomically in a transaction on upload initiate (`/api/v1/uploads/initiate`).
   - Committed to `storage_used_bytes` upon upload completion (`/api/v1/uploads/{id}/complete`).
   - Released immediately if aborted (`DELETE /api/v1/uploads/{id}`).
   - Background hourly cleanup ticker in the API server (`CleanupAbandonedUploads`) automatically aborts uploads abandoned for > 24 hours, cleans up uploaded parts in S3, and releases reserved bytes.

3. **Fast Parallel Resumable Multipart Uploads**:
   - Storage keys use IDs only: `companies/{cid}/items/{item_id}/v{n}`, never user-supplied file names.
   - S3/MinIO bucket configured with CORS exposing `ETag` and ranges to the web browser.
   - Direct-to-storage parallel chunk upload engine in the browser (5 MB - 50 MB chunk size, dynamically scaling to keep parts <= 10,000 for up to 100 GB files).
   - Zero file bytes flow through the API server during upload.
   - Browser Upload Tray: shows upload speed (MB/s), remaining time, chunk-level progress bar, pause/resume, and cancel buttons.
   - Reload resilience: active uploads persist in `localStorage`; browser queries `/uploads/{id}/parts` to resume only missing parts without re-uploading completed chunks.
   - Conflict detection: duplicate file names prompt the user to "Keep both" (appends ` (1)`) or "Upload as new version". Folder uploads merge transparently into existing folders.

4. **File & Folder Operations**:
   - Recursive folder tree sidebar and folder navigation (`/projects/[id]?folder=...`).
   - Full CRUD: Create folder, rename item, move item (with ancestor circular-reference prevention), server-side storage copy (`CopyObject`), soft-delete to Trash, and batch actions.
   - Starred items: star/unstar files and folders, with dedicated Starred page (`/starred`).
   - Trash & Permanent Delete: soft-delete to Trash (`/trash`) where items still count towards storage until permanently deleted; permanent delete removes all S3 version objects and previews.
   - Grid and table view toggle with persistent preference, multi-select floating action bar, desktop drag-and-drop file and folder uploads.
   - Hidden document/spreadsheet/tracker creations until Milestones P5 and P6.

5. **Downloads & Streaming Zip Engine**:
   - Direct presigned download URLs for files (`/api/v1/items/{id}/download`), enforcing `CanDownload` permissions.
   - Streaming zip downloads (`/api/v1/downloads/zip`) in store mode (no compression for maximum speed) streamed directly through the API for archives <= 2 GB.
   - Strict security check: zip archive is rejected with 403 if ANY item has `can_download == false`.

6. **File Viewer & Video Player**:
   - Full modal viewer (`FileViewer`): non-video media viewer for Audio (waveform preview), Images (fit/100% zoom), PDF (in-browser embed), and Code/Text with metadata details drawer.
   - Video player: double-clicking a video in P2 plays the original file in a sleek, dark HTML5 player (until HLS transcoded previews arrive in Milestone P4).

7. **Automated Testing Suite**:
   - `services/api/internal/handler/p2_files_folders_test.go` verifying:
     - Viewer and Commenter are rejected (403) from uploading.
     - Uploader cannot rename or delete someone else's file.
     - Storage bytes stay byte-exact after upload, abort, delete, and restore.
     - Abandoned upload hourly cleanup releases reserved bytes.
     - Zip download is refused if any item has Can download off.
     - Plans limits and internal unlimited storage logic tested in `services/shared/plans/plans_test.go`.

### How to test locally:
1. Run `make test` to verify all backend unit/integration tests and web TypeScript checks pass.
2. Run `make dev` and visit `http://localhost:3000/projects/[project_id]`:
   - Drag and drop files or folders or click **Upload** -> **Upload files**.
   - Watch the floating Upload Tray upload directly to MinIO with parallel chunks, speed, and time estimation.
   - Test Pause / Resume or refresh the page to resume uploads.
   - Click **Settings** -> **Storage** (`/settings/storage`) to see the byte-accurate storage usage, reserved bytes, and monthly cost estimate.
3. Check Mailpit at `http://localhost:8025` for storage alert emails.

---

## Upcoming Milestones (Version 2: P3 – P7)

- **Milestone P3: Permissions and sharing**
  - Central `authz.Access(person, item)` engine with access levels (Viewer, Commenter, Uploader, Full access) and `Can download`.
  - Permission inheritance, client contact defaults, move confirmation for access changes.
  - Share dialog (People tab + Share link tab).
  - Public share link page with password, expiry, download toggle, upload drop zone.
  - "Shared with me" section. Comprehensive permission test suite.

- **Milestone P4: Video review**
  - Asynchronous processing worker for HLS previews (720p/1080p).
  - Video review player with frame-accurate comments, drawings, and "Team only" visibility.
  - Versions and side-by-side compare.
  - Approval flow (Approve, Request changes) and Reviews page.
  - Comment export (PDF/CSV). Audio and image comments.

- **Milestone P5: Documents**
  - Node.js collaboration service (`/services/collab`) with Hocuspocus and Yjs.
  - Tiptap document editor (`/d/{id}`), live collaborative editing, presence/cursors, comments, version history, export/import.

- **Milestone P6: Spreadsheets and Tracker**
  - Spreadsheet engine evaluation, comparison, and approval.
  - Full spreadsheet editor (`/s/{id}`) with formulas and collaborative live editing.
  - Automatic Tracker sheet generated for every project.

- **Milestone P7: Search, notifications, polish**
  - Global search across clients, projects, folders, files, document text, and comments.
  - In-app notification bell and email notifications.
  - Client Notes. Performance validation against Section 7 benchmarks. Security audit.
  - **Internal launch for the Idyll team and clients after P7.**
