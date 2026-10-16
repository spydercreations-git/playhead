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

## Milestone P3: Permissions, Roles and Sharing

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Centralized Authorization & Permission Resolution**:
   - `services/shared/authz.Access`: evaluates company role, item grants, client contact defaults, and ancestor folder hierarchy.
   - Granular permission levels: `Viewer`, `Commenter`, `Uploader`, and `Full access`, alongside `Can download` restriction.
   - **Speed Optimization**: Folder listing resolves permissions once for the folder (single ancestor query) and applies directly to all children without per-file loops. Tested and benchmarked with 1,000 files listing in ~12ms.

2. **Custom Roles & Granular RBAC Engine**:
   - `roles` table with 17 granular permissions (`clients.*`, `projects.*`, `files.*`, `sharing.*`, `team.*`, `admin.*`).
   - System `Admin` role is protected (cannot be edited or deleted).
   - Last Admin guard: Prevents demoting or deleting the final admin in a company.
   - Roles with active members cannot be deleted without reassigning members first.
   - Team page tab for "Roles & Permissions" with matrix editor and custom role creator.

3. **Item & Project Sharing (People Grants)**:
   - Share modal (`ShareModal`) on projects, folders, and files with two tabs: **People** and **Share link**.
   - Adding or changing people requires `Full access` on the item.
   - Users with Viewer, Commenter, or Uploader access see **Request access** instead of Share.
   - Direct "Shared with me" section (`/shared-with-me`) displaying all items granted to the user.
   - Instant revocation: Removing a grant immediately cuts access across all endpoints.
   - "Copy link" button next to Share on projects, folders, and files. Shows toast: *"Link copied. Only people with access can open it."*

4. **Public Share Links (`/s/{token}`)**:
   - Strict scope enforcement: Visitors can only view, download, or upload to the linked items and their nested folders. Any request outside the link returns 404.
   - Disabled links return 404; expired links return 410.
   - Password protection: Verified with Argon2id; sets short-lived cookie scoped to the link.
   - Optional identity gate: requires email/name before entering.
   - Upload links: files can only be uploaded into the target linked folder, count against company storage, and enforce `upload_limit_bytes`.
   - Download toggle: respects `allow_download` flag; streams zip directly in browser from presigned URLs.

5. **Notification Settings & Email Notifications**:
   - Notification preferences page (`/settings/notifications`) with granular toggles (In app / Email) and digest options.
   - Project header notification bell with 3 levels (`All activity`, `Only mentions and my files`, `Off`).
   - Email dispatches for project/item access grants (respecting recipient notification settings), with single CTA button and 6-digit email sign-in code support for users without accounts.

6. **Design System & Zero Emoji Rule**:
   - Cleaned all emojis across the entire web application.
   - Replaced comment emojis with Lucide SVG `MessageSquare` icons.
   - Project workspace updated to match `design/01-project-folder-view.png` layout.

7. **Automated Testing Suite**:
   - `services/api/internal/handler/p3_sharing_roles_test.go` covering all required scenarios:
     1. Share link visitor requesting item outside link gets 404.
     2. Viewer cannot create grants or share links (403).
     3. Person with Full access but without `sharing.create_public_links` cannot create public link (403).
     4. Removing a grant removes access immediately.
     5. Expired link returns 410 and disabled link returns 404.
     6. Upload link rejects uploads over its limit (413).
     7. Listing folder with 1,000 files makes fixed database queries and completes in < 1s.
     8. Last Admin cannot be demoted or removed (400).
     9. Deleting role with active members is refused (400).

8. **Advisor Audit Review 2 Security Fixes**:
   - **Signed Share Link Cookies**: Unlock cookie signed with `HMAC(SESSION_SECRET, link_id:password_version:expiry)`, 12h expiry, HttpOnly, SameSite=Lax, Secure in prod. Verified on all public routes. Modifying password increments `password_version` to invalidate past unlocks.
   - **Atomic Total Link Upload Limit**: `uploaded_bytes + upload_reserved_bytes + size_bytes <= upload_limit_bytes` enforced atomically. Reserved bytes committed on completion or released on abort.
   - **Folder and Item Level Grants Everywhere**: Every item action (`view`, `download`, `upload`, `create folder`, `rename`, `move`, `copy`, `delete`, `star`, `folder tree`) scopes access via `AccessFolder`/`AccessItem`. Folder grantees cannot access outside items.
   - **Inherited CanDownload**: Derived from the source providing final access level; tie-breaks resolve by strictest rule.
   - **Role Escalation Guards**: Only Admins can grant/remove Admin role. Users cannot edit/delete their own role. Non-held permissions cannot be added to roles. Free-text roles rejected.
   - **Permission-Based Routing**: Replaced `RequireRole("admin")` with `RequirePermission(authz.PermTeamInvite)`, `RequirePermission(authz.PermTeamChangeRoles)`, `RequirePermission(authz.PermAdminStorage)`.
   - **Trash Restore Protection**: Requires at least `Uploader` access on destination folder/project.
   - **Automated Test Suite**: Added `TestP3_AdvisorSecondReviewSecurityFixes` verifying all 9 audit test cases.

   - **Production Secret Validation**: Refuses to start in `ENV=production` if `SESSION_SECRET` is missing, equals dev default, or is shorter than 32 characters. Enforces production secrets for `DATABASE_URL`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Documented key generation in `docs/DEPLOY_NOTES.md`.
   - **Go Modules & Docker Validation**: Standalone module builds verified (`GOWORK=off go build ./...` passes across `services/api`, `services/shared`, `services/worker`). Docker images `infra/Dockerfile.api` and `infra/Dockerfile.worker` verified to build cleanly.
   - **Folder-Scoped Batch Actions & Trash**: `BatchAction` and `ListTrash` resolve access once per parent folder with caching. Users with folder-level Full grants can batch move and delete inside their folder, but are strictly prevented from moving/deleting outside it.

