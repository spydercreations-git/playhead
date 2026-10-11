# Playhead: Full Build Specification (PRD for an AI coding agent)

Prepared by Harsh and Rohit
Version 1.0, October 2026
Built by Idyll Productions

---

## 0. Instructions to the AI coding agent (read first)

You are the lead engineer building **Playhead**, a web app that combines cloud file storage, Frame.io style video review, and Monday.com style tracking boards for video editors, agencies and their clients.

How to work:

1. Treat this file as the single source of truth. If something is unclear or missing, stop and ask before inventing behavior. Record every decision you make in `/docs/DECISIONS.md`.
2. Build in the milestone order in Section 16. Finish one milestone, with tests passing, before starting the next.
3. After each milestone, update `/docs/PROGRESS.md` with what was built, what is left, and how to run it.
4. Follow the stack in Section 2 exactly. Do not add a new framework, database or paid service without asking.
5. Never put file bytes through the API server. Browsers upload to and download from object storage using signed URLs.
6. Every API endpoint checks authentication, company membership, project access and role before doing anything (Section 6).
7. Every endpoint that writes data needs at least one test. Every permission rule needs a test that proves a forbidden user is refused.
8. Keep the UI dark, clean and fast (Section 13). No layout shift, no blocking spinners where a skeleton will do.
9. Use clear names, small functions and comments only where the reason is not obvious.
10. Money and storage math must be exact (integers: bytes and cents). Never use floats for either.

Definition of done for any feature: works end to end in the browser, permission checks in place and tested, loading, empty and error states designed, works at 375px phone width for review and share pages, no console errors.

---

## 1. Product summary

**One line:** upload, review and track every video in one place.

**Problem:** editing teams use Drive or Dropbox for files, Frame.io or chat apps for feedback, and a Google Sheet or Monday for status. Status goes stale, feedback gets lost, clients keep asking where their video is.

**Solution:** one workspace where every board row can be linked to a real file. When an editor uploads a new version, a client approves, or a client requests changes, the board updates itself.

**Users:**

| Persona | What they do | Pays |
|---|---|---|
| Agency owner | Buys the plan, sees everything | Yes |
| Project manager | Sets up projects and boards, tracks deadlines and revisions | Seat |
| Editor | Downloads raw files, uploads versions, resolves comments | Seat |
| Client reviewer | Watches, comments, approves, uploads raw footage | Free guest |
| Freelancer | Uses Pro plan alone | Yes |
| Brand | Owns projects, invites agencies (phase 3) | Yes |

**First customer:** Idyll Productions (video editing agency). Internal launch with Idyll and its clients first, public launch after.

---

## 2. Tech stack (use exactly this)

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript (strict), Tailwind CSS, shadcn/ui |
| Frontend data | TanStack Query for server state, Zustand for small client state |
| Tables (boards) | TanStack Table with virtualization (TanStack Virtual) |
| Uploads (browser) | Uppy with the AWS S3 multipart plugin, pointed at our API for signing |
| Video player | Custom React player on hls.js |
| Drawing on frames | HTML canvas overlay, shapes stored as JSON |
| Backend API | Go, chi router, pgx, sqlc for queries, goose for migrations |
| Database | PostgreSQL |
| Cache, queue, pub/sub | Redis; background jobs with asynq |
| Realtime | WebSockets from the Go API, Redis pub/sub so several API instances share events |
| Object storage | Cloudflare R2 (S3 compatible API) via aws-sdk-go-v2 |
| Video processing | Go worker calling FFmpeg and ffprobe |
| PDF processing | pdftoppm (poppler) in the worker |
| Email | Resend |
| Payments | Paddle Billing (merchant of record), webhooks into the API |
| Search | PostgreSQL full text search (tsvector) |
| Errors | Sentry (frontend and backend) |
| Local dev | Docker Compose: Postgres, Redis, MinIO (stands in for R2), Mailpit |
| Deploy | Docker images; frontend on Vercel or the same VPS; API and worker on a VPS (Hetzner or similar) |

Use the latest stable version of each.

---

## 3. Repository structure

