# Architectural & Technical Decisions Log

This document records all decisions not explicitly defined in the spec (`PLAYHEAD_BUILD_SPEC.md`).

---

## 1. Monorepo Organization & Go Workspace
- **Decision**: Use a Go multi-module workspace (`go.work`) at repository root linking `services/shared`, `services/api`, and `services/worker`.
- **Reason**: Enables strict separation between API, worker, and shared domain models while allowing atomic cross-package development and seamless local imports without publishing modules.

## 2. Frontend Package Manager
- **Decision**: Use `npm` for the frontend dependencies.
- **Reason**: Pre-installed on macOS, zero extra global toolchain dependencies required, stable and compatible with all Next.js / TanStack packages.

## 3. Milestone 1 Database Migrations
- **Decision**: Milestone 1 creates only the foundational tables (`users`, `sessions`, `companies`, `memberships`, `invites`).
- **Reason**: Follows incremental milestone build order. Future milestones append their specific tables in new goose migration files; migrations are never modified retroactively.

## 4. Local Development Environment
- **Decision**: Docker Compose manages PostgreSQL 16, Redis 7, MinIO (mocking Cloudflare R2), and Mailpit (mocking Resend).
- **Reason**: Matches the target production engine interfaces exactly while keeping local development 100% offline-capable and isolated.

## 5. Plans Definition
- **Decision**: All tier limits, integer pricing in cents, storage quotas in bytes, and feature gating logic are strictly isolated to `services/shared/plans/plans.go`.
- **Reason**: Enforces the spec hard rule that plans and limits must never be hardcoded elsewhere in the frontend or backend.

## 6. Trial Seat Cap
- **Decision**: During the 14-day free trial, companies can have up to 5 members (`TrialMaxSeats = 5`). Beyond 5 members, an upgrade prompt is displayed.
- **Reason**: Balances early team collaboration testing for creative agencies during trials while preventing trial abuse.

## 7. Email Verification Before Company Creation
- **Decision**: Users must verify their email address before being permitted to create a company or start a trial.
- **Reason**: Prevents spam company registrations, ghost organizations, and unverified accounts reserving storage quotas.

## 8. Rate Limiting and CSRF Protection
- **Decision**: Auth endpoints (`login`, `signup`, `forgot-password`, `reset-password`) are strictly rate limited via Redis to 5 attempts per 15 minutes per IP address and per email address. Cookie-based mutating requests require double-submit `X-CSRF-Token` headers.
- **Reason**: Enforces Spec Section 14 security rules against credential stuffing, brute-force attempts, and cross-site request forgery.

## 9. Invite Acceptance Rules
- **Decision**: Team invites expire after 7 days and can only be accepted by an authenticated account matching the exact email to which the invite was sent.
- **Reason**: Prevents forwarded links from granting unauthorized project and company workspace access to arbitrary accounts.