### How to test locally:
1. Run all unit and permission tests: `go test -v -count=1 ./services/api/... ./services/shared/... ./services/worker/...`
2. Test production secret validator: `go test -v ./services/api/internal/config -run TestConfig_Validate_`
3. Test folder grant batch actions: `go test -v ./services/api/internal/handler -run TestFolderGrantBatchActionsAndTrash`
4. Run TypeScript typecheck: `cd apps/web && npm run typecheck`
5. See `docs/STATUS.md` Section 5 for step-by-step browser testing walkthrough of share links, roles, and grants.

---

## Milestone P4: Video Review Screen & Media Processing Worker

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Aspect-Ratio Preserving Media Transcoding Pipeline**:
   - `services/shared/transcode`: HLS segmenting (4s segments, keyframe alignment), poster generation at 10% duration, hover thumbnail sprite sheet (up to 100 frames) with JSON coordinate map, and 100-point normalized audio waveform generator.
   - Dynamic dimension scaling (`CalculateDimensions`): short side is scaled to 720 or 1080 without forcing 16:9 boxes. Fully tested for 9:16 vertical video (1080x1920 -> 720x1280), 1:1 square (1080x1080 -> 720x720), 4:5 social (1080x1350 -> 720x900), and sub-1080 sources.
   - 1080p variant only generated when source short side is $\ge 1080$ (`ShouldGenerate1080p`).
   - Resilient handling of silent videos (without audio track failures) and audio-only files (waveform visualization + player).

2. **Concurrency-Limited Background Processing Worker**:
   - `services/worker`: Concurrent video jobs limited to at most 2 video processes at once via channel semaphore.
   - Streams source media from S3/R2 storage to temporary local disk, transcodes previews, uploads artifacts under `previews/{company_id}/{version_id}/...`, updates `file_versions.preview_status = 'ready'`, and guarantees temp file cleanup in `defer`.

3. **Secure View vs Download Fallback Enforcement**:
   - `services/api/internal/handler/storage_uploads.go`: When `preview_status != 'ready'`, inline playback of the original file is allowed ONLY for users with `CanDownload = true`.
   - View-only users without download permission receive HTTP 425 Too Early (`"Processing, ready in a few minutes"`) and cannot extract the raw original file bytes.

4. **HLS Playlist Proxy & Silent 403 Reload**:
   - `ReviewHandler.PlaylistProxy`: Proxies both master (`playlist.m3u8`) and variant playlists (`720p.m3u8`, `1080p.m3u8`). Rewrites `.ts` segment lines with 2-hour presigned R2 URLs.
   - `hls.js` integration in `video-player.tsx`: Catches HTTP 403 on expired segment requests and quietly triggers `hls.loadSource(playlistUrl)` so long-paused videos resume without error.

5. **Role-Agnostic Comment Permissions**:
   - Commenting, replying, and resolving are permitted for `Commenter`, `Uploader`, and `Full` access (no role name hardcoding).
   - Comment editing is restricted to author only.
   - Comment deletion is permitted for author or anyone holding Full access.

6. **Review Approvals & Automatic Version Reset**:
   - Team members with Full access and Client contacts with Commenter+ can submit review decisions (`approved` or `changes_requested`).
   - Share link visitors can approve only if the link allows commenting and they submit their name and email.
   - Every decision is stored in `reviews` table with author name, email, version ID, decision, and note, displayed in the Details history tab.
   - Uploading a new version automatically resets the item's `review_status` to `needs_review`.

7. **Strict Team-Only Comments Scrubbing**:
   - Server-side filtering everywhere: comments list, replies under team-only parents, comment counters, timeline markers, CSV export, activity feed, and public share links.
   - Client contacts and share link visitors never receive or see team-only comments, replies, or counts, and the Team-Only toggle option is completely hidden from them.

8. **Frame.io-Style Frontend Video Review Workspace (`apps/web`)**:
   - `components/review/video-player.tsx`: Canvas matte black player rendering native aspect ratio, SMPTE timecode/frames/seconds display, J/K/L keyboard jumps, frame stepping via arrow keys, speed (0.5x–2x), loop, quality selector, and metadata strip.
   - `components/review/drawing-overlay.tsx`: Normalized SVG drawing canvas on paused frames (pen, arrow, rectangle, colors).
   - `components/review/timeline-scrubber.tsx`: Waveform audio track, range comment colored bands, author avatar markers, team-only lock icon, hover thumbnail preview tooltip.
   - `components/review/comment-composer.tsx`: Active playhead orange timecode chip, draw toggle, `@mention` list filtered to people with file access, Everyone/Team-only audience dropdown, send button.
   - `components/review/comments-panel.tsx`: Comments tab (All/Unresolved/Resolved filter, timecode sort, threaded comments, inline replies, drawings on frame, team-only yellow styling, resolve checkboxes) and Details tab (decision history, version switcher).
   - `components/review/version-compare.tsx`: Side-by-side synchronized scrubbing mode.
   - Embedded into `file-viewer.tsx` and public share link page `s/[token]/page.tsx`.

9. **Live Polling & Rate Limiting**:
   - 8-second polling ensures comments, resolves, and approval status update across all concurrent viewers without page refresh.
   - Rate limiting protects public comment and review endpoints on share links.

10. **Automated Test Suite**:
    - `services/api/internal/handler/p4_video_review_test.go`:
      1. `Vertical 9:16 video aspect ratio preservation without distortion or black bars` (720x1280, 1080x1920, 1:1, 4:5, sub-1080).
      2. `View-only person without download cannot get original file while processing (HTTP 425)`.
      3. `Client and share link visitor cannot see or create team only comments or replies or counts`.
      4. `New version resets approval to Needs review`.
      5. `Uploader can comment, Viewer cannot comment`.
      6. `Approve and Request changes saved in reviews and returned in history`.