```
/apps/web                Next.js frontend
/services/api            Go HTTP + WebSocket API
/services/worker         Go background worker (processing, emails, cleanup)
/services/shared         Go packages used by api and worker (db, storage, events, plans)
/db/migrations           goose SQL migrations
/db/queries              sqlc query files
/infra/docker-compose.yml
/infra/Dockerfile.api
/infra/Dockerfile.worker
/docs/DECISIONS.md
/docs/PROGRESS.md
/docs/API.md             generated or hand written endpoint reference
```

---

## 4. Environment variables

```
APP_URL=                     # https://app.playhead.app
API_URL=
DATABASE_URL=
REDIS_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT=                 # MinIO URL in local dev
SESSION_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_ENV=sandbox|production
SENTRY_DSN=
```

---

## 5. Core concepts

- **Company**: the paying account. Has a plan, seats, a storage pool, branding.
- **Member**: a user with a seat in a company. Role: owner, admin or member.
- **Guest**: an outside person (usually a client) invited by email. Free, no seat, sees only what is shared.
- **Project**: one client or job. Has a Media side and a Boards side.
- **Folder**: nested inside a project.
- **File**: a logical file that can have many versions.
- **File version**: the actual uploaded object (v1, v2, v3). Comments belong to a version.
- **Board**: a table inside a project. Rows are items (usually one video), columns are typed fields.
- **Share link**: a token that gives access to a project, folder or file without an account. A request files link is a share link that only allows uploading.
- **Event**: every meaningful action is written as an event. Events drive the activity feed, notifications, realtime updates and board automations.

A user can belong to several companies and switch between them. All data is scoped by `company_id`.

---

## 6. Roles and permissions

| Action | Owner | Admin | Member | Guest |
|---|---|---|---|---|
| Manage billing and plan | yes | no | no | no |
| Invite and remove members, change roles | yes | yes | no | no |
| Company settings and branding | yes | yes | no | no |
| Create projects | yes | yes | yes | no |
| See all projects | yes | yes | only projects they are added to, or projects set to "all members" | only shared items |
| Upload, rename, move, delete in a project | yes | yes | yes if they have project access | only with "can upload" access |
| Comment, reply, draw, resolve | yes | yes | yes | yes if comments allowed |
| Approve or request changes | yes | yes | yes | yes |
| Download originals | yes | yes | yes | only if allowed on the share |
| Create and edit boards | yes | yes | yes | no |
| View boards | yes | yes | yes | only boards shared with them |
| Edit board cells | yes | yes | yes | only columns marked guest editable on a shared board |

Project access levels stored per person: `view`, `comment`, `upload`, `edit`. Owners and admins always have full access to every project.

Implement permissions in one Go package (`authz`) with functions like `CanUploadToFolder(actor, folder) bool`. Handlers must call these; never inline role checks.

---

## 7. Plans, billing and limits

### 7.1 Plans

No free plan. New companies start a **14 day free trial**.

| Plan | Price per seat per month | Minimum seats | Storage included | Max file size |
|---|---|---|---|---|
| Trial (14 days) | $0 | 1 | 25 GB total | 5 GB |
| Pro | $15 | 1 | 250 GB per seat, pooled | 50 GB |
| Team | $25 | 3 | 500 GB per seat, pooled | 100 GB |
| Company | $40 | 5 | 1 TB per seat, pooled | 250 GB |
| Extra storage block | $35 per 1 TB per month | any paid plan | adds 1 TB to the pool | |

Annual billing = 10 times the monthly price (2 months free).

Store plan definitions in one Go file (`shared/plans/plans.go`) as constants so prices and limits are changed in one place. Paddle price IDs map to these plans.

### 7.2 Feature gates

| Feature | Trial | Pro | Team | Company |
|---|---|---|---|---|
| Projects, folders, uploads, review, versions | yes | yes | yes | yes |
| Share links with password and expiry | yes | yes | yes | yes |
| Boards (table view) | yes | yes | yes | yes |
| Board automations | yes | no | yes | yes |
| Request files links | yes | no | yes | yes |
| Version compare | yes | no | yes | yes |
| Project level permissions | yes | no | yes | yes |
| Preview quality | 1080p | 1080p | 1080p | 1080p |
| Branded share pages (logo, colour) | no | no | no | yes |
| Verified company badge | no | no | no | yes |
| "Made with Playhead" on share pages | yes | yes | yes | no |

Implement as `plans.Has(plan, feature) bool`. The frontend reads the company's feature list from `/me` and shows an upgrade prompt on locked features.

