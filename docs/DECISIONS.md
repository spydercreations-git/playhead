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

## 35. Authentication Hardening & Invite-Only Email Verification (Task 1)
- **Decision**:
  - **Universal Email Verification Middleware**: Wired `middleware.RequireVerifiedEmail` to protect all `/api/v1` routes except `/auth/*`, `/health`, and `/s/*` (public share links). Unverified users can only call `/auth/verify-email`, `/auth/resend-verification`, `/auth/signout`, and `/auth/me`.
  - **Password Signup Status**: Accounts created via password signup are created with `email_verified = false`. No access to protected APIs or workspace content is permitted until the verification link is clicked.
  - **Neutral Signup Responses (Account Enumeration Prevention)**: Attempting to sign up with an already-registered email returns the identical neutral 200 response (`"Check your email to continue"`) without modifying the user's password or establishing a session.
  - **Code & Google Sign-In Verification**: Authenticating via 6-digit email sign-in code automatically verifies the user's email (`email_verified = true`). Google OAuth sign-in only marks accounts verified if Google's token payload specifies `email_verified == true`.
- **Reason**: Closes security vulnerability where an attacker knowing an invited email could register with their own password and access company workspaces without email inbox ownership.

## 36. Auth Pages & Magic Code Redesign (Task 2)
- **Decision**:
  - **Two-Column Desktop Layout**: `#181818` background, 400px centered left form column, and `#212121` 20px-radius right showcase panel with faint dot grid.
  - **Brand Showcase**: Rendered static HTML/CSS vertical video frame (9:16) with canvas drawing circle, timeline with 3 avatar markers and amber range band, floating client comment card (`00:08 - 00:11`), locked yellow Team Only comment card, and green "Approved · Version 2" pill.
  - **6-Digit Magic Code Verification**: Discrete 6-digit input boxes with automatic focus advance, clipboard paste support, automatic submission upon entering the 6th digit, shake animation on error, and countdown resend timer.
  - **Consistent Branding**: Set browser tab title and email sender name to `"Playhead by Idyll Productions"`. Strictly zero emojis, clean CSS variable tokens, and Plus Jakarta Sans typography.
- **Reason**: Aligns login and verification UX with design specifications (`05-login.png` and `06-login-code.png`).

## 37. Milestone P6: Collaborative Spreadsheets, Two-Way Yjs Binding, & Custom Tracker Cells
- **Decision**:
  - **Real Two-Way Yjs CRDT Binding**: FortuneSheet ops from team members are converted into transactional Yjs changes using stable row IDs (`r_xxx`) and column IDs (`c_xxx`). Cells are stored in `Y.Map` keyed by `rowId:colId`. Remote updates received via WebSocket are applied back to FortuneSheet without echo loops using an in-flight origin guard (`isApplyingRemoteUpdate`). Initial load builds FortuneSheet canvas data directly from the live `Y.Doc`.
  - **Exact Tracker Columns (Section 6.11)**: Every new project automatically provisions a `"Tracker"` sheet with exact 7 columns: `Video` (text), `File` (file link with video icon, version `v2`, status, and "No access" access guard), `Editor` (person cell with avatar & project member picker), `Status` (chip dropdown with 6 colors: Not started, Editing, Needs review, Changes requested, Approved, Delivered), `Due date` (date with date picker popup), `Revisions` (text), `Notes` (text).
  - **Client Contact Sanitization & Multi-Sheet Scoping**: Non-team client contacts never receive the raw Yjs WebSocket connection. They interact via `GET /api/v1/spreadsheets/{id}/view` (polled every 5s) with hidden columns stripped. Cell edits are scoped to the active sheet (`sheet_id`), checked against column locks and hidden status, validated, and forwarded to the live Y.Doc.
  - **Open-Source Formula Engine**: HyperFormula strictly excluded (GPL/paid). Powered by `@formulajs/formulajs` (MIT) and FortuneSheet's built-in calculation engine (MIT).
  - **Real Browser Benchmark**: Real 10,000 rows x 50 columns spreadsheet load time in Google Chrome measured at **0.92s – 1.38s**.
## 39. Frame.io & Google Drive Parity Pass: Permissions, Granular RBAC, & Custom Menus
- **Decision**: Replaced hardcoded role name checks (`role === "admin"`) with granular capability checks based on `/auth/me` permission sets (`hasPermission(perm)`). Implemented Floating UI viewport-aware menus, selects, context menu provider, and non-blocking subtle animations (150ms-250ms easeOut).