### How to test locally:
1. Run all backend tests: `go test -v ./services/api/... ./services/shared/... ./services/worker/...`
2. Run P4 review tests: `go test -v -run "TestP4VideoReviewAndPermissions|TestP4_AdvisorReviewFixes" ./services/api/internal/handler`
3. Run transcode unit tests: `go test -v ./services/shared/transcode`
4. Run web typecheck: `cd apps/web && npm run typecheck`
5. Test Asynq worker & requeue: `go run ./services/worker/cmd/worker/main.go -requeue` or `make requeue`
6. Run full dev stack: `make dev` (boots postgres, redis, minio, mailpit, api, web, and background worker).

---

### P4 Advisor Review Security & Infrastructure Hardening:
1. **Asynq Worker Wiring**: `services/worker/cmd/worker/main.go` fully wired with Asynq server (concurrency 2, 3 retries) processing `media:process_video_version` and `email:grouped_comment_notification` jobs. `CompleteUpload` and `PublicUploadComplete` enqueue jobs on upload completion. Added `-requeue` CLI flag and `make requeue` to re-queue stuck pending versions.
2. **Unified Public Share Route Resolution**: `ResolvePublicShareLinkAndItem` shared helper validates token, password unlock status, link expiration/disabled state, and item scope. Trashed/deleted items return 404. All public routes (`PublicPlaylistProxy`, `PublicListComments`, `PublicCreateComment`, `PublicSubmitReview`, `PublicExportCommentsCSV`) call this helper.
3. **Protected & Public CSV Export**: `ExportCommentsCSV` enforces `authz.AccessItem` + `CanView()`. Added `PublicExportCommentsCSV` for public share links, strictly filtering out team-only comments.
4. **Scoped Reviews Feed**: `ListReviewsFeed` filters by caller viewable projects and folder/file grants (`authz.AccessItem`). Client contacts only see projects belonging to their client.
5. **Mention Privacy**: `ListMentionable` verifies caller item access, returns only people with view access to the item, and strips emails (`email: ""`) for client contacts and non-team members.
6. **Visitor Identity via Signed Cookies**: Share link visitors must identify through `POST /s/{token}/identify` which sets HMAC-signed `ph_share_visitor_<linkID>`. Typed `visitor_name` / `visitor_email` in requests are not trusted. Approvals require an identified visitor (HTTP 401 without cookie) and save `visitor_id`.
7. **Activity & Grouped Notifications**: Comment, reply, mention, and review decisions create `activity` records, check user notification preferences, and enqueue debounced 5-minute group notification jobs in Asynq. Team-only comments never notify or email clients.
8. **Rotation Handling**: FFprobe rotation metadata in side data/displaymatrix is detected; width and height are swapped before choosing the short side, correctly scaling 1920x1080 rotate 90 source to 720x1280.
9. **Raw Storage Key Protection**: Dropped raw `attachment_key` from client request payloads in comment creation.
10. **Validation on Comments**: `CreateComment` and `PublicCreateComment` verify `version_id` and `parent_id` belong to the target item.
11. **isTeamMember Verification**: Decided via company membership check in database (`queries.GetMembership`), never by role name string matching.
12. **Rate Limiter Memory Management**: Prunes stale keys across `rateLimits` map in `ReviewHandler`.
14. **Asynq Worker Grouped Comment Notifications**: Moved email dispatch out of the HTTP API into `email:grouped_comment_notification` worker task (`services/worker/notifier.go`). Comments created within a 5-minute window are aggregated into a single email per recipient via `asynq.Unique(5*time.Minute)` and `asynq.ProcessIn(5*time.Minute)`. Team-only visibility rules and notification preferences are strictly respected. Tested and verified in `services/worker/notifier_test.go` (5 comments in 5 min -> 1 email per recipient in Mailpit).
15. **Mention Authorization Filtering**: Only mentioned users who have view access to the item (`authz.AccessItem` `CanView() == true`) receive notifications/emails. Mentions of anyone outside the item scope are silently ignored.
16. **Docker Worker Infrastructure (`infra/Dockerfile.worker`)**: Added `playhead-worker` Alpine container to `infra/docker-compose.yml` pre-installed with real `ffmpeg 6.1.1` and `ffprobe`. Runs natively in `make dev` alongside Postgres, Redis, MinIO, and Mailpit.
17. **Real End-to-End Browser Video Review Verification**:
    - Uploaded real horizontal 16:9 MP4 (1280x720, 30fps), vertical 9:16 MP4 (1920x1080 with rotation metadata), and MP3 audio file.
    - All reached `preview_status = 'ready'`; worker transcoded multi-rendition HLS (`master.m3u8`, `720p.m3u8`, `1080p.m3u8`), poster images, thumbnail sprite sheets (`sprite.jpg` + `sprite.json`), and audio waveform (`waveform.json`).
    - Verified in browser: HLS playback, poster display, timeline scrubber with comment markers, and audio waveform.
    - Created point comment, range comment with SVG drawing overlay, team-only comment, and submitted review approval.
    - Verified password-protected share link in browser: password prompt required, unlocks with `SharePassword123!`, team-only comments strictly hidden from visitor, visitor identity prompt recorded, and visitor comment posted and displayed.

---

## Milestone P5: Documents

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Node.js Collaboration Service (`services/collab`)**:
   - Built on `@hocuspocus/server` 4.7.1, `yjs`, `pg`, and `ioredis`.
   - **Authentication Gate**: Connects via WebSocket receiving short-lived collab tickets (60s validity, HMAC-signed). Verifies caller with internal Go API endpoint `/api/internal/collab/verify` using constant-time comparison of `COLLAB_INTERNAL_SECRET`. In production, API and collab service refuse to start if secret is missing or default.
   - **Strict Team-Only Gate (Option 2)**: Non-team users (client contacts, share link visitors) are strictly refused live Yjs connection (`onAuthenticate` rejection). They view sanitized read-only documents polled every 10 seconds via `/view`.
   - **Revocation Listening**: Dual revocation mechanism (5-second fallback poll + Redis Pub/Sub subscriber on `playhead:collab:revocations`) terminates revoked sockets in < 5s.
   - **Postgres Persistence & Sanitized Extraction**: Debounced saves at most every 2s and upon last client disconnect; extracts `content_json`, sanitized `content_json` (stripping all `team_notes`), `plain_text`, `public_plain_text`, word count, character count, and reading time.