## 10. Optional Google OAuth Configuration
- **Decision**: Google OAuth is fully wired into backend and frontend but conditionally rendered on the UI only when `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is present.
- **Reason**: Allows seamless out-of-the-box local development with email/password while making Google SSO a zero-code-change drop-in when credentials are provided.

---

## 11. Version 2 Internal Workspace Roles Model
- **Decision**: In `00003_p1_roles_clients_projects.sql`, roles are strictly migrated to `admin`, `manager`, and `editor` (replacing legacy `member`/`guest`). `owner` is maintained as the highest privilege company role equivalent to `admin`.
- **Reason**: Aligns with Section 13 (Milestone P1) and Section 2.1 of `docs/PLAYHEAD_SPEC_V2.md`. Editors only see projects explicitly assigned to them.

## 12. Passwordless 6-Digit Email Code Sign-In & Closed Signups
- **Decision**: Public signups (`/signup`) are replaced by a closed workspace notice directing users to contact their workspace admin. Sign-in supports both existing passwords and 6-digit email codes (`/auth/login-code/send` and `/auth/login-code/verify`) delivered via Mailpit/Resend. Unregistered emails receive a friendly notice: *"This email doesn't have access to Playhead yet. Ask the person who invited you."*
- **Reason**: Enforces the internal agency workspace model. Codes are hashed with SHA-256 in PostgreSQL and expire in 10 minutes with rate limiting.

## 13. Centralized Authorization Engine (`authz.Access`)
- **Decision**: Implemented `authz.Access(person, project)` returning `{Level, CanDownload}` in `services/shared/authz/authz.go`. All project queries and handlers pass through this single source of truth.
- **Reason**: Combining team role (Admin/Manager = Full Access), project grants, and client contact defaults ("Access to all projects" above None) in one central package prevents fragmented role checks. Adding/editing/removing people on projects is restricted to Admins, Managers, and Full Access grantees.

## 14. Client Users & Company Context Fallback
- **Decision**: Client contacts and external users with direct project grants but no internal company membership record automatically receive the active company context upon sign-in from their earliest client contact or project grant.
- **Reason**: Client users are presented with a streamlined client view (Home, Projects, Shared with me, Starred, Trash; hiding internal-only pages like Clients, Team, and Storage quotas, and suppressing "+ New" unless granted Uploader or Full access).

## 15. Case-Insensitive Lowercase Email Normalization
- **Decision**: All emails ingested across users, client contacts, project grants, and login codes are trimmed and converted to lowercase via Go's `authz.NormalizeEmail()` before persistence and lookup.
- **Reason**: Prevents case-mismatch access denial (e.g. `Harsh@Example.com` vs `harsh@example.com`) across invitations, contacts, and sign-ins.

## 16. P1 Plain Text Client Notes
- **Decision**: Client `notes` is modeled as a text field in `clients` table and client detail page.
- **Reason**: Per user clarification, Notes is a plain text field in Milestone P1, and will be evolved into a full collaborative document in Milestone P5.

## 17. Pay-As-You-Go Internal Storage Plan & Quota Reservation Lifecycle
- **Decision**: Added an `internal` plan in `plans.go` with no storage limit, no seat limit, and no trial expiration, moving Idyll Productions to it in migration `00004`. Implemented integer byte storage tracking across all versions and Trash until permanently deleted. Added upload bytes reservation (`storage_reserved_bytes` on `companies`) on initiate, committing to `storage_used_bytes` on complete and releasing on abort. Configured an hourly background cleanup job aborting expired pending uploads (> 24 hours). Added Admin storage dashboard tracking client/project breakdowns and estimated cost based on `STORAGE_PRICE_PER_GB` (default 0.015 USD), plus automated admin threshold alerts via `STORAGE_ALERT_GB` (default 1000 GB, alerting every further 500 GB).
- **Reason**: Guarantees zero out-of-quota lockouts for the internal studio workspace while maintaining strict byte-for-byte cost visibility, storage reservation isolation, and automated leak prevention.

## 18. Notification Settings & Preference Hierarchy (Built in P3)
- **Decision**: Added specification for user notification preferences and per-project notification bells to Section 6.15 of `docs/PLAYHEAD_SPEC_V2.md`. Implementation is scheduled for Milestone P3 (when sharing and event notifications start). Features:
  - Settings > Notifications page with per-event rows and dual toggles (**In app** and **Email**), defaulting to all ON except Email for "new version uploaded" (OFF), with email choice between instant and daily summary.
  - Project header bell with three levels: "All activity", "Only mentions and my files" (default), and "Off" (preserving direct mentions).
  - Strict two-layer preference check before dispatching any notification, with mandatory footer link to settings on all email dispatches.
  - Backed by `notification_prefs(user_id, event_type, in_app, email)` and `project_notification_prefs(user_id, project_id, level)`.
- **Reason**: Ensures notifications respect both global user desire and granular project focus without alert fatigue.

## 19. Browser-Based Direct-to-Storage Downloads (No Size Limit)
- **Decision**: Removed server-side zip streaming and background zip jobs completely. All folder and multi-file downloads now execute entirely in the browser directly from storage presigned URLs:
  - **Default in all browsers**: One zip file built in the browser using `client-zip` (MIT licensed, store mode / no compression). Streams file data directly to disk without loading entire folders into memory, supporting archives of any size.
  - **Chrome & Edge option**: Offers "Download into a folder" in the Download menu using the File System Access API (`showDirectoryPicker`), saving every file directly into the user's chosen folder and preserving full subfolder structure.
  - **Download Tray & Concurrency**: Downloads run 3 files in parallel using presigned GET URLs, with progress shown in a floating Download Tray (per file and overall progress, pause, cancel).
  - **API Role**: The API (`/api/v1/downloads/prepare`) strictly verifies permissions and returns the file manifest with presigned URLs. If ANY item has `can_download == false`, the entire download is refused with 403. This same mechanism applies to share link visitors.
- **Reason**: Eliminates server CPU, bandwidth, and memory bottlenecks for multi-gigabyte downloads and guarantees zero file bytes ever pass through the API server for uploads or downloads.

## 20. Strict Design System Compliance & Milestone Screenshots
- **Decision**: Strict UI rule across every milestone: all UI must match `design/01-project-folder-view.svg` (and `.png`), `Dashboard.svg`, and design tokens. Absolutely no gradients, glows, emojis, or placeholder text. After each milestone, screenshots of newly implemented screens must be saved in `docs/screenshots/<milestone>/`. In Milestone P3, the P2 project workspace must be refined to match `01-project-folder-view.svg` pixel-for-pixel.
- **Reason**: Ensures an ultra-clean, studio-grade aesthetic without visual noise, drift, or unbranded fluff.

## 21. Distinct Card Shapes Across the Entire Application
- **Decision**: All asset and container cards everywhere in Playhead must use physical silhouette styling:
  - **Folders**: Tab silhouette on top, 1 large preview on left, 2 small stacked previews on right.
  - **Documents**: Page silhouette with folded top-right corner, paper-style text preview, and blue `DOC` badge.
  - **Spreadsheets**: Dark grid preview with green header row, colored status cells, green `SHEET` badge, and physical sheet tabs hanging beneath the bottom card edge (e.g. `[Tracker]`, `[Payments | Summary]`).
  - **Metadata**: Every card displays name, project, last editor & relative time ("Rik · 20m ago"), and collaborator avatars.
- **Reason**: Provides immediate visual recognition and tactile feedback across all files and workspaces.

## 22. Dedicated Top-Level Pages for Documents & Spreadsheets (P5 & P6)
- **Decision**: Main sidebar menu will include "Documents" and "Spreadsheets" directly beneath "Projects", hidden until Milestones P5 and P6 respectively. Each page features aggregate count banners ("14 documents across 4 clients"), "New document" / "New spreadsheet" primary actions, search, Client/Project/Owner dropdowns, sort, grid/list toggle, and client filter chips ("All clients", "Everygen 5"). When "All clients" is active, cards are grouped with client logo, name, and count as section headings.
- **Reason**: Enables studio-wide discovery and management of scripts, briefs, budgets, and trackers across all projects.

## 23. Video Review Screen Architecture (P4)
- **Decision**: Video player screen follows a dedicated 3-column / fixed-header layout:
  - **Top Bar**: Back navigation, breadcrumb, file name, version dropdown (`v3`), status chip (`Needs review`), item counter (`1 of N` with arrows), `Request changes` (red outline), `Approve` (green button), `Share`, `Copy link`, and collaborator avatars.
  - **Left / Center**: Player area in true video aspect ratio, timeline with comment avatars at precise timecodes, range comments as colored bands, team-only lock badges, playback controls (play, loop, speed, volume, central timecode with format dropdown, HD, markers toggle, version comparison, fullscreen), and asset metadata row (uploader, date, resolution, fps, size).
  - **Right Panel**: Tabs for `Comments (count)` and `Details`. Threaded comments with orange timecode chips (click to jump), drawing overlays, resolve circles (green tick), and yellow background + lock badge for team-only comments (never sent to clients). Bottom composer with orange timecode chip, draw, attach, mention, and audience dropdown (`Everyone` / `Team only`).
- **Reason**: Delivers frame-accurate, professional video collaboration matching Frame.io/Filestage studio standards.

## 24. Documents Engine & Feature Scope (P5)
- **Decision**: Documents feature set strictly delimited in `docs/FEATURES_DOCS_SHEETS.md`:
  - **Build in P5**: Typography (Title, H1-H3), formatting, indent lists, checklists, rich tables, images, hyperlinks & Playhead file links, find/replace, slash menu (`/`), markdown shortcuts, outline panel, word count/reading time, live Yjs collaborative editing with cursors, version history with restore, embedded Playhead video cards, templates (brief, script, shot list, creator notes), server-scrubbed team-only notes block, export (PDF, Word, Markdown), import Word, print styling, page vs full-width view, dark page mode, offline editing with sync.
  - **Deferred (Do NOT build in P5)**: In-line text comments, text `@mentions`, and suggest/track-changes mode.
- **Reason**: Focuses P5 on world-class document creation, templates, and video embedding while keeping comment systems focused on the review player.

## 25. Spreadsheet Engine & Formula Scope (P6)
- **Decision**: Spreadsheets feature set strictly delimited in `docs/FEATURES_DOCS_SHEETS.md`:
  - **Build in P6**: Google Sheets-like grid editing, rows/cols insert/delete/resize/hide/group, copy-paste from Excel/Sheets with formatting, fill handle, freeze rows/cols, merge cells, undo/redo, find/replace, multi-sheet tabs (rename, reorder, color, duplicate, hide, delete), cell styling, fill colors & borders, number formats (currency, percent, dates), conditional formatting, colored dropdowns, checkboxes, date pickers, person cells with photo, Playhead file link cells with thumbnail/status, core formula engine (30+ formulas: `SUM`, `AVERAGE`, `COUNT`, `IF`, `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `UNIQUE`, `SORT`, `FILTER`, etc.), cross-sheet references, formula help, live collaboration with colored active cells, cell comments with mentions & resolve, version history, client column locking, templates (Tracker, Creator payments, Budget, Shot schedule), Excel/CSV import/export, and PDF print.
  - **Deferred (Do NOT build in P6)**: Charts/graphs, pivot tables, auto-status webhooks, and Kanban board view.