### 7.3 Storage accounting (must be exact)

- `companies.storage_limit_bytes` = plan storage x seats + storage blocks.
- `companies.storage_used_bytes` = sum of original file versions (not previews) that are not permanently deleted. Files in Trash still count until purged.
- `companies.storage_reserved_bytes` = bytes of uploads in progress.
- On upload start: in one transaction, check `used + reserved + new_size <= limit`. If not, refuse with error `storage_full`. Otherwise add to reserved.
- On upload complete: move bytes from reserved to used.
- On abort, or an upload not completed within 24 hours: release reserved bytes and delete incomplete multipart parts (cleanup job).
- On permanent delete: subtract from used.
- Optional per project cap: `projects.storage_cap_bytes`. Check it the same way.
- Nightly job recalculates `storage_used_bytes` from file_versions and logs any drift.
- Files uploaded by guests or through request links count against the company that owns the project.
- Notifications at 80% and 100% of the limit (once per crossing).
- At 100%: uploads refused. Viewing, commenting, downloading keep working.

### 7.4 Billing lifecycle (Paddle)

- Trial starts on company creation. Card collection at trial start is controlled by a setting (default: card required).
- Checkout opens Paddle overlay checkout from the Billing page. Seats and storage blocks are subscription quantities.
- Handle webhooks: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `transaction.completed`, `transaction.payment_failed`. Verify the signature. Make handlers idempotent (store processed event IDs).
- Trial ends unpaid: company becomes **read only** for 14 days (view and download only), with emails on day 0, 7 and 13. After that, **locked**. Files permanently deleted 30 days after lock, with warning emails at 14 and 3 days before.
- Payment failed: 7 day grace with a banner, then read only, then the same lock and delete timeline.
- Downgrade: allowed only if storage used fits the new limit; otherwise show how much to delete.
- Seat changes take effect immediately, prorated by Paddle. Removing a seat requires removing a member first.
- Guests never count as seats.

---

## 8. Database schema

All tables: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz`. Soft delete with `deleted_at` where Trash applies. Add indexes on every foreign key and on `(company_id, ...)` for list queries.

```
users(email unique, name, avatar_url, password_hash null, google_id null, email_verified_at)
sessions(user_id, token_hash, expires_at, user_agent, ip)
companies(name, slug unique, logo_key, brand_color, plan, status [trialing, active, past_due, read_only, locked],
          trial_ends_at, seats, storage_blocks, storage_limit_bytes bigint, storage_used_bytes bigint,
          storage_reserved_bytes bigint, verified bool, paddle_customer_id, paddle_subscription_id)
memberships(company_id, user_id, role [owner, admin, member], unique(company_id, user_id))
invites(company_id, email, role or guest, project_id null, token_hash, expires_at, accepted_at)
guests(company_id, email, name, user_id null)
projects(company_id, name, client_name, cover_key, visibility [all_members, restricted],
         storage_cap_bytes null, archived_at, deleted_at)
project_access(project_id, user_id null, guest_id null, level [view, comment, upload, edit])
folders(project_id, parent_id null, name, deleted_at)
files(project_id, folder_id null, name, kind [video, image, pdf, audio, other], status
      [uploading, processing, ready, failed], review_status [none, needs_review, changes_requested, approved],
      current_version_id, uploaded_by_user_id null, uploaded_by_guest_id null, locked bool, deleted_at)
file_versions(file_id, number int, r2_key, size_bytes bigint, mime, duration_ms, width, height, fps_num, fps_den,
              preview_status, hls_key_prefix, poster_key, sprite_key, waveform_key, page_count, uploaded_by, created_at)
uploads(company_id, file_version_id, r2_upload_id, size_bytes, parts_done, status, expires_at)
comments(file_version_id, parent_id null, author_user_id null, author_guest_id null, author_name, body,
         timecode_start_ms null, timecode_end_ms null, page null, x float null, y float null,
         drawing jsonb null, attachment_key null, resolved_at null, resolved_by, deleted_at)
reviews(file_version_id, actor, decision [approved, changes_requested], note, created_at)
share_links(company_id, target_type [project, folder, file], target_id, token_hash, mode [review, request_files],
            allow_comments, allow_download, latest_only, password_hash null, expires_at null,
            upload_limit_bytes null, uploaded_bytes bigint, require_identity bool, disabled_at, view_count)