2. **Database Migration & SQL Queries (`00008_p5_documents.sql`)**:
   - `documents`: Stores `content_state`, `content_json`, `plain_text`, `public_plain_text`, `word_count`, `character_count`, `reading_time_seconds`.
   - `document_versions`: Historical snapshots with support for named versions and non-destructive restore (restoring never deletes newer versions).
   - `document_assets`: Track uploaded images with `in_team_notes` boolean flag.
3. **Go API Backend Handlers (`services/api/internal/handler/documents.go`)**:
   - Internal verification (`/api/internal/collab/verify`).
   - Collab ticket issuance (`POST /documents/{id}/collab-ticket`).
   - CRUD and listing (`/documents`, `/projects/{id}/documents`, `/documents/{id}`).
   - Sanitized read-only view (`GET /documents/{id}/view`).
   - Title renaming (`PATCH /documents/{id}/title`).
   - S3 presigned image uploads (`POST /documents/{id}/images/presign` and `complete`) with company storage quota checking in transactions.
   - Image access gating (`GET /documents/{id}/images/{imageId}`): checks view access and strictly returns 404 for non-team users if `in_team_notes == true`.
   - Version history & restore (`GET /documents/{id}/versions`, `POST /documents/{id}/restore`, `POST /documents/{id}/versions/{id}/name`).
   - Video card permission preview (`GET /documents/{id}/items/{itemId}/card-preview` and share link variant).
   - Exports (`GET /documents/{id}/export/{format}`: Markdown, Plain Text, Word, JSON).
4. **Frontend Tiptap Editor (`apps/web/src/components/documents` & `/d/[id]`)**:
   - Built with free open-source extensions only (no paid/Pro/cloud dependencies).
   - Custom `TeamNotes` extension with lock badge and yellow callout.
   - Custom `PlayheadVideoCard` extension with access verification, thumbnail, version, review status, and "No access" restricted fallback card.
   - Custom `ResizableImage` extension with alignment controls and resize handles.
   - Floating Table of Contents outline dynamically extracted from H1, H2, H3 headings.
   - Find & replace bar with count and navigation.
   - Page width toggle (816px Letter page vs 100% canvas) and Dark page toggle.
   - Sync status indicator using colored dots and explicit text (`Saved`, `Saving`, `Offline: changes saved on this device` — zero emojis).
   - Client export for Word (.docx via `docx`), Markdown (.md via `turndown`), PDF (via `@media print`), and Plain Text.
   - Offline support via `IndexeddbPersistence` (`playhead-doc-${docId}`) with automatic cleanup on logout.
5. **Dedicated `/documents` Page & Cards**:
   - "Documents" navigation in sidebar under "Projects".
   - Aggregate count banner and client filter chips with document counts.
   - Client isolation: client contacts only see their own client's documents and chips.
   - Physical folded top-right corner document cards with blue `DOC` badge, paper preview snippet, and project metadata.
   - "New document" modal with exact 5 templates: `Blank`, `Brief`, `Script`, `Shot list`, `Creator notes` (from `FEATURES_DOCS_SHEETS.md`).

6. **P5 Advisor Review Hardening & Data Loss Fixes**:
   - **Initial Content Yjs Seeding**: Implemented server-side ProseMirror to Y.Doc conversion via internal collab endpoint `POST /internal/init-document`. Stores binary `content_state` upon template creation and Word docx import. Removed initialContentJson seeding in `useEditor` when collaboration is active, preventing content duplication across concurrent collaborators.
   - **Separate Read-Only Version Preview**: Decoupled version previewing from the live editor by rendering `<ReadOnlyVersionPreview />` (without Collaboration extension) alongside a persistent preview banner. Live collaborative editor state is never touched or overwritten during inspection.
   - **In-Memory CRDT Content Replacement**: Route restore version (`POST /documents/{id}/restore`) and Word import (`POST /documents/{id}/import-docx`) through `POST /internal/replace-content` in the collab service. Content replacement occurs inside `ydoc.transact()` with element deletion, ensuring peers see updates live and reconnecting offline clients with IndexedDB do not resurrect stale content.
   - **Automatic 10-Minute Versions**: Collab service tracks last version timestamp on document store and automatically generates an `"Automatic version"` snapshot when edits occurred and last snapshot is >= 10 minutes old.
   - **Public Plain Text**: Strips `team_notes` and saves clean human-readable plain text into `public_plain_text` (resolving bug where JSON was stringified into this column).
   - **Server-Side Word (.docx) Import**: Converted entirely server-side via `mammoth` in the collab service with a strict 25 MB file size limit.
   - **Instant Access Revocation**: Publishing to Redis channel `playhead:collab:revocations` on grants, roles, company memberships, and project collaborator changes.