- **Reason**: Delivers maximum studio utility for production tracking, budgets, and payments without bloat.

## 26. Unified Email Service, 5-Minute Aggregation & Custom Roles RBAC Engine (P3)
- **Decision**:
  - **Email Service**: All outbound emails routed through `services/shared/email` (Mailpit locally, Resend in prod) with Playhead branding, single CTA button, and notification settings footer links. Implemented 5-minute comment debouncing/aggregation per file in the background worker. Documented all emails in `docs/EMAILS.md`.
  - **Notification Settings (P3)**: Settings > Notifications dual toggles (In app / Email) across all events, plus project header bell buttons (`All activity`, `Only mentions and my files`, `Off`).
  - **Custom Roles RBAC Engine (P3)**: Added `roles(id, company_id, name, color, permissions jsonb, is_system)` table. System role `Admin` is immutable and company must retain at least one Admin. `Manager` and `Editor` become editable starter roles. Added 17 granular permissions (`clients.*`, `projects.*`, `files.*`, `sharing.*`, `team.*`, `admin.*`). Refactored `authz` to evaluate permissions rather than raw role names. Team page gets a dedicated Roles management tab.

## 27. Advisor Security Hardening & Strict Tenant Boundary Enforcement (P3)
- **Decision**:
  - **Company Context Verification**: `middleware/auth.go` resolves active company by verifying that the authenticated user is an active member, client contact, or explicit grant recipient in the company before accepting `X-Company-ID` or `?company_id=`. Unverified companies return 403 Forbidden.
  - **URL vs Context Alignment**: Team management endpoints (`companies.go`, `invites.go`) reject requests with 403 if the `{company_id}` in the URL does not match the caller's verified active company context. Client contacts without company memberships cannot list team members.
  - **Role Safety & Self-Modification**: `UpdateMemberRole` restricts assignable roles to `admin`, `manager`, or `editor` (or custom roles from `roles`), explicitly rejecting `owner`, `member`, or `guest`. Users cannot modify their own role. The last Admin in a workspace cannot be demoted or deleted.
  - **Scoped Trash Access**: Non-admin/manager users can only view trash items in projects where they hold `Uploader` or `Full` access. Restoring requires `Full` access, or being the item uploader or deleter. Permanent deletion remains restricted to Admins and the original uploader.
  - **Viewing vs Downloading Separation**: Split media access into `/view` (short-lived 15m presigned URL with `Content-Disposition: inline`) and `/download` (attachment gated strictly by `CanDownload`). File viewers use `/view`, and download buttons are completely hidden when `CanDownload` is false.
  - **Upload Ownership Guard**: Resumable multipart upload endpoints (`GetUploadParts`, `CompleteUpload`, `AbortUpload`) verify `uploads.user_id == current_user.id`, returning 404 for unowned uploads.