share_visitors(share_link_id, name, email, first_seen_at, last_seen_at)
boards(project_id, name, position, deleted_at)
board_columns(board_id, name, type [text, number, status, person, date, file_link, checkbox, money, url, long_text,
              revisions], settings jsonb, position, guest_editable bool)
board_rows(board_id, position numeric, group_name, values jsonb, deleted_at)
row_files(row_id, file_id, unique(row_id, file_id))
board_shares(board_id, guest_id null, share_link_id null, can_edit bool)
row_messages(row_id, author, body, created_at)
events(company_id, project_id null, type, actor_user_id null, actor_guest_id null, target_type, target_id, payload jsonb)
notifications(user_id null, guest_id null, event_id, read_at, emailed_at)
notification_prefs(user_id, event_type, in_app bool, email [instant, digest, off])
subscriptions_log(company_id, paddle_event_id unique, type, payload jsonb, processed_at)
search_index(company_id, project_id, item_type, item_id, text tsvector)
```

---

## 9. Feature specifications with acceptance criteria

### 9.1 Authentication and onboarding

- Sign up with email + password (min 10 chars) or Google. Email verification link required before creating a company.
- Sessions: httpOnly, secure, SameSite=Lax cookie holding a random token; store only its hash. 30 day expiry, refreshed on use.
- Password reset by email link (1 hour expiry).
- Onboarding steps: (1) company name, logo optional, type of team (agency, freelancer, brand, media team); (2) invite team (emails + role, skippable); (3) create first project (name, client name optional). Land on the project's Media tab.
- Accepting an invite link: if logged out, sign up or log in first, then join and land on the shared item.
- Company switcher in the sidebar; last used company remembered.

Accept when: a new user can sign up, verify, create a company in trial, invite a teammate who joins, and both see the same project.

### 9.2 Team and guests

- Team page: members (name, email, role, last active, projects) and guests (name, email, projects shared).
- Invite member: email + role. Invite guest: email + project + access level.
- Change role, remove member (their uploads stay), remove guest access.
- Seat counter: "4 of 5 seats used". Inviting beyond seats prompts to add a seat (owners) or to ask an owner (admins).

### 9.3 Projects

- Projects page: grid and list. Card shows cover thumbnail, name, client, file count, size, member avatars, last updated.
- Create project: name, client name, members, visibility, optional template ("UGC monthly" creates folders Raw footage, Edits, Delivered and a board with default columns).
- Card menu: open, rename, share, archive, delete (to Trash 30 days).
- Filters: active, archived, mine. Sort: updated, name.

### 9.4 Media (folders and files)

- Breadcrumb navigation. New folder (inline name). Upload button and drag and drop anywhere on the page, including whole folders (keep structure).
- Grid view: thumbnail (hover scrubs through the sprite for videos), name, version badge, review status chip, comment count.
- List view: name, type, size, uploaded by, updated, status, comments.
- Multi select: move, copy, download (zip built by the worker, link emailed or shown when ready), share, delete.
- File menu: open, upload new version, rename, move, copy link, download, link to board row, version history, delete.
- Trash page per company: restore or delete forever. Auto purge after 30 days.
- Folders with 500+ items paginate with infinite scroll; thumbnails load lazily.

### 9.5 Uploads

Flow:
1. Browser (Uppy) calls `POST /uploads` with file name, size, mime, target folder, and optional `file_id` for a new version.
2. API checks permission, file size limit for the plan, storage quota (Section 7.3), creates `files` / `file_versions` / `uploads` rows, starts an R2 multipart upload, returns upload id and part size (16 MB).
3. Uppy requests signed URLs for batches of parts from `POST /uploads/{id}/parts`, uploads up to 4 parts in parallel directly to R2, retries failed parts.
4. Uppy calls `POST /uploads/{id}/complete` with part ETags. API completes the multipart upload, verifies size with a HEAD request, moves reserved bytes to used, sets status `processing`, enqueues `process_version` job, emits `file.uploaded` event.
5. Abort: `DELETE /uploads/{id}` aborts multipart and releases reserved bytes.

UI: an upload tray (bottom right) lists files with progress, speed, time left, pause, resume, cancel. Uploads continue while navigating inside the app. Resume after page refresh using Uppy's stored state. Warn before closing the tab while uploading.

Accept when: a 20 GB file uploads, survives a network drop and a page refresh, and storage counters are exact afterwards.

### 9.6 Processing (worker)

Job `process_version`:
- ffprobe: duration, width, height, frame rate, audio presence. Save to file_versions.
- Video: HLS output with renditions at 720p and 1080p (never above source resolution), H.264 + AAC, 4 second segments, keyframes aligned to segments. Poster at 10% of duration. Hover sprite: 1 frame every N seconds (max 100 frames) in one image plus a JSON map. Audio waveform JSON (peaks).
- Image: preview at max 2560px long edge (WebP) and thumbnail 480px.
- PDF: page images at 1600px wide per page, thumbnail of page 1, page count.
- Other types: no preview, generic icon.
- Save outputs under `previews/{company}/{file_version}/...`. These do not count toward customer storage.
- Set `preview_status=ready`, `files.status=ready`, emit `file.processed` (realtime update shows thumbnail).
- On failure: retry 3 times with backoff, then `failed`, notify uploader; the original can still be downloaded.
- Run at most N concurrent FFmpeg jobs per worker (config, default 2). Queue priority: smaller files first.

### 9.7 Review player

Layout: player area left, comments panel right (collapsible). On phones, comments go below the player.

Player:
- Play, pause, frame step (left and right arrows, uses fps), jump 5 seconds (J and L), speed 0.5x to 2x, loop a range, volume, fullscreen, quality (auto, 720p, 1080p), timecode display (HH:MM:SS:FF) with toggle to seconds.
- Timeline with comment markers (author avatars). Clicking a marker seeks and opens the comment.
- Keyboard: space play or pause, C focuses comment box (pauses video), arrows frame step.

Comments:
- Typing a comment pauses playback and stamps the current timecode. Option to set an in and out range.
- Drawing tools: pen, arrow, rectangle, colour picker, undo. Drawing saved as normalized coordinates (0 to 1) so it scales to any player size. Shown when the comment is active.
- Attach one reference image per comment.
- @mentions of members and guests on the project (notifies them).
- Replies (one level of threading), edit and delete own comments, resolve and reopen, copy link to comment (URL opens the player at that time).
- Filters: all, open, resolved, mine, by author. Sort by timecode or newest.
- Export comments: CSV and PDF with timecode, author, text, resolved state.
- Images: comments pinned to an x,y point. PDFs: comments pinned to page and x,y.
- New comments from others appear live (WebSocket).

Versions:
- Version dropdown (v1, v2, v3). Comments are per version. Upload new version from this screen.
- Compare: two versions side by side with synced play, pause and seek (Team and Company plans).

Review decisions:
- Buttons: **Approve** and **Request changes** (optional note).
- Approve: `review_status=approved`, file locked from new versions until someone with edit access reopens it, notify the uploader and project members, emit `file.approved`.
- Request changes: `review_status=changes_requested`, notify uploader with a link to open comments, emit `file.changes_requested`.
- New version uploaded: `review_status=needs_review`, emit `file.version_added`.

Playback security: HLS playlists are served by the API (`GET /files/{id}/versions/{v}/playlist.m3u8`) which checks access and rewrites each segment line to a presigned R2 URL valid for 2 hours. Originals download through a presigned URL valid for 15 minutes.

Accept when: a client on a share link can play a 1080p video within 2 seconds, comment at a frame with a drawing, and the editor sees it appear live on the exact frame.

### 9.8 Share links and request files

Share dialog on project, folder or file:
- **Invite people**: emails; members get access by role, others become guests with chosen level (view and comment, or can upload).
- **Review link** settings: allow comments, allow downloads, show latest version only, password, expiry date, require name and email before viewing.
- **Request files link** (folder only): upload limit in GB, expiry, password. Visitors can only upload into that folder; they cannot see other files.
- Links list: created by, created at, views, last opened, disable.

Public share page (no account needed):
- Company logo and colour on Company plan; otherwise Playhead header and "Made with Playhead" footer.
- File list or single file player, comments, Approve and Request changes.
- First comment or upload asks once for name and email, stored in a cookie for that link.
- Token is 32 random bytes, base64url; store only a hash. Rate limit password attempts (5 per 15 minutes per IP).

### 9.9 Boards

- A project can have many boards. New board: blank or template.
- Table view with virtualization (smooth with 5,000 rows).
- Column types: text, number, status (coloured options, editable list), person (members and guests), date, file link, checkbox, money (cents + currency), URL, long text, revisions (read only counter).
- Columns: add, rename, change type where safe, reorder (drag), hide, delete, set width.
- Rows: add (inline at bottom of group), drag reorder (fractional `position`), group by a status or text column, duplicate, delete (Trash).
- Inline cell editing with keyboard navigation (arrows, Enter, Tab, Escape) like a spreadsheet. Paste a block of cells from Google Sheets.
- Row detail side panel: all fields, linked files with thumbnails and review status, activity log, row chat.
- File link cell: pick files from this project; shows thumbnail, latest version number and review status live.
- Filter, sort, search within the board. Export CSV.
- Kanban view (group by status column) and Calendar view (by a date column): milestone 10.
- Share board: invite guest (read only, or edit only `guest_editable` columns) or view only link.
- Realtime: other users' cell edits appear within 1 second; last write wins per cell.

Default template "Video tracker" columns: Video (text), Status (status: Not started, Editing, Sent for review, Changes requested, Approved, Delivered), Editor (person), Due date (date), File (file link), Revisions (revisions), Notes (long text).

### 9.10 Board automations (Team and Company)

Built in, on by default for boards with a Status and File column. Rules listen to events:

| Event | Effect on every row linked to that file |
|---|---|
| `file.version_added` | Status = "Sent for review" |
| `file.changes_requested` | Status = "Changes requested", Revisions + 1 |
| `file.approved` | Status = "Approved" |
| Daily job: due date passed and status not Approved or Delivered | Row flagged overdue (red), assignee notified once |

Status values map by option name; if a board has no matching option, skip and log. Each automation change is written to the row's activity log as "Automation".

### 9.11 Notifications

- Events notified: new comment on my file, mention, reply to my comment, approval, changes requested, new version on a file I commented on, upload finished (request files link) , row assigned to me, due date tomorrow, storage 80% and 100%, trial and billing notices.
- In app: bell with unread count, list grouped by day, mark read, mark all read, click opens the item.
- Email: instant or daily digest (default: instant for mentions and decisions, digest for comments). Per event preferences in Settings.
- Guests get emails only (with a link back to the share page).
- Batch: several comments on the same file within 5 minutes become one email.

### 9.12 Dashboard (Home)

- Greeting and four stat cards: active projects, files waiting for review, due today, storage used. Each opens a filtered list.
- Storage ring: used vs limit, split by video, images, documents, other. Upgrade button.
- Waiting for review: files with `needs_review` or unresolved comments, newest first.
- Due this week: board rows with due dates in the next 7 days.
- Recent activity feed from events.
- New project and Upload buttons.

### 9.13 Search

- Global search box (Cmd or Ctrl + K). Searches project names, folder and file names, board row text values, and comment text within the current company and only what the user can access.
- Results grouped by type; a comment result opens the player at its timecode.

### 9.14 Settings and billing

- Profile: name, avatar, password, notification preferences.
- Company: name, logo, brand colour, default share link settings.
- Billing (owner only): plan, seats used vs paid, storage used vs limit, change plan, add or remove seats, buy or remove storage blocks, invoices (from Paddle), payment method (Paddle portal), cancel.
- Usage: storage per project table.
- Trash.

---

## 10. API endpoints (REST, JSON, all under `/api/v1`)

Auth: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/verify-email`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /me`.

Companies: `POST /companies`, `GET /companies`, `GET /companies/{cid}`, `PATCH /companies/{cid}`, `POST /companies/{cid}/switch`.

Team: `GET /companies/{cid}/members`, `PATCH /companies/{cid}/members/{uid}`, `DELETE /companies/{cid}/members/{uid}`, `GET /companies/{cid}/guests`, `DELETE /companies/{cid}/guests/{gid}`, `POST /companies/{cid}/invites`, `POST /invites/{token}/accept`.

Projects: `GET|POST /companies/{cid}/projects`, `GET|PATCH|DELETE /projects/{pid}`, `POST /projects/{pid}/archive`, `GET|PUT /projects/{pid}/access`.

Media: `GET /projects/{pid}/items?folder_id=&cursor=`, `POST /projects/{pid}/folders`, `PATCH|DELETE /folders/{fid}`, `GET|PATCH|DELETE /files/{id}`, `POST /items/move`, `POST /items/copy`, `POST /items/zip`, `GET /trash`, `POST /trash/{type}/{id}/restore`, `DELETE /trash/{type}/{id}`.

Uploads: `POST /uploads`, `POST /uploads/{id}/parts`, `POST /uploads/{id}/complete`, `DELETE /uploads/{id}`.

Playback and download: `GET /files/{id}/versions`, `GET /files/{id}/versions/{v}/playlist.m3u8`, `GET /files/{id}/versions/{v}/assets` (poster, sprite, waveform, pages URLs), `GET /files/{id}/versions/{v}/download`.

Comments and review: `GET|POST /versions/{vid}/comments`, `PATCH|DELETE /comments/{id}`, `POST /comments/{id}/resolve`, `POST /comments/{id}/reopen`, `GET /versions/{vid}/comments/export?format=csv|pdf`, `POST /versions/{vid}/review` (decision, note), `POST /files/{id}/reopen`.

Share: `GET|POST /share-links`, `PATCH|DELETE /share-links/{id}`; public: `GET /s/{token}`, `POST /s/{token}/unlock`, `POST /s/{token}/identify`, `GET /s/{token}/items`, comment and review endpoints mirrored under `/s/{token}/...`, `POST /s/{token}/uploads` (request files).

Boards: `GET|POST /projects/{pid}/boards`, `PATCH|DELETE /boards/{bid}`, `POST|PATCH|DELETE /boards/{bid}/columns[/{colid}]`, `GET|POST /boards/{bid}/rows`, `PATCH|DELETE /rows/{rid}`, `PATCH /rows/{rid}/cells/{colid}`, `POST /rows/reorder`, `POST|DELETE /rows/{rid}/files/{fileid}`, `GET|POST /rows/{rid}/messages`, `GET /boards/{bid}/export.csv`, `POST /boards/{bid}/share`.

Other: `GET /search?q=`, `GET /notifications`, `POST /notifications/read`, `GET|PUT /notification-prefs`, `GET /dashboard`, `GET /usage`, `POST /billing/checkout`, `GET /billing/portal`, `POST /webhooks/paddle`.

Errors: JSON `{ "error": { "code": "storage_full", "message": "..." } }` with correct HTTP status. Pagination: cursor based (`cursor`, `limit` max 100).

---

## 11. Realtime (WebSocket)

- Endpoint `GET /api/v1/ws`, authenticated by session cookie (or share token for public pages).
- Client subscribes to channels: `company:{cid}`, `project:{pid}`, `file:{fileid}`, `board:{bid}`, `user:{uid}`. Server verifies access on subscribe.
- Server pushes: `file.uploaded`, `file.processed`, `file.version_added`, `file.status_changed`, `comment.created`, `comment.updated`, `comment.resolved`, `row.created`, `row.updated`, `row.deleted`, `column.updated`, `notification.created`, `storage.updated`.
- Every write handler publishes its event to Redis; each API instance forwards to its connected sockets.
- Frontend updates TanStack Query caches from these messages; no full refetch.

---

## 12. Background jobs (asynq)

| Job | When |
|---|---|
| `process_version` | After upload completes |
| `zip_download` | Multi file download request |
| `send_email` / `send_digest` | On notification, daily digest at 9 AM in the user's time zone |
| `apply_automations` | On file review events |
| `overdue_rows` | Daily |
| `cleanup_uploads` | Hourly: abort expired multipart uploads, release reserved bytes |
| `purge_trash` | Daily: permanently delete items older than 30 days, delete R2 objects, update storage |
| `recalc_storage` | Nightly drift check |
| `billing_lifecycle` | Daily: trial ending emails, read only and lock transitions, deletion warnings |
| `search_index` | On create or update of searchable items |

---

## 13. UI and design guidelines

- Dark theme by default, light theme optional. Use CSS variables for colours.
- Layout based on the provided Figma: left sidebar, main content area, rounded cards, soft borders, blue accent.
- Sidebar order: company switcher, search, Home, Projects (with pinned and recent), Reviews, Boards (with My tasks), Team, then at the bottom Notifications, Settings, Help, storage meter, profile card.
- Project page: header with name, client, member avatars, Share button, and tabs Media and Boards.
- Status colours: Needs review (amber), Changes requested (red), Approved (green), In progress (blue), Not started (grey).
- Use skeleton loaders, optimistic updates for comments, cell edits, renames and moves.
- Empty states with one clear action (e.g. "Drop files here or click Upload").
- Toasts for success and errors. Confirm dialogs only for destructive actions.
- Accessibility: keyboard reachable controls, focus rings, aria labels on icon buttons, contrast AA.
- Responsive: full app usable on tablet; review and share pages fully usable on phones.

---

## 14. Non-functional requirements

| Area | Target |
|---|---|
| Page load | Dashboard and folder pages under 1.5 s on broadband |
| Large folders | 500 items open under 1 s |
| Playback start | Under 2 s |
| Realtime latency | Under 1 s |
| Upload speed | Limited by the user's connection only |
| Processing | Preview ready under 2 minutes for a 1 minute 1080p video |
| API p95 | Under 200 ms for non file endpoints |
| Uptime | 99.5% |
| Backups | Daily Postgres backups, kept 14 days, restore tested monthly |

Security:
- R2 bucket private. All access by presigned URLs with short expiry.
- Argon2id password hashing. Rate limits on login, signup, password reset, share passwords.
- CSRF protection for cookie based requests. Strict CORS (only APP_URL).
- Validate file names and sizes server side. Never trust client mime types for processing (use ffprobe).
- Audit log of sensitive actions (role changes, deletions, billing changes) via events.
- No secrets in the frontend. No file contents or passwords in logs.

---

## 15. Testing

- Go: unit tests for `authz`, `plans`, storage accounting, automations; integration tests for every handler against a test Postgres and MinIO.
- Frontend: component tests for player controls, comment box, board cells; Playwright end to end tests for: sign up to first upload, client review via share link, request changes then new version then approve with board updating, storage full refusal, trial expiry to read only.
- Seed script creating a demo company "Idyll Productions" with 3 projects, sample videos, comments and a board.

---

## 16. Build order (milestones)

Each milestone ends with working software, tests and an updated PROGRESS.md.

1. **Foundation**: monorepo, Docker Compose (Postgres, Redis, MinIO, Mailpit), Go API skeleton, migrations, Next.js app with layout, sidebar and theme, CI running tests.
2. **Auth and companies**: sign up, login, Google, verify email, sessions, onboarding, company switcher, members, invites, roles, `authz` package.
3. **Projects and folders**: CRUD, access levels, Trash, projects page, Media page (grid and list) with empty states.
4. **Uploads**: multipart upload flow, quota reservation, upload tray, resume, cleanup job.
5. **Processing**: worker, FFmpeg pipeline, images, PDFs, thumbnails, realtime status updates.
6. **Review player**: HLS playback with signed playlists, timecode comments, drawing, replies, resolve, mentions, versions, approve and request changes.
7. **Sharing**: share dialog, review links, request files links, public share pages, guest identity.
8. **Boards**: board CRUD, columns, rows, inline editing, row panel, file links, CSV export, board sharing.
9. **Events, automations and notifications**: event stream, automations, in app and email notifications, preferences, dashboard, activity feed.
   **Internal launch with Idyll Productions after milestone 9.**
10. **Billing and plans**: Paddle checkout and webhooks, trial lifecycle, feature gates, seats, storage blocks, usage page.
11. **Polish for public launch**: version compare, kanban and calendar views, global search, comment export, Company plan branding and verified badge, performance pass, security review.
    **Public launch after milestone 11.**

---

## 17. Out of scope for version 1

- Editing video in the browser
- Native mobile apps
- Premiere Pro, After Effects and DaVinci Resolve panels
- Audio and design file (PSD, Figma) review
- Connected companies (a brand inviting an agency into its own account)
- Custom automations builder, public API, SSO
- Time tracking, invoicing, payroll

These are phase 3. Design the schema so they can be added without rewrites (for example, keep `company_id` on every row and keep automations event driven).

---

## 18. Open questions (ask the founders before deciding)

1. Final domain (playhead.app, playhead.video, getplayhead.com or useplayhead.com).
2. Card required at trial start: default yes, confirm.
3. Default revision limit shown on new boards (Idyll uses 3).
4. Updated Figma screens matching this structure.
5. Hosting provider and region for the API and database.