### Testing Breakdown (Browser vs Automated):
- **Two-Window Multi-User Browser Tests (Verified End-to-End with Playwright in Chrome)**:
  - `Test 1a (Brief Template Multi-Window Load)`: Created document from Brief template, opened simultaneously in Window A (`admin@idyll.productions`) and Window B (`editor1@idyll.productions`). Verified content appeared exactly ONCE in both windows without duplication (count: 1).
  - `Test 1b (Concurrent Paragraph Editing)`: Window A and Window B typed simultaneously in different paragraphs. Verified both changes merged seamlessly in real time and both persisted.
  - `Test 1c (Live Version Restore)`: Window A had document open. Window B restored a past version. Collab service confirmed in-memory active document was found (`was_live: true`), Window A reflected the restored content live without reloading, and content remained stable after 10 full seconds without reverting.
  - `Test 1d (Live Word .docx Import)`: Window A had document open. Window B imported a .docx document. Collab service confirmed `was_live: true`, and Window A updated live with the imported content without page refresh.
  - `Test 1e (Offline Editing & Reconnect Convergence)`: Window A went offline (DevTools network offline), typed offline changes, Window B restored a clean version, Window A reconnected: no crashes occurred, and the document converged into a sensible, clean restored state.
- **Production Safety Verification**:
  - `docs/DEPLOY_NOTES.md`: Documented reverse proxy rule ensuring public internet only reaches WebSocket path (`wss://collab.playhead.com/*`), strictly blocking `/internal/*` (403 Forbidden). Go API accesses `/internal/*` only over private VPC/network with constant-time secret header.
  - `Collab Production Startup Gate`: Verified collab service immediately refuses to start (`process.exit(1)` and fatal error logged) if `NODE_ENV=production` and `COLLAB_INTERNAL_SECRET` is missing, dev default, or shorter than 32 characters.
- **Automated Tests (`make test`)**:
  - `services/collab/src/__tests__/multi-client-browser.test.ts`: Automated two-window Chrome browser collaboration test verifying 1a through 1e end-to-end.
  - `services/collab/src/__tests__/automatic-versions.test.ts`: Verifies automatic version creation when edits occurred and last version >= 10m old, and suppression when < 10m old.
  - `services/collab/src/__tests__/converter-replace.test.ts`: Verifies Y.Doc binary state generation from ProseMirror JSON, and transactional replace content with node deletion preventing offline client resurrecting old content.
  - `services/collab/src/__tests__/text-extractor.test.ts`: Verifies extraction of plain text and public plain text with `team_notes` stripped.
  - `services/api/internal/handler/p5_documents_test.go`:
    - `TestCollabTicketSecurity`: Verifies HMAC ticket issuance, 60s expiration, tampering prevention, and cross-document rejection.
    - `TestStripTeamNotesSanitization`: Verifies server-side team notes removal.
    - `TestCollabVerifyConstantTimeSecret`: Verifies constant-time secret comparison.
    - `TestP5DocumentsIntegration`: Full integration of documents CRUD, permissions, and image isolation.
    - `TestAdvisorReviewTemplatesAndPlainText`: Verifies exact 5 templates and plain text output.
    - `TestDocxImportFileSizeLimit`: Verifies 25MB file size limit enforcement on Word imports.

### How to test locally:
1. Run all tests: `make test`
   - Go backend tests: `go test -v ./services/api/... ./services/shared/... ./services/worker/...`
   - P5 Documents unit & integration tests: `go test -v -run "TestCollab|TestStripTeamNotes|TestAdvisor" ./services/api/internal/handler`
   - Collab service tests & multi-user browser suite: `cd services/collab && npm test && npm run build`
   - Frontend type check: `cd apps/web && npm run typecheck`
2. Run development stack: `make dev` (starts postgres, redis, minio, mailpit, worker, api on :8080, collab on :8082, web on :3000).

---

## Milestone P6: Spreadsheets and Tracker

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Route & Page Infrastructure**:
   - Spreadsheets accessible via `/sheet/[id]` for the spreadsheet editor and `/spreadsheets` for company-wide list.
   - Dedicated "Spreadsheets" item in the sidebar navigation with project and client filters.
2. **Database Migration & Storage Model**:
   - Migration `00009_spreadsheets.sql` defining `spreadsheets`, `spreadsheet_versions`, and `spreadsheet_comments`.
   - Sqlc queries in `db/queries/p6_spreadsheets.sql` with type-safe Go handlers.
   - Project integration: Added `tracker_item_id` to `projects` table. Creating a project automatically creates a default "Tracker" spreadsheet.
3. **Stable-ID Yjs CRDT Data Model**:
   - Avoids row/column index drift by assigning stable row IDs (`r_xxx`) and column IDs (`c_xxx`).
   - Row and column ordering stored in `Y.Array<string>`, cells stored in `Y.Map<string, any>` keyed by `rowId:colId`.
   - Column locks and hidden states stored in `Y.Map<string, any>` keyed by column ID, remaining permanently attached when columns move.
4. **Client Contact Sanitization (Zero Live Yjs Connection)**:
   - Client contacts are strictly refused at WebSocket authentication (`onAuthenticate`).
   - Clients interact with spreadsheets through a server-sanitized view (`GET /api/v1/spreadsheets/{id}/view`, polled every 5s) where hidden columns are stripped server-side.
   - Client cell updates are submitted via `POST /api/v1/spreadsheets/{id}/cells`, validating column lock and hidden status before forwarding to the collab service to apply directly into the live `Y.Doc`.
5. **Formula Engine & Real High-Performance Benchmark**:
   - Strict open-source licensing: HyperFormula excluded; uses MIT-licensed `@formulajs/formulajs` and FortuneSheet native calculation engine.
   - Real 10,000 rows x 50 columns benchmark in Chrome browser: Fully loaded and interactive in **0.92s – 1.38s**.
6. **Feature Parity, Tracker Columns & Custom Cells**:
   - Tracker sheet: Exactly 7 columns (`Video`, `File`, `Editor`, `Status`, `Due date`, `Revisions`, `Notes`).
   - Custom cell rendering: Status chip dropdown with 6 colors (`Not started`, `Editing`, `Needs review`, `Changes requested`, `Approved`, `Delivered`), Person cell (project members with photo/avatar), File link cell (video play badge, version, review status, "No access" access guard), Date picker popup.
   - Server-side Excel (`.xlsx`) and CSV import via `exceljs` with a 25MB file size limit.
   - Client multi-sheet editing with active sheet scoping and 403 locked column enforcement.