- **Reason**: Closes all potential cross-tenant leakage, escalation of privilege, download restriction bypasses, and unauthorized upload manipulation.

## 28. Advisor Audit Review 2: Share Link Tokens, Link Limits, Scoped Grants & RBAC (P3)
- **Decision**:
  - **Signed Share Link Unlock Cookies**: Replaced plain "unlocked" cookie with cryptographic HMAC signature: `HMAC(SESSION_SECRET, link_id + ":" + password_version + ":" + expiry)`. The cookie is scoped per link (`ph_share_unlock_<link_id>`), is `HttpOnly`, `SameSite=Lax`, and `Secure` in production with a 12-hour expiry. Every public request verifies signature, link ID, password version, and expiry. Modifying or clearing the password increments `password_version`, instantaneously invalidating all active visitor cookies.
  - **Atomic Total Link Upload Limits**: Share links enforce the total cumulative upload limit (`uploaded_bytes + upload_reserved_bytes + size_bytes <= upload_limit_bytes`) inside a single atomic database statement (`ReserveShareLinkUpload`). Reserved bytes are only transitioned to `uploaded_bytes` upon upload completion (`CommitShareLinkUpload`), and are released immediately upon upload abort or failure (`ReleaseShareLinkReservedUpload`).
  - **Item-Level & Folder-Level Scoped Access**: Every item action (`view`, `download`, `prepare download`, `upload into folder`, `create folder`, `rename`, `move`, `copy`, `delete`, `star`, `folder tree`) now validates access using `AccessFolder` or `AccessItem` instead of project-level `Access`. Users with folder-only grants can view, download, and upload strictly within that folder and receive 404 for any resources outside it.
  - **CanDownload Inheritance**: When a person has no project access, `CanDownload` is derived directly from the grant providing access. If multiple sources yield the same access level, the strictest rule applies (`CanDownload = sourceA && sourceB`).
  - **Role Escalation Guards**: Only users holding the `Admin` role can assign or revoke the `Admin` role. Users cannot edit, demote, or delete their own assigned role. When creating or editing roles, users can only grant permissions they currently hold. Free-text roles are rejected; role names and IDs must exist in the company's `roles` table.
  - **Permission-Based Routing**: Replaced hardcoded `RequireRole("admin")` middleware with fine-grained permission checks (`RequirePermission(authz.PermTeamInvite)`, `RequirePermission(authz.PermTeamChangeRoles)`, `RequirePermission(authz.PermAdminStorage)`).
  - **Restore Trash Permission**: Uploader or deleter can restore items from trash only if they still hold at least `Uploader` access on the destination folder/project.
