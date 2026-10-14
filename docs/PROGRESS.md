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
13. **Comprehensive HTTP Test Suite**: Added `TestP4_AdvisorReviewFixes` in `p4_video_review_test.go` verifying password link protection, client CSV export & folder grant review feed scoping, mentionable privacy, visitor approval identification, upload task enqueueing to Asynq, and video rotation scaling.

---

## Upcoming Milestones (Version 2: P5 – P7)

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