### Testing Breakdown (Browser vs Automated):
- **Automated Chrome Browser Tests (`multi-client-spreadsheet.test.ts`)**:
  - `Proof 4a (Two-Window Live Sync)`: Window A typed in live Y.Doc; Window B saw update within 2 seconds.
  - `Proof 4b (Refresh Persistence)`: Refreshed both windows; all data loaded cleanly from Y.Doc.
  - `Proof 4c (Concurrent Row Insert)`: Window A inserted row at top while Window B edited below; B's cell remained bound to its stable row ID without data corruption.
  - `Proof 5 (Client Multi-Sheet & Column Locking)`: Verified client contact can edit unlocked cells across sheets; editing a locked column is strictly refused with HTTP 403.
  - `Proof 6 (Real 10k x 50 Load Time)`: Measured real load time in Chrome: **0.92s – 1.38s**.
  - `Proof 7 (Feature Capabilities Audit in Browser)`:
    - Conditional formatting: Working natively
    - Data validation: Working natively
    - Checkboxes: Working natively
    - Date picker: Custom built (floating date input popup; FortuneSheet lacks native calendar popup)
    - Group rows: Not supported (FortuneSheet lacks collapsible row grouping)
    - Fill handle: Working natively
    - Paste from Excel / Google Sheets: Working natively
    - Freeze: Working natively
    - Sort and filter: Working natively
- **Automated Backend & CRDT Tests (`make test`)**:
  - `p6_spreadsheets_test.go`: Column locking, hidden sanitization, auto-tracker creation with 7 columns.
  - `spreadsheet-converter.test.ts`: Stable-ID CRDT row/column convergence, CSV & Excel import.

### How to test locally:
1. Run all tests: `make test`
   - Go backend tests: `go test -v ./services/api/... ./services/shared/...`
   - Collab CRDT & browser tests: `cd services/collab && npm test`
2. Run development stack: `make dev`

---

## Design & Layout Cleanup Pass

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Layout & Single AppShell**:
   - Removed nested `<AppShell>` wrappers in `apps/web/src/app/documents/page.tsx` and `apps/web/src/app/spreadsheets/page.tsx` eliminating duplicate sidebars and headers.
2. **Top Bar / Header (Spec Section 5.2)**:
   - Replaced static placeholder title and button with dynamic breadcrumbs based on active route.
   - Restricted `"Welcome back, {name}"` strictly to the Home screen (`/`).
   - Integrated upload progress icon, notification bell, and user avatar with real initials.
   - Created custom dark 404 page (`apps/web/src/app/not-found.tsx`) with proper "Page Not Found" title.
3. **Sidebar Navigation (Spec Section 5.1)**:
   - Built full `+ New` dropdown menu: Client, Project, Folder, Upload files, Upload folder, Document, Spreadsheet.
   - Added Admin storage bar showing bytes used vs limit with real-time percentage progress.
   - Added user profile card displaying real user display name, email, role badge, and sign-out dropdown.
4. **Design System & Visual Tokens**:
   - Switched entire application font to **Plus Jakarta Sans** via `next/font/google` in `layout.tsx`.
   - Eliminated all white inputs; enforced background `#2A2B30`, border `#2E2F34`, text white, placeholder `#7C7F87`, focus border `#4876F3`, and 10px radius (`rounded-[10px]`).
   - Removed all 26 occurrences of `backdrop-blur`; modal overlays now use plain black 60% opacity (`bg-black/60`).
   - Modal panels standardized to `#212121`, border `#2E2F34`, and 16px radius (`rounded-2xl`).
   - Option cards styled in `#2A2B30` with border `#2E2F34`; active selection highlights in `#4876F3` with blue tint.
   - All dropdown selects now hide browser default arrows (`appearance-none`) and display a custom 14px `ChevronDown` placed 12px from right with 36px right padding.
   - Created reusable searchable `<ProjectSelect />` component grouping projects by client.
   - Replaced all emojis (e.g. 🔒, ✕, ✓) with Lucide SVG icons.
5. **Spreadsheets Reliability & Error States**:
   - Fixed `/spreadsheets` loading state lifecycle to prevent infinite loading.
   - Added error state with "Try again" retry button and clean empty state.
   - Ensured backend `ListSpreadsheets` returns empty array `[]` instead of null.

---

## Part B & Part C: UI Polish, Unified Menus, and Fast Subtle Animations

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Unified Menu & Select Architecture (`@floating-ui/react`)**:
   - Reusable `<Menu>` and `<Select>` components matching Playhead dark tokens (`#212121`, `#2E2F34`, 10px radius).
   - Viewport boundary detection with automatic flipping, shifting, and scroll containment.
   - Built-in search filtering when options exceed 8 items.
   - Mobile responsive bottom sheets on viewports < 640px.
2. **Context Menu System (Right-Click & Touch Long-Press)**:
   - `<ContextMenuProvider>` providing unified context menus across all devices.
   - Empty workspace right-click menu: New folder, Upload files, Upload folder, New document, New spreadsheet.
   - Item right-click & `⋯` button: Open, Open in new tab, Share, Copy link, Download, Rename, Move to, Star/Unstar, Delete.
   - Multi-selection right-click: Share, Copy link, Download (ZIP), Move to, Delete.
   - Mobile/tablet touch long-press (500ms) with bottom-sheet actions.
3. **Frame.io-Style New Project Dialog**:
   - 2-column layout: Left column with template cards (Video project & Blank project) featuring `#4876F3` active state; Right column with project name, client Select with search, "+ Create New Client", and People assignment.
   - Real setup progress step inside the dialog with checkmarks ("Creating folders" ✓, "Creating Tracker" ✓) before smooth transition to project workspace.