## 29. Production Secret Validation, Go Module Independence & Folder-Scoped Batch Actions (P3 Final)
- **Decision**:
  - **Production Secret Validation**: In production (`ENV=production` or `ENVIRONMENT=production`), the API server checks `cfg.Validate()` during startup before binding any listeners. It terminates immediately (`os.Exit(1)`) if `SESSION_SECRET` is missing, equals the dev default (`"default-dev-secret-at-least-32-characters-long"`), or is shorter than 32 characters. It similarly rejects dev defaults for `DATABASE_URL`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Documented generation via `openssl rand -hex 32` in `docs/DEPLOY_NOTES.md`.
  - **Module Tidy & Container Portability**: Ran `go mod tidy` across all modules. Pinned `rogpeppe/go-internal` to `v1.13.1` to maintain Go 1.23 toolchain compatibility across Docker builder images. Proved `GOWORK=off go build ./...` passes in `services/api`, `services/shared`, and `services/worker`, and that `infra/Dockerfile.api` and `infra/Dockerfile.worker` build cleanly.
  - **Folder-Scoped Batch Actions & Trash**: Refactored `BatchAction` and `ListTrash` to resolve and cache access per parent folder (`authz.AccessFolder`). Users with folder-level Full grants can batch move and delete items inside their folder, while items outside their grant are rejected or filtered out. Move destinations enforce `targetFolderAccess.CanUpload()` and prevent circular moves.
- **Reason**: Guarantees zero secret compromise in production deployments, enforces clean standalone module builds, and provides performant, granular folder-scoped batch operations.