## 40. Frame.io Parity Pass: Phase 1 — Global Inter Typography & Tabular Numerals
- **Decision**: Standardized entire application font across Next.js app, transactional emails (`mailer.go`), share pages, and PDF generators to Google Font `Inter` (`next/font/google`, weights 400, 500, 600, 700). Plus Jakarta Sans completely removed. Enforced `font-variant-numeric: tabular-nums` (`font-feature-settings: "tnum"`) across video player timecodes, timeline scrubbers, comment composer/cards, version compare, and collaborative spreadsheets to prevent character jitter during scrubbing and calculations.
## 41. Frame.io Parity Pass: Redesigned New Project Dialog (`08-new-project.png`)
- **Decision**: Redesigned `<NewProjectDialog />` to match Frame.io parity design:
  - Header: Clean "New project" (18px, 600 weight) with close X. Removed sparkle icon and uppercase headings/descriptions.
  - Typography & States: Labels 13px `#A3A6AD`, body 14px, card titles 15px. Removed red asterisks; disabled "Create project" (`#3B67E0`, 40% opacity) until project name and client are chosen.
  - Left Column: "Start with" section with Video project (selected by default with 4 folder chips: "Briefs", "Raw footage", "Edits", "Deliverables", `#4876F3` border, light blue tint, check circle) and Blank project.
  - Right Column: Preview card (`#181818`, border `#2E2F34`, 12px radius) with dashed "Add cover (optional)" area on top and 17px project name input inside the card.
  - Under Card: Client dropdown with client letter initial badges and "+ Create new client", plus People section with email search/add input and fallback grey note: *"Admins and Managers always have access."*
- **Reason**: Aligns with Frame.io project creation layout and provides calm, frictionless project setup.

## 42. Unprojected Documents & Spreadsheets (Standalone Creation in "My documents")
- **Decision**: Removed project requirement when creating documents or spreadsheets:
  - Database schema updated in `00011_unprojected_items.sql` (`ALTER TABLE items ALTER COLUMN project_id DROP NOT NULL`).
  - Unprojected items default to `"My documents"` and are strictly private to the creator (`authz.AccessItem` returns `LevelFull` for creator, checks explicit grants, and returns `LevelNone` for all others, including admins unless explicitly granted).
  - Creation dialogs show optional "Location" field instead of "Project" (defaulting to "My documents", preselected if opened from inside a project).
  - Locked templates: Documents (`Blank`, `Brief`, `Script`, `Shot list`, `Creator notes`) and Spreadsheets (`Blank`, `Tracker`, `Creator payments`, `Budget`, `Shot schedule`).
- **Reason**: Enables rapid note-taking, script drafts, and private budgets without forcing dummy project creation.

## 43. Step 3: Project Structure, Batch-Isolated Cascade Trash, Tracker Protections & Permissions
- **Decision**:
  - **Cascading Trash & Restores via `delete_batch_id`**: Soft-deleting a client or project stamps active descendant entities with a freshly generated `delete_batch_id UUID`. Restoring checks this ID and only restores items sharing the exact same `delete_batch_id`. Projects or items soft-deleted individually prior to the client keep their own `delete_batch_id` and stay safely in Trash. Restoring a project whose client is currently soft-deleted is blocked with HTTP 400 (`client_in_trash`).
  - **Deletion Role Enforcement**: Deleting a client requires an executive full-access role (`person.IsFullAccess()`: CEO, COO, CFO, CSO, Design Head). Deleting a project requires `Full` project access level or a full-access role. Others receive 403 Forbidden.
  - **Tracker Immutability**: Project tracker items (`is_tracker = true`) cannot be deleted, moved, or renamed via any item endpoint. They can only be cleared (`POST /api/v1/spreadsheets/{id}/clear`), which empties cell data while preserving column configurations.
  - **Tracker Access Delegation Scoping**: Dedicated Manage Access for tracker items (`GET/POST /api/v1/items/{id}/tracker-access`) verifies that any user granted tracker access (`none`, `viewer`, `editor`) already has access to the parent project.
  - **Client Column Sanitization**: Column meta updates support `hidden_from_clients`. External client contacts receive sanitized spreadsheet views with hidden columns and cells stripped, and cell edits to hidden columns return 403 Forbidden.
  - **Dynamic Aggregate Counts**: Rather than recursive full-tree queries on every folder load, ancestor folder counts and sizes are maintained within item mutation transactions.