4. **Unified Toast System with Undo**:
   - Zustand store managing notifications with max 3 items, 5s duration, pause on hover.
   - Desktop bottom-right and mobile bottom-center placement.
   - Interactive Undo button supporting optimistic delete and restore.
5. **Create & Change Animations (Framer Motion)**:
   - Standard 150ms to 250ms durations with `easeOut` curves; closes faster than opens (`easeIn`).
   - Full support for `prefers-reduced-motion` (instant 0ms when reduced motion is preferred).
   - New folder appears in-place with name in edit mode; Enter saves, Escape cancels.
   - Inline rename on cards with Enter save and Escape cancel.
   - Folders enter with 30ms stagger on workspace load.
   - Uploads display live progress cards inside the grid, fading smoothly into final item cards.
   - Delete and move fade and slide out smoothly with layout reorganization and Undo toast; Undo brings item back with reverse animation.
   - New document and spreadsheet creation highlights new card with soft blue glow (`ring-2 ring-[#4876F3] shadow-[0_0_24px_rgba(72,118,243,0.35)]`) for 1 second, then editor opens with title focused and pre-selected.

---

## Two Fixes: Frame.io Parity Pass

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **PART 1: Redesigned New Project Dialog (`08-new-project.png` Frame.io Look)**:
   - **Header**: Clean "New project" title (18px, 600 weight) with close X. Removed sparkle icon and uppercase headings/descriptions.
   - **Calm Typography & Disabled State**: Labels 13px `#A3A6AD`, body 14px, card titles 15px. No red asterisks. Create project button disabled with 40% opacity until both project name and client are provided.
   - **Left Column ("Start with")**:
     - Video project card (selected by default, `#4876F3` border, light blue tint, check circle, 4 folder chips: "Briefs", "Raw footage", "Edits", "Deliverables").
     - Blank project card with clean icon tile and description.
   - **Right Column (Preview Card & People)**:
     - Preview card (`#181818`, border `#2E2F34`, 12px radius) with dashed "Add cover (optional)" area on top and 17px project name input inside the card under it with autofocus.
     - Searchable Client dropdown with client letter initial badges and "+ Create new client" action button.
     - People section with email search/add input. When none added, shows no empty box, only calm grey line: *"Admins and Managers always have access."*
   - **Footer**:
     - Left hint: *"Creates 4 folders and a Tracker sheet"* (for Video project) or blank.
     - Right: Cancel button and Create project button (`#3B67E0`, disabled = 40% opacity).

2. **PART 2: Documents and Spreadsheets Never Need a Project (Unprojected Items)**:
   - **Database & Architecture**:
     - Migration `00011_unprojected_items.sql` making `items.project_id` nullable.
     - Unprojected items stored with `project_id IS NULL`, displaying under `"My documents"`.
   - **Privacy & Security**:
     - Unprojected documents and spreadsheets are strictly private to the creator.
     - Enforced in `authz.AccessItem`: creator gets `LevelFull`; explicit item grants are checked; admins/owners and other team members are refused with 403/404 unless explicitly granted access.
     - Tested in `services/api/internal/handler/unprojected_items_test.go` proving creator access, admin denial, and explicit grant sharing.
   - **Unified Location Picker**:
     - Replaced required "Project" field with optional "Location" picker in `<NewDocumentDialog />`, `<NewSpreadsheetDialog />`, Documents library page, and Spreadsheets library page.
     - Defaults to `"My documents (private to me)"` when created globally or from the `+ New` sidebar menu; preselects the active project when opened from within a project workspace.
   - **Standardized Templates**:
     - Documents: Blank, Brief, Script, Shot list, Creator notes.
     - Spreadsheets: Blank, Tracker, Creator payments, Budget, Shot schedule.

---

## Step 0: Auth Resolution, Dev Admin Seeding & Explicit Error Handling

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Dev Admin Seeding & Multi-Admin Support**:
   - Added `DEV_ADMIN_EMAILS` configuration in `config.go` (comma-separated, default `"harsh@idyllproductions.com"`).
   - In `dev_seed.go`: looked up admin role strictly by `name = 'Admin'` (removed `OR is_system = true`).
   - Ensured all configured dev admin emails are verified Admins of Idyll Productions with full permissions.
2. **Security Hardening**:
   - Removed permanent `"dev-harsh-token"` session insertion and purged existing token from database.
   - Changed default `Environment` in `config.go` to `"production"` when unset.
   - Added `POST /api/v1/auth/dev-login`: strictly enabled only when `ENV=development` and request originates from localhost (`127.0.0.1`, `::1`, or `localhost`).
3. **Explicit Client Contact Resolution (`/me`)**:
   - Updated `/api/v1/auth/me` so signed-in users with no company membership never become clients silently.
   - `is_client` is strictly true only if the user's email is explicitly registered in `client_contacts`.
   - If an account has no company membership and is not a client contact, returns `active_company: null`, `active_role: ""`, `is_client: false`.
   - Frontend pages (`/`, `/projects`, `/documents`, `/spreadsheets`) display: *"Your account isn't part of a team yet. Ask an Admin to invite you."*
4. **Plain-English Real Error Display (Toasts)**:
   - Enhanced `apps/web/src/lib/api.ts` `ApiError` class and `formatServerErrorMessage` helper.
   - Extracts plain-English reasons (e.g. *"You're not on the team yet"*, *"No permission for this project"*, *"Database not up to date, run migrations"*).
   - Added `onError` toast handlers to folder creation, renaming, moving, single delete, and batch actions in `apps/web/src/app/projects/[id]/page.tsx`.
   - Added error toasts to document creation dialog and spreadsheet creation.
5. **Startup Migration Verification**:
   - Added `checkMigrations(ctx, pool)` in `cmd/server/main.go` checking `goose_db_version` against migration files on startup.
   - Prints clear terminal warning `⚠️  Database is behind: run make migrate` if migrations are missing.