## 30. Milestone P4: Video Review Screen, Media Processing Worker, & Approval Flow
- **Decision**:
  - **Aspect-Ratio Preserving Transcoding**: Never force 1280x720 or 1920x1080 bounding boxes. Scale so the short side is 720 or 1080 while keeping exact source aspect ratio (9:16 vertical, 1:1 square, 4:5 social, etc.) with zero stretching or black bars. Only generate 1080p when the source short side is $\ge 1080$. Support silent videos (no audio track) and audio-only files (waveform peak generation + audio player).
  - **Processing Concurrency & Storage**: Worker limits active video jobs to at most 2 concurrent ffmpeg processes using a semaphore. Streams original media to temporary local disk, transcodes HLS (4s segments, keyframe alignment, poster, thumbnail sprite sheet, audio waveform), uploads preview assets under `previews/{company_id}/{version_id}/...`, and removes temp files in defer.
  - **View vs Download Fallback Security**: When `preview_status != 'ready'`, playing the original file is restricted strictly to users with download permissions (`access.CanDownload == true`). View-only users without download permission receive HTTP 425 Too Early (`"Processing, ready in a few minutes"`) and cannot stream raw file bytes.
  - **HLS Variant & Master Playlist Proxying**: Both master (`playlist.m3u8`) and variant playlists (`720p.m3u8`, `1080p.m3u8`) are proxied and rewritten with 2-hour presigned R2 URLs. In `hls.js`, 403 errors on expired segments trigger a quiet playlist reload (`hls.loadSource(playlistUrl)`) ensuring long-paused videos resume seamlessly.
  - **Role-Agnostic Permission Checks**: Comment creation, replies, and resolution require `Commenter`, `Uploader`, or `Full` access (no checks by role name). Comment edits are restricted to the author; deletions to the author or users with Full access.
  - **Review Approvals & Version Reset**: Approvals and change requests are allowed for team members with Full access and client contacts with Commenter or above. Share link visitors can approve only if the link allows comments and identity (name + email) is provided. Every decision is version-scoped, recorded in `reviews`, and displayed in Details history. Uploading a new version resets `items.review_status` back to `needs_review`.
  - **Team-Only Comments Scrubbing**: Server-side enforcement everywhere: comment lists, replies under team-only parents, comment counters, timeline markers, CSV export, activity feed, and public share link pages. Client contacts and share link visitors never receive or see team-only comments or the "Team only" toggle.
  - **Live Synchronization & Rate Limiting**: Real-time polling every 8s updates comments, resolutions, and approvals without full page refreshes. Public comment and approval endpoints on share links are rate-limited against abuse.