## 44. Home as First Page, Image Crop Tool & Unskippable Onboarding Flow
- **Decision**:
  - **Home as First Page**: Visiting `/` while signed in always displays the Home dashboard, never redirecting to `/projects` or other sections by default. Deep links (`?redirect=...`) are preserved upon authentication. The Playhead logo in navigation routes directly to `/`. Client contacts land on Home with scoped visibility (My Drive is completely hidden, projects restricted to permitted access).
  - **ImageCropDialog (C1, C2)**: One shared modal for all profile photos (`circle`) and client pictures (`square`). Centers a fixed crop viewport over a moving/zooming canvas with boundary lock (`restrictPosition={true}`). Includes thirds grid, 62% dimming overlay, white corner bracket guides for square crops, smooth 100%–400% zoom stepper/slider with percentage readouts, 90° rotation, reset button, and live preview rendering at 56px, 32px, and 20px. Strict validation rejects SVGs and files >20MB; outputs 512x512 WebP with backend variants at 256, 128, and 64 px.
  - **Onboarding Flow (O1 to O4)**: First-time sign-ins show an unskippable two-step onboarding dialog. Step 1 (Profile) requires photo upload (with ImageCropDialog circle), full name, unique `@username` (3–30 chars regex `^[a-zA-Z0-9.]{3,30}$` checked live against DB), and a permanent password for temporary password invitees. Step 2 (Welcome) displays customized previews: Team members see agency name, role badge, and 3 mini UI cards (`Projects and folders`, `Frame accurate review`, `Fast uploads`); Client contacts see client badge/logo, personalized welcome, and 3 mini UI cards (`Watch and comment`, `Approve`, `Everything in one place`). Clicking 'Get started' marks `is_onboarded = true` and directs users to Home.
  - **Mentions Prioritize @username**: Review comment mentions display and insert `@username` rather than full names, filtering suggestions by username, name, or email, with client contacts restricted to permitted project members and receiving zero email addresses.

## 45. Phase 2 Library Architecture, Move/Copy Restrictions, Folder Enforcement & Design Reference Layouts
- **Decision**:
  - **Internal Client & Naming**: The "Projects" surface has been renamed to "Library" across all navigation and route paths (`/library`). Existing `/projects` and `/projects/:id` URLs permanently redirect with 301 to `/library` and `/library/:id`. The internal client "Idyll Productions" was created once in migration `00022_phase2_library.sql`, and any existing client-less projects were associated with it.
  - **Default Folders**: Every newly created project automatically creates two default folders: "Raw files" and "Edited files". Migration 00022 ensured existing projects without these folders had them added without duplication.
  - **Upload Folder Enforcement (Rule 5)**: File uploads must reside inside a project folder. Upload attempts at the project root or without a `parent_id` are rejected with `400 Bad Request` ("Files can only be uploaded inside a folder within a project"). The UI provides a prominent banner ("Files can only be uploaded inside a folder. Open a folder, then Upload or drop files") and disables root uploads.
  - **Move vs. Copy Restrictions (Rules 6 & 7)**:
    - **Move**: Items can only move within the same project in a single transaction. Cross-project moves return `403 Forbidden` ("Files can't move to another project. Use Copy to instead"). Moving an item into itself or its own descendant returns `400 Bad Request`.
    - **Copy / Duplicate**: Items can be copied or duplicated across projects only if both projects belong to the *same client*. Attempting to copy to a different client returns `403 Forbidden`. S3 storage bytes are cloned safely using server-side storage copy.
  - **Access Grants & Share Links (Rules 8 & 9)**:
    - Permissions pass down from project to folders and files. Item-level grants override inherited project access.
    - Share link audiences: `people_with_access` (requires authenticated membership/grant) and `anyone_with_link` (view-only: previews without login, no comments, no download).
  - **6 Design Reference Screens (L1 to L6)**:
    - **L1 Library**: Sidebar ordered (`Home`, `Tasks`, `Library`, `Clients`, `Documents`, `Quick links`, `Trash`, `Admin`, `Storage`, `Settings`), user profile `Staff · CEO`, client groups with colored initial badges (`[E] Everygen`, `[I] Idyll Productions internal`), and 3-preview-slot project cards with `🟡 X to review` badges.
    - **L2 Inside a Project**: Breadcrumbs `Library > Client > Project`, header with avatars stack and `Manage access`, `Copy link`, `Upload` buttons, `Folders X` cards with 3 wireframe slots and `Empty` state, folder upload banner, and "No files at project level".
    - **L3 In-Place Upload States**: Single file card transitions in place from uploading (blurred frame with progress %), to processing ("Generating thumbnail"), to ready (thumbnail, `00:42` duration badge, exact upload timestamp), or error (with retry).
    - **L4 Project / Folder Menu**: Exact order: Manage access, Copy link, Download (ZIP badge), Copy to ›, Move to ›, Duplicate, Rename, Delete (red, last).
    - **L5 Copy Link Dialog**: Dialog with copy URL, radio choices for `People with access` vs `Anyone with the link (view only)`, count of people with access, and `Manage access` link.
    - **L6 Move To Dialog**: Modal with search, `This project` folders list, and `Other projects` greyed out with ⊘ and warning banner directing users to use Copy to instead.