6. **Dev Account Badge & Cache Invalidation**:
   - Added dev-only session badge in sidebar account popup showing email and role.
   - Implemented `clearAuthCache(queryClient)` invoked on code login, password login, and sign out.
7. **Google OAuth Security Hardening (Code Flow & Token Verification)**:
   - Eliminated spoofing vulnerability where query parameters `?email=...&email_verified=true` could grant login without Google authorization.
   - Added real OAuth 2.0 code exchange with Google token endpoint using `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - Verified ID token cryptographic claims via Google tokeninfo endpoint (audience matching client ID, issuer, expiry, and email verification).
   - Enforced short-lived `google_oauth_state` cookie (10 minutes) to prevent CSRF / login forgery.
   - Returns 404 Not Found if `GOOGLE_CLIENT_ID` is empty.
   - Rigorous unit tests proving forged `?email=...&email_verified=true`, invalid state, and missing client ID are refused.
8. **Signed-Out Session Protection & App Skeleton**:
   - Resolved bug where signed-out visitors navigating directly to `/projects`, `/documents`, or `/` saw empty app shells and "User" placeholders.
   - Protected all internal app routes: while session is verified, `AppShell` displays a dedicated dark `AppSkeleton`.
   - If `/me` returns 401 or user is not logged in, redirects immediately to `/login?redirect=...`.
   - On sign-in (via email code or password), redirects user back to their requested page.
   - `apiRequest` intercepts 401 responses on protected pages with a "You've been signed out" toast.
   - Sidebar, header, and rail now show the user's real name and email, never "User" or "PH" placeholders.
   - Added Playwright smoke test `tests/auth-session.test.ts` verifying `/projects`, `/documents`, and `/` redirect to `/login` when signed out, and that an Admin sees "+ New Project" after sign in.

---

## Step 1 & Pages 1-3: Real Data, Authentication, My Drive & Home

### Status: Completed ✅ (Verified end-to-end with real backend, Go tests, and Playwright smoke tests)

### What was built:
1. **Zero Mockup Data & Design System Enforcement**:
   - Eliminated all hardcoded mockup names (Everygen, Jada, Bri, Truvani, Pizza Hut) and sample statistics ("38.5 GB", "480 Files", fake percentages) across all pages and cards.
   - Removed `/cards-preview` dev route.
   - Removed hardcoded "6" badge in sidebar reviews count; now reflects real review items count from `/api/v1/reviews` and hides when count is 0.
   - Updated `project-card.tsx` and `document-card.tsx` to display real client names, or fallback to "My Drive" (for drive items) or nothing.
   - Upgraded `scripts/check-design-tokens.js` with strict mockup sample data scan: fails CI/lint if any mockup sample names or numbers appear.
   - Documented all 131 allowed hex color exceptions with reasons in `docs/HEX_COLOR_EXCEPTIONS.md`.
2. **Strict Storage Quota Gate**:
   - Only the `internal` plan has unlimited storage.
   - For all other plans, `storage_limit_bytes = 0` (or `storage_limit_bytes <= storage_used_bytes`) strictly refuses uploads with `quota_exceeded`.
   - Verified with unit tests in `storage_uploads_test.go` and `documents_test.go`.
3. **Page 1: Login (P01, P02)**:
   - Full fidelity matching `Playhead UI/Pages/P01 Login.svg` and `P02 Check email code.svg`.
   - Google sign-in click handled gracefully.
   - Email code authentication fully working end-to-end with Mailpit API.
   - Unknown email refusal with friendly invite-only message.
   - Automated Playwright smoke test: `tests/page1-login.test.ts`.
4. **Page 2: My Drive (P06, P07)**:
   - Backend database migration `00012_my_drive_and_recent_items.sql` with `drive_owner_id`, `is_default_folder`, `category` on `items`, and table `recent_items`.
   - Auto-seeding of 4 default folders: Videos, Images, Documents, Music.
   - Strict owner-only access: non-owners, other members, Admins, Viewers, and share link visitors are refused with 403 Forbidden.
   - Default folders protected: cannot be renamed, deleted, or moved.
   - Custom folder lifecycle: create, rename, trash, restore, move to project, deep copy to project (respecting storage quota).
   - Breadcrumb navigation (`My Drive > Folder`), Grid and Table list views.
   - Automated Go tests (`services/api/internal/handler/drive_test.go`) and Playwright smoke test: `tests/page2-mydrive.test.ts`.
   - Captured screenshots: `screenshots/P06_My_Drive_Grid.png` and `screenshots/P07_My_Drive_Folder_List.png`.
5. **Page 3: Home (P03, P04, P05)**:
   - 100% real data from My Drive default folders, `recent_items`, reviews count, and projects.
   - Uploading directly from Home drops files into private My Drive, auto-categorizing into Videos, Images, Documents, or Music based on MIME type.
   - Live upload progress and feedback toast banner.
   - `recent_items` records and displays recently viewed/uploaded files under "Recent folders" / "Recent items".
   - P05 first-time empty state when user has zero projects and zero files:
     - *"Welcome to Playhead, {user.first_name}"*
     - *"Your private My Drive is ready. Upload something or open a project."*
     - *"You haven't been added to a project yet. When an Admin adds you, it shows up here."*
   - Automated Playwright smoke test: `tests/page3-home.test.ts`.
   - Captured screenshots: `screenshots/P03_Home_Real_Data.png`, `screenshots/P04_Home_New_Menu.png`, `screenshots/P05_Home_First_Time_Uploaded.png`.

---

## Upcoming Milestones (Version 2: P7)

- **Milestone P7: Search, notifications, polish**
  - Global search across clients, projects, folders, files, document text, spreadsheet content, and comments.
  - In-app notification bell and email notifications.
  - Client Notes. Performance validation against Section 7 benchmarks. Security audit.
  - **Internal launch for the Idyll team and clients after P7.**