## 31. P4 Advisor Review: Asynq Worker Wiring, Share Link Hardening & Identity Verification
- **Decision**:
  - **Asynq Background Processing & Requeue Command**: Wired `services/worker/cmd/worker/main.go` to use Asynq (Redis), concurrency 2, 3 retries. Handlers for `media:process_video_version` execute `Processor.Process` for video and audio. `CompleteUpload` and `PublicUploadComplete` enqueue tasks. Added `-requeue` CLI option and `make requeue` to re-queue versions stuck in pending.
  - **Centralized Public Link & Password Verification**: Consolidated link resolution, HMAC password unlock cookie verification, and item scope checks into a single reusable helper `ResolvePublicShareLinkAndItem`. Refuses deleted (trashed) items. Applied across all public endpoints (`PublicPlaylistProxy`, `PublicListComments`, `PublicCreateComment`, `PublicSubmitReview`, `PublicExportCommentsCSV`).
  - **CSV Export Authorization**: `ExportCommentsCSV` checks item view permissions (`authz.AccessItem` + `CanView()`). Added dedicated `PublicExportCommentsCSV` for public review links, strictly filtering out team-only comments.
  - **Reviews Feed & Mention List Privacy**: `ListReviewsFeed` resolves viewable items for the caller (checking project and folder/file grants, restricting client contacts to their client's projects). `ListMentionable` verifies caller can view item, only returns people who can view the item, and masks emails (`email = ""`) when viewed by client contacts or visitors.
  - **Share Link Visitor Identity & Approval Enforceability**: Share link visitors must identify via `POST /s/{token}/identify`, receiving a signed `ph_share_visitor_<linkID>` cookie. Typed names and emails in requests are ignored in favor of verified cookies. Approval decisions strictly require an identified visitor (HTTP 401 without cookie) and persist `visitor_id`.
  - **Debounced Notification Pipeline**: Activity rows are written for comments, replies, mentions, and review decisions. Notifications check user toggles (`notification_prefs` and `project_notification_prefs`) and enqueue 5-minute debounced grouped notification jobs in Asynq. Team-only comments are never dispatched to clients.
  - **Video Orientation Handling**: FFprobe metadata side data and displaymatrix are parsed. For rotated videos (e.g. 90° or 270° from smartphones), width and height are inverted prior to calculating scaling, preserving native 9:16 vertical video (720x1280 or 1080x1920) without distortion or letterboxing.
  - **Raw Attachment Key Sanitization**: Removed `attachment_key` from client request payloads to prevent arbitrary client-supplied storage keys.
  - **Comment Target Integrity**: `CreateComment` and `PublicCreateComment` validate that `version_id` and `parent_id` belong directly to the target item.
  - **Membership Resolution for Team Access**: Replaced role name string checks with company membership verification in database (`queries.GetMembership`).

## 32. Grouped Notifications Worker Engine & Mention Access Scoping (P4 Final)
- **Decision**:
  - **Asynq Unique Grouped Notification Engine**: Extracted comment notification dispatch out of the HTTP API into background Asynq worker handler `email:grouped_comment_notification` in `services/worker/notifier.go`. When comments are created, the comment ID is pushed to Redis set `playhead:pending_comments:<item_id>` and a single debounced task is scheduled with `asynq.Unique(5*time.Minute)` and `asynq.ProcessIn(5*time.Minute)`. When the worker fires, it drains all pending comments for that item, loads users with view access, filters out team-only comments for non-team recipients, verifies user/project notification toggles, and sends exactly ONE email per recipient summarizing all comments. Immediate reviews (Approve / Request changes) dispatch immediately.
  - **Strict Mention Access Scoping**: During comment creation and grouped email aggregation, parsed `@mentions` are cross-referenced with `authz.AccessItem(person, item)`. Only users with `CanView() == true` are notified. Mentions of users without access to the item are discarded and send zero emails.
  - **Worker Dockerization with Alpine and FFmpeg**: Integrated `playhead-worker` into `infra/docker-compose.yml` based on `infra/Dockerfile.worker`, including `ffmpeg 6.1.1` and `ffprobe`. Runs automatically in `make dev` with access to MinIO (`http://minio:9000`), Postgres, and Redis.

## 33. Milestone P5: Documents Architecture, Collaboration Engine & Zero-Leak Team Notes
- **Decision**:
  - **Standalone Collab Service (`services/collab`)**: Node.js microservice running on port `8082` using `@hocuspocus/server` and `yjs`. Dockerized in `infra/docker-compose.yml` (`playhead-collab`) and managed concurrently in `make dev`.
  - **Zero-Trust Connection & 5-Second Access Revocation**:
    - On WebSocket connection, Hocuspocus sends `POST /api/internal/collab/verify` to the Go API with `X-Collab-Secret`.
    - Go API runs `authz.AccessItem` on the document: users without access are immediately refused; users with less than Full access (`Viewer`, `Commenter`, `Uploader`) receive `read_only = true`. Non-team members (client contacts, share link visitors) are strictly REFUSED at `onAuthenticate` even with Full access.
    - **Short-Lived Signed Collab Ticket**: Rather than passing session tokens in WebSocket query params (which leak into access logs), the web app requests a short-lived ticket (`POST /api/v1/documents/{id}/collab-ticket`, valid for 60 seconds, HMAC-signed, strictly bound to `user_id` + `document_id`). The collab service receives this ticket in the Hocuspocus auth message payload.
    - **Protected Internal Endpoints & Constant-Time Secret**: Collab internal endpoints (`/api/internal/collab/*`) are internal only, verify `X-Collab-Secret` using constant-time comparison (`subtle.ConstantTimeCompare`), and refuse to start in production if `COLLAB_INTERNAL_SECRET` is missing or default.
    - Every active connection is re-evaluated every 5 seconds (with immediate Redis pub/sub eviction whenever grants or memberships change). Revoked connections are closed immediately (`4403 Forbidden`).
    - Documents are persisted to PostgreSQL at most every 2 seconds during active editing and immediately when the last collaborator disconnects. Plain text is automatically extracted and stored in `plain_text` and sanitized `public_plain_text` for search.
  - **Strict Open-Source License Policy (Zero Tiptap Pro / Cloud)**:
    - Editor built with open-source Tiptap core and community extensions (all MIT).
    - DOCX import: `mammoth` (BSD 2-Clause).
    - DOCX export: `docx` (MIT).
    - Markdown import/export: `marked` (MIT) and `turndown` / `turndown-plugin-gfm` (MIT).
    - Offline sync: `y-indexeddb` (MIT). Cleared on user sign out.
    - PDF & Print: Clean `@media print` CSS stylesheet and `html2pdf.js` (MIT).
  - **Team-Only Notes Security Architecture (Zero-Leak Guarantee)**:
    - CRDT state cannot safely hide inline content from clients if the raw Yjs stream is delivered to them.
    - Architecture: Internal team members (`is_team_member = true`) connect directly to the live Yjs room (`doc:{id}`) with real-time multi-cursor collaboration.
    - External clients and public share links **never receive the raw Yjs WebSocket stream**. The collab service rejects them at `onAuthenticate`.
    - Non-team users receive a server-sanitized read-only projection (`GET /api/v1/documents/{id}/view`, polled every 10 seconds for live updates).
    - **Sanitized Single Source of Truth**: The collab service saves `content_json` on every store. Every non-team output (view, version history, export PDF/docx/md, print, search, share link page) is built from `content_json` with all `team_notes` nodes stripped on the server.
    - **Image Isolation**: GET of document images verifies document view access. Images placed solely inside `team_notes` blocks return 404 for non-team users.
    - **Scoped Document Listing**: `/documents` and `GET /api/v1/documents` strictly list only documents the user can view; client contacts only see documents belonging to their client company.
    - **Design Tokens**: Zero emojis anywhere; sync status indicators use small colored status dots/icons and text: `Saved`, `Saving`, `Offline: changes saved on this device`.
  - **Non-Destructive Version History**: Automatic snapshots saved every 10 minutes of active editing plus manual "Name this version". Restoring a historical version writes a new snapshot and updates the active document, preserving all newer versions.
  - **Secure Video Cards & Image Flow**:
    - Embedded video cards resolve metadata through `GET /api/v1/items/{id}/card-preview` using `authz.AccessItem`. Readers without access receive a locked card (`"No access: You don't have permission to view this video"`). Video cards on public share links resolve via the shared public share helper.
    - Document image uploads use Playhead's standard presigned R2 upload workflow with storage quota reservations in PostgreSQL transactions.
## 34. P5 Advisor Review: Data Loss Prevention, In-Doc Replacements, Template Parity, and Server-Side Conversions
- **Decision**:
  - **Server-Side Yjs State Initialization**: When a document is created from a template or imported, the Go API calls the internal collab endpoint (`POST /internal/init-document`) which constructs the real `Y.Doc` state with `y-prosemirror` and saves `content_state`. `useEditor`'s `content` property is strictly omitted when the collaboration extension is active to prevent content duplication when multiple users open a new document.
  - **Separate Read-Only Version Preview**: Historical version previews are rendered inside a dedicated `<ReadOnlyVersionPreview />` component without the Collaboration extension. `editor.commands.setContent` is never invoked on the live collaborative editor during version inspection.
  - **In-Memory CRDT Content Replacement**: Document version restores and Word document imports execute through `POST /internal/replace-content` in the collab service. Content replacement occurs inside a live `ydoc.transact()` call that deletes existing fragment elements and inserts the new state. This guarantees that connected collaborators see changes immediately and reconnecting offline clients with local IndexedDB caches do not resurrect deleted content.
  - **Collab-Driven Automatic Version Snapshots**: On every document store event in the collab service, if document edits occurred and the last version snapshot was created >= 10 minutes ago, an `"Automatic version"` snapshot is recorded in `document_versions`.
  - **Template Parity**: Templates are locked strictly to the 5 specified in `FEATURES_DOCS_SHEETS.md`: `Blank`, `Brief`, `Script`, `Shot list`, and `Creator notes`.
  - **Clean Public Plain Text**: `public_plain_text` is stored strictly as cleaned human-readable plain text with all `team_notes` stripped (fixing previous bug where JSON was stringified into the column).
  - **Server-Side Word Conversion**: Word (.docx) imports are uploaded to the API and converted on the server side in the collab service using `mammoth` with a 25MB file size limit.
  - **Instant Connection Revocation**: Whenever grants, roles, company memberships, or project people change, the API publishes to Redis channel `playhead:collab:revocations` to disconnect active collaboration sessions immediately.
- **Reason**: Fixes all potential data loss bugs identified in advisor review, ensures offline CRDT consistency, and enforces strict template and security compliance.