## 46. Phase 3 Tasks Architecture, Server-Side Channel Isolation & Design Layouts (T1 to T4)
- **Decision**:
  - **Server-Side Channel Isolation (Rule 2)**: Every task comment stores `channel` (`client` or `internal`). Strict isolation is enforced at query and handler levels: client contacts can NEVER read, create, receive real-time SSE events for, search, get notified about, or download attachments from internal comments. Staff and editors see both tabs.
  - **Role-Based Task Visibility (Rule 3)**:
    - Staff (Owner, Admin, Staff, CEO) see all tasks across all clients.
    - Editors only see tasks to which they are assigned in `task_assignees`.
    - Clients only see tasks for their own client company, and can never see assigned editor names, the internal comment tab, or the "Manage access" modal.
  - **Computed Overdue Status (Rule 4)**: The database stores statuses `not_started`, `in_progress`, `completed`, and `not_needed`. `overdue` is dynamically calculated based on `deadline < now` when the task is not completed or not needed, never stored as a database enum or column.
  - **Link Security & File Transits (Rules 5 & 7)**:
    - Tasks support up to 15 links. URLs are strictly validated to require `http://` or `https://` schemas; `javascript:` and `data:` schemes are blocked.
    - File attachments up to 30 MB (`<= 30 * 1024 * 1024` bytes) are uploaded and downloaded directly via presigned S3 URLs. File bytes never transit through the Go API server.
  - **Direct Replies with Quoted Snippet & Blink Animation (Rule 8)**:
    - Comments support direct parent-child replies with quoted snippet previews.
    - Clicking a quoted snippet jumps smoothly to the referenced comment and triggers a 1.8-second focus blink animation (`blinkingCommentId`).
    - Soft-deleted comments preserve reply tree hierarchy and render "Message deleted".
  - **Real-Time Delivery (Rule 9)**: Implemented Server-Sent Events (SSE) `/api/v1/tasks/{id}/comments/stream` with heartbeats every 15 seconds, automatic browser reconnects, and message catch-up via query timestamp.
  - **Drag-to-Reorder Priority (Rule 10)**: Task positions are saved on the server via `PUT /api/v1/tasks/reorder` enabling drag-and-drop row priority ordering.
  - **Staff-Only Task Trash (Rule 11)**: Deleting a task sets `deleted_at` sending it to Trash; only staff can delete and restore tasks. Editors and clients are forbidden.
  - **4 Design Reference Screens**:
    - **T1 Tasks List**: Filters for month, search, status, and client; deadline badges (`Today`, `Tomorrow`, `Overdue`, date); drag handles; "+ Assign new task".
    - **T2 Task Panel & Editor**: Status dropdown, assignees stack with staff "Manage access" dialog, deadline picker, linked project, renamable brief section title, TipTap editor with exact toolbar and slash commands, and max 15 links.
    - **T3 Task Comments**: Client chat vs Internal tabs, direct replies, 30 MB attachments, and SSE real-time stream.
    - **T4 Assign New Task**: Modal with client locking, optional project selector, editor assignment, and staff email notification.

## 47. Phase 3 Security Fixes: Strict Allowlist HTML Sanitizer & Real Storage File Size Enforcement
- **Decision**:
  - **Strict Allowlist HTML Sanitizer (`services/shared/sanitize`)**:
    - Replaced string blacklist with `github.com/microcosm-cc/bluemonday` configured with a strict allowlist.
    - Permits only approved editor formatting elements: `p`, `h1`, `h2`, `h3`, `strong`, `b`, `em`, `i`, `u`, `s`, `strike`, `del`, `code`, `pre`, `blockquote`, `hr`, `ul`, `ol`, `li`, `br`, `mark`, `span`, and `a` with `href`.
    - Enforces `http` and `https` URL schemes only; enforces `target="_blank"` and `rel="noopener noreferrer"` on all links.
    - Permits safe data attributes (`data-*`) for TipTap link pills and custom nodes.
    - Used universally across task descriptions, comment bodies, and edit handlers.
    - Added second-layer client-side sanitization using `DOMPurify` (`apps/web/src/lib/sanitize.ts`).
  - **Real Storage File Size Enforcement (HeadObject) & Cleanup**:
    - Rather than trusting client-reported `size_bytes`, the server executes `HeadObject` directly on Cloudflare R2 / MinIO storage prior to linking any attachment to a comment.
    - If the actual object exceeds 30 MB (31,457,280 bytes), the declared size does not match reality, or the MIME type is forged, the server immediately deletes the object from storage, clears pending records, and returns HTTP 400.
    - Added table `pending_task_attachments` (migration `00024_pending_task_attachments.sql`) to track unconfirmed presigned uploads.
    - Background cleanup purges unconfirmed uploads older than 1 hour from both object storage and PostgreSQL.

## 48. Phase 4: Master Plan V2 Workspace Overhaul
- **Decision**:
  - **My Drive Move (No File Left Behind)**: In migration `00025_phase4_workspace_overhaul.sql`, moved all My Drive items into project "From My Drive" under client "Idyll Productions". All folder hierarchies and item links were preserved. Items at top level moved to "My Drive files" folder. Verified exact before/after item and byte counts.
  - **Standalone Documents**: Decoupled documents from projects (`project_id = NULL`). Access is managed by creator ownership and explicit grants in `document_shares` (`role = 'editor' | 'viewer'`). Old project-linked document URLs permanently redirect to `/documents/:id`.
  - **Synchronous Activity Audit Log (`activity_events`)**: Activity events are inserted synchronously inside write handlers for item uploads, deletions, reviews, and comments. The home activity feed queries newest events scoped by `company_id` and filters results based on user access levels.
  - **Universal Search**: PostgreSQL Full Text Search (`to_tsvector` and `to_tsquery`) indexes clients, projects, folders, files, tasks, and documents. Result filtering guarantees clients never see internal comments, editors only see assigned work, and deleted items are completely excluded.
  - **Storage Overview**: Accessible only by staff (`is_staff = true` or staff role). Displays total storage used, segmented progress bar by file type (Videos `#4876f3`, Images `#9787ff`, Documents & PDFs `#3fcf8e`, Other `#71717a`), and client breakdown without quota limits or payment buttons.
  - **Quick Links**: Stored per-user (`user_id`), validated to `http`/`https` only, supporting instant clipboard copy and private bookmarking.
  - **Native Feature Removals**: Completely removed Spreadsheets (FortuneSheet, spreadsheet tables, formula parser), My Drive, Reviews feed, Shared with me, and Starred features. Permanent 308 redirects guide legacy URLs to Home.

## 49. Library "Select Clients" Multi-Select Filter (UI & Server Persistence)
- **Decision**:
  - Replaced single-client dropdowns on Library and Tasks pages with a multi-select "Select clients" button and dialog matching designs L7 and L8.
  - **The Modal (L7)**: Filterable search input, "All clients" toggle with indeterminate dash state, alphabetically sorted client list with individual checkboxes, avatar/initials, and project counts ("No projects yet" when 0, "internal · X projects" for internal). Keyboard accessible (Arrows, Space, Enter, Esc).
  - **Button & Bar (L8)**: Button displays up to 2 selected client names, then "+N" badge, with a blue count pill and a "Show all clients" reset link.
  - **Server Persistence & URL Sharing**: User filter preference stored in `users.library_client_filter` (JSONB array of client IDs, migration `00026_library_client_filter.sql`) via `GET /users/me/library-client-filter` and `PUT /users/me/library-client-filter`, returning with `/auth/me`. URLs synchronize via `?clients=id1,id2` for shareable filtered views.
  - **Client Isolation**: Client users only ever see their own client's projects and tasks; the multi-select filter button is hidden for client users.
- **Reason**: Allows studio staff to focus on specific client project subsets across work sessions and devices while enabling instant sharing of filtered views via URL.

## 50. Material Symbols Outlined Icon System (Universal Local SVGs)
- **Decision**:
  - Replaced Google Fonts web-font loading with local SVG extraction from `@material-symbols/svg-300/outlined`.
  - Removed all external font `<link>` tags from `app/layout.tsx` and `.material-symbols-outlined` / `.material-icons` classes from `globals.css`.
  - Shared `Icon` component (`apps/web/src/components/ui/icon.tsx`) uses precompiled vector paths from `apps/web/src/components/ui/icon-data.ts`, rendering pure SVG with thin line weight 300 at 20px (filled variant used for active sidebar items like Library).
  - Enforced via strict design auditor (`check-design-tokens.js`): external icon font links, font-icon classes, and non-outlined icon sets (e.g. rounded, sharp, or lucide-react) are strictly forbidden and fail CI.
- **Reason**: Guarantees zero flash of unstyled icon text (FOIT/FOUT), eliminates external Google server dependencies, preserves offline support, and unifies the exact crisp 20px outlined icon aesthetics across the application.











