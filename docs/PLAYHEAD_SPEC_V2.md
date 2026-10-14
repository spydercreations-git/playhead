# Playhead: Specification Version 2 (Internal Workspace)

Prepared by Harsh and Rohit
October 2026

**This file is the current plan.** Where it conflicts with `docs/PLAYHEAD_BUILD_SPEC.md`, this file wins. `docs/PROJECT_WORKSPACE.md` still applies for the project page look, file cards and the video player layout.

---

## 0. Instructions to the coding agent

1. Keep everything built in Milestones 1 and 2: stack, login, sessions, company, team, design tokens, logo, Makefile.
2. Playhead is **internal for now**: the Idyll Productions team and the clients we add. No public sign up, no billing. Disable the public sign up page; people get in only when added by email.
3. Old milestones 3 to 11 are **replaced** by Section 13. Paused: billing and Paddle, boards and automations.
4. Build in the order of Section 13: plan, wait for approval, build, test, check in the browser, push to GitHub, update `docs/PROGRESS.md`.
5. **Permissions are the core of this product** (Section 4). Every API call, download, share link and live editing connection checks them. Every rule has a test proving a person without access is refused.
6. **Speed is the other core**: uploads and downloads go directly between the browser and storage, in parallel parts, resumable (Section 7).
7. References: Google Drive (files and sharing), Google Docs (documents), Google Sheets (spreadsheets), Frame.io (video review). Copy behavior and layout only. Never copy their logos, colors, icons or wording.
8. Small decisions this spec leaves open: pick the most Google Drive or Frame.io like option and record it in `docs/DECISIONS.md`.

---

## 1. The problem and what Playhead does

Clients send footage through Google Drive, WeTransfer, Dropbox and others. The team downloads from each place, re-uploads, and loses track of files, feedback and status.

**Playhead puts it all in one place:** every client, every project, every file, every comment and every tracking sheet, with clear permissions on everything.

Version 1 includes: clients, projects, unlimited folders and files of any type, fast uploads and downloads, file and folder counts, Frame.io style video review with versions and approval, documents, spreadsheets with an automatic project tracker, share links, and permissions on everything.

---

## 2. People and roles

### 2.1 Team roles (company level)

| Role | What they can do |
|---|---|
| **Admin** | Everything: team, settings, all clients, all projects, all files |
| **Manager** | Add and edit clients, create projects, assign people to projects, sees all clients and projects |
| **Editor** | The video editors. See **only projects assigned to them**, with the access level they were given. Cannot add clients or projects |

Admins manage the team on the Team page: invite by email, choose a role, change role, remove.

### 2.2 Clients and outside people

| Person | How they get in | What they see |
|---|---|---|
| **Client contact** | Added on a client's page, or to a project, by email | Only projects, folders and files they were given access to |
| **Share link visitor** | Opens a share link, no account | Only what that link shares, with that link's settings |

### 2.3 Sign in

- Team: email and password (from Milestone 2), Google, or 6 digit email code.
- Clients: Google or a 6 digit code sent by email (valid 10 minutes, 5 tries, rate limited, stored only as a hash).
- Only emails that are team members, client contacts or have been given access can sign in. Anyone else sees: "This email doesn't have access to Playhead yet. Ask the person who invited you."

---

## 3. Structure

```
Company (Idyll Productions)
└── Client (unlimited)
    ├── Contacts (names + emails)
    └── Project (unlimited per client)
        ├── Tracker sheet (created automatically)
        └── Folders (unlimited, any depth)
            └── Files (unlimited): video, audio, images, PDFs, documents,
                spreadsheets, project files, zips, anything
```

- Every project belongs to one client. Every item belongs to one project.
- No limits on number of clients, projects, folders or files (only the storage space of the server).

### 3.1 Counts (shown everywhere)

- **Folder**: "12 files · 3 folders · 4.2 GB", counting everything inside it at any depth.
- **Project header**: total files, folders, videos and size, for example "148 files · 22 folders · 96 videos · 312 GB".
- **Client page**: number of projects and total size.
- Counts update live when files are added, moved or deleted. Keep counters in the database (updated in the same transaction as each change), never by scanning all files on page load.

---

## 4. Permissions

### 4.1 Access levels

Used for every project, folder and file. Called **access levels** to avoid confusion with the **Editor** team role.

| Level | View and play | Comment | Upload files and new versions, create folders | Rename, move, delete, edit docs and sheets | Share and manage access |
|---|---|---|---|---|---|
| **Viewer** | yes | no | no | no | no |
| **Commenter** | yes | yes | no | no | no |
| **Uploader** | yes | yes | yes | only their own uploads | no |
| **Full access** | yes | yes | yes | yes | yes |

Plus one switch on every grant: **Can download** (on by default). When off, the person can watch and view but download buttons are hidden and download links are refused by the server.

### 4.2 Where access comes from

A person's access is the **highest** level from any of these:

1. **Team role**: Admins and Managers have Full access to everything. Editors have nothing until assigned.
2. **Project assignment**: people added to a project (team Editors or client emails) get their level on everything inside it.
3. **Folder share**: applies to everything inside the folder, at any depth, including files added later.
4. **File share**: applies to one file (one or many files at once when shared together).
5. **Client contact default**: on the client page each contact has "Access to all projects of this client": None (default), Viewer, Commenter, Uploader or Full access. If set, it applies to every current and future project of that client.

### 4.3 Inheritance rules (like Google Drive)

- Access flows down. It can be raised lower down (Viewer on a project, Uploader on its "Raw footage" folder), never lowered below what is inherited.
- Moving an item gives it the new folder's access and removes access from the old folder. If this changes who can see it, confirm first: "Moving 'Ad 3.mp4' will change who has access. 2 people will lose access. Move anyway?"
- A person with access to a file but not its folder finds it under **Shared with me**. Breadcrumbs only show parts they can open.
- Download permission: the strictest "Can download" from the grant that gives the person their level applies.

### 4.4 Assigned projects for Editors

- When a Manager or Admin adds a team Editor to a project, it appears in that Editor's **Projects** page and on their **Home** under "My projects" with counts: "Everygen · October UGC · 12 videos · 3 waiting for review".
- Editors never see clients or projects they are not assigned to, including in search.

### 4.5 Enforcement

- One Go package (`authz`) answers `Access(person, item) -> {level, canDownload}`. Every handler uses it. No inline role checks.
- Lists and search return only what the person can open. Never send hidden items to the browser.
- Signed storage URLs are created only after the check, and expire (playback 2 hours, downloads 15 minutes).
- Comment visibility "Team only" (Section 6.9) is never sent to clients or share link visitors.
- Live editing connections for documents and sheets check access before opening; Viewers, Commenters and Uploaders get read only connections.
- When access is removed, open sessions and live connections lose it within 5 seconds.
- Return 404 (not 403) when the person should not know the item exists.

---

## 5. Navigation

### 5.1 Main sidebar (left)

1. Playhead logo
2. **+ New** button (primary). Menu: Client (Admins and Managers), Project (Admins and Managers), Folder, Upload files, Upload folder, Document, Spreadsheet. Items that need a location open a small picker for project and folder; the current one is preselected.
3. Search (Cmd or Ctrl + K)
4. **Home**
5. **Clients** (Admins and Managers)
6. **Projects** (everyone: shows only what they can open)
7. **Reviews** (videos waiting for review or with new comments, across the person's projects)
8. **Shared with me**
9. **Starred**
10. **Trash**
11. Bottom: **Team** (Admins), **Settings**, storage used (Admins), profile card with sign out

### 5.2 Top bar

Breadcrumb on the left (`Clients / Everygen / October UGC / Edits`), upload progress icon, notification bell, profile picture on the right.

---

## 6. Screens and every button

### 6.1 Home

- Quick actions: **Upload**, **New folder**, **New document**, **New spreadsheet**.
- **My projects**: cards for projects the person is on, with counts and "waiting for review" number. Click opens.
- **Waiting for review**: newest videos with status Needs review or new comments.
- **Recent**: last 20 items opened or edited.

### 6.2 Clients list (Admins and Managers)

- Header: "Clients", search, view toggle (list or grid), **New client** (top right, primary).
- Columns: Client (logo or initials + name), Contacts, Projects, Total size, Last activity. Click a column header to sort. Default: last activity.
- Hover a row: **⋯** at the right end. Menu: Open, Rename, Edit details, Delete. Right click shows the same menu.
- Empty state: "No clients yet" with **New client**.

### 6.3 New client and Edit client dialog

- Fields: Client name (required), Website, Notes, Logo.
- **Contacts**: rows of Name, Email, "Access to all projects" (None, Viewer, Commenter, Uploader, Full access; default None), Can download checkbox, remove (x). **Add contact** adds a row. Checkbox "Email them about their access" (default on).
- Buttons: Cancel, **Create client** or **Save**.
- Rename from the menu edits inline: Enter saves, Escape cancels.
- Delete: "Delete Everygen and its 4 projects? Everything moves to Trash for 30 days." Type the client name to enable **Delete**. Admins only.

### 6.4 Client page

- Header: logo, name, website link, counts ("6 projects · 1.2 TB"), **Edit** button, **⋯** (Rename, Delete).
- Tabs: **Projects**, **Contacts**, **Notes**.
- Projects tab: project cards with counts and **New project** (client preselected). "Show archived" toggle.
- Contacts tab: name, email, access to all projects dropdown (saves instantly), Can download, signed in yet or not, remove. **Add contact** button.
- Notes tab: one note about the client, using the document editor.

### 6.5 Projects list

- Header: "Projects", search, **Client** filter dropdown, **Status** filter (Active, Archived), **Assigned to** filter (Admins and Managers), view toggle, **New project** (Admins and Managers).
- Columns or cards: Project, Client, Files, Videos, Waiting for review, Size, Members (avatars), Last activity.
- **⋯**: Open, Rename, Copy link, Share, Archive, Delete.

### 6.6 New project dialog (Admins and Managers)

- Project name (required).
- **Client** dropdown with search; last option **+ Create new client** opens the client dialog and returns with it selected.
- **People**: add team Editors (pick from list) and client emails (contacts of the chosen client are suggested), each with access level (default: team Editors Full access, clients Commenter) and Can download.
- Template: **Blank** or **Video project** (folders: Briefs, Raw footage, Edits, Deliverables).
- Buttons: Cancel, **Create project**. Creates the project, the folders from the template, and the **Tracker** sheet (Section 6.11). Opens the project.

### 6.7 Project page

Follow the layout in `docs/PROJECT_WORKSPACE.md` (project sidebar with folder tree, toolbar, folder cards, file cards), with these specifics:

**Header**
- Left: project name (rename if Full access), client name (link), counts ("148 files · 22 folders · 312 GB").
- Right: member avatars (click opens **People and access**), **Copy link**, **Share** (primary).

**Action row**, left to right:
1. **Upload** (menu: Files, Folder)
2. **New folder**
3. **New document**
4. **New spreadsheet**
5. Type filter: **All**, **Videos**, **Audio**, **Images**, **Documents**, **Spreadsheets**, **Other**
6. Right side: Sort (Name, Date added, Last modified, Size, Type, Review status), view toggle (Grid, List)

Buttons only show if the person's access allows them. Viewers and Commenters see no Upload or New buttons.

**Project sidebar**: folder tree (any depth, counts on hover), then **Tracker** and other sheets and documents pinned under "Sheets and docs", then **Share links**, then **Recently deleted**.

**File area**: folders first, then files. Grid shows thumbnails; list shows Name, Type, Size, Uploaded by, Date, Review status, Comments.

- Single click selects. Double click opens: folders open in place, videos and other files open the viewer (6.8, 6.9), documents and sheets open in a new tab.
- Right click or **⋯** on an item: Open, Open in new tab, Copy link, Share, Download, Rename, Move to, Make a copy, Upload new version (files), Star, Details, Delete.
- **Multiple select**: click checkboxes, Shift click, Cmd or Ctrl click, or drag a box. A selection bar appears: "5 selected · 3.4 GB", **Share**, **Copy link**, **Download**, **Move to**, **Delete**, **x** to clear. Shared together, they appear in the link as one list.
- Drag items onto a folder (in the grid or the tree) to move them.
- Drag files or whole folders from the computer anywhere on the page to upload into the current folder, keeping folder structure.
- Keyboard: Delete moves to Trash, F2 renames, Enter opens, Cmd or Ctrl + A selects all, Space previews.
- Empty folder: "Drop files here" with Upload and New folder buttons.

### 6.8 File viewer (non video)

Opens over the project page.
- Top bar: back arrow, file name, version selector (if versions), previous and next arrows (files in the folder), **Download** (if allowed), **Copy link**, **Share**, **⋯** (Rename, Move to, Upload new version, Details, Delete).
- Audio: player with waveform; comments at timestamps like video.
- Images: zoom and pan; comments pinned to a point on the image.
- PDFs: page by page; comments pinned to a page and point.
- Text and code: shown as text.
- Word, Excel, CSV: preview plus **Open as Playhead document** or **Open as Playhead spreadsheet** (makes an editable copy).
- Anything else: file icon, name, size, **Download**.
- Right panel: **Comments** and **Details** (size, type, uploaded by, date, version, location, activity).

### 6.9 Video review (Frame.io style)

Layout and controls follow section 4 of `docs/PROJECT_WORKSPACE.md`: video on the left, comments on the right.

- **Player**: play, pause, frame step, speed, loop, volume, quality, fullscreen, timecode, timeline with comment markers.
- **Comments**: typing pauses the video and stamps the exact time; optional time range; draw on the frame (pen, arrow, box, color); attach an image; mention people; replies; resolve; edit and delete own.
- **Visibility** on each comment: **Everyone** or **Team only**. Team only comments are never shown to clients or link visitors.
- **Versions**: uploading a new cut onto the file (Upload new version, or drop a file on it) makes v2, v3. Version dropdown in the top bar. Comments belong to each version. **Compare** shows two versions side by side, synced.
- **Approval**: **Approve** and **Request changes** buttons in the top bar for anyone with Commenter or above. Status chip on the file: Needs review (new version uploaded), Changes requested, Approved. Approved locks new versions until someone with Full access reopens it. Each decision notifies the uploader and project members.
- Export comments to PDF or CSV for editors.

### 6.10 Documents (Google Docs style)

Opens at `/d/{id}`. Same as the document editor described previously:
- Top bar: back, title (rename), star, location, save status ("Saved", "Saving...", "Offline, changes will sync"), avatars of people in the document, comment history, **Share**.
- Menus: File (New, Make a copy, Move, Rename, Download PDF/Word/Markdown, Version history, Print, Delete), Edit, View, Insert (image, table, link, line, checklist, comment), Format.
- Toolbar: undo, redo, style (Normal, Title, H1 to H3), font size, bold, italic, underline, text and highlight color, link, comment, image, align, line spacing, lists, checklist, indent, clear formatting. Right: Editing or Viewing mode.
- White page centered on the dark app; outline panel from headings; everyone's cursor in their color with name.
- Comments beside the text: reply, resolve, mentions.
- Version history with restore; automatic versions every 10 minutes of editing.
- Live editing together (Section 8). Only Full access can edit; others read only.

### 6.11 Spreadsheets (Google Sheets style) and the project Tracker

Opens at `/s/{id}`.
- Top bar same as documents.
- Menus: File (New, Make a copy, Import Excel/CSV, Download Excel/CSV, Version history, Print, Delete), Edit, View (freeze, gridlines, formula bar, zoom), Insert (rows, columns, sheet, checkbox, dropdown, comment, link), Format (number formats, bold, italic, strikethrough, colors, borders, merge, align, wrap, conditional formatting), Data (sort, filter, dropdown lists).
- Toolbar, formula bar (cell box + `fx`), grid with resize, fill handle, right click menu, sheet tabs at the bottom (+, rename, duplicate, color, delete).
- Formulas: operators, relative and absolute references, ranges, other sheets; functions SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF, IF, IFS, IFERROR, AND, OR, NOT, ROUND, ABS, CONCATENATE, TEXT, LEN, LEFT, RIGHT, MID, UPPER, LOWER, TRIM, TODAY, NOW, DATE, DAYS, VLOOKUP, XLOOKUP, INDEX, MATCH, UNIQUE, SORT, FILTER. Errors explained on hover.
- Smooth with 10,000 rows by 50 columns. Paste from Google Sheets and Excel keeps values, formulas and basic formatting.
- Live editing together; everyone's selected cell shown in their color.

**Tracker sheet (created with every project)**
- Named "Tracker", pinned at the top of the project sidebar.
- Columns: Video, File (link to the file in Playhead), Editor (dropdown of project members), Status (dropdown: Not started, Editing, Needs review, Changes requested, Approved, Delivered, each with a color), Due date, Revisions, Notes.
- Status colors use conditional formatting so they show like chips.
- In a later milestone, review actions can update the Tracker automatically; in version 1 it is updated by hand.

### 6.12 Copy link and Share

**Copy link** (any project, folder, file, or selection): copies the Playhead link. It works only for people who already have access. Toast: "Link copied. Only people with access can open it."

**Share** opens a dialog with two tabs:

**Tab 1: People** (like Google Drive)
- "Add people" input: emails (several at once), suggestions from team and client contacts. Access level dropdown (Viewer, Commenter, Uploader, Full access) and **Can download** checkbox.
- Notify checkbox, optional message, **Send**.
- People with access: each with level dropdown (and Remove). Inherited access in grey with its source ("Commenter, from project 'October UGC'", "Full access, Manager") and **Manage** link; cannot be lowered here.

**Tab 2: Share link** (for people without an account, like Frame.io)
- **Create link** button. Settings per link:
  - Link name (default: item name and date)
  - Access: **View only**, **View and comment**, **Upload only** (folders only: visitors can drop files in but not see others), **View, comment and upload**
  - **Allow download** (on or off)
  - **Show latest version only** (on by default)
  - **Password** (optional)
  - **Expires** (optional date)
  - **Ask visitors for name and email** (on by default; required to comment or upload)
  - **Upload size limit** (for upload links)
- **Copy link** button next to each created link, view count, last opened, **Disable**.
- A project's sidebar lists all its share links; **All share links** shows every link the company made.

**Share link page** (what visitors see): Idyll Productions logo, the shared items (list or single viewer), the video review screen for videos with Approve and Request changes if commenting is allowed, Download buttons only if allowed, an upload drop zone for upload links. Team only comments never shown. Link tokens are long random values stored only as hashes; password tries rate limited.

### 6.13 People and access (project)

Opened from the avatars in the project header. Lists team Editors and client people on the project with their level and Can download; **Add people** button; change or remove. Managers and Admins appear as "Full access (Manager)".

### 6.14 Shared with me, Starred, Reviews, Trash

- **Shared with me**: items shared directly whose parent the person cannot open.
- **Starred**: everything the person starred.
- **Reviews**: videos across the person's projects with status Needs review or unresolved comments, filter by project and status.
- **Trash**: 30 days. Name, original location, deleted by, date. **Restore**; **Delete forever** (Admins and the item's uploader); **Empty trash** (Admins).

### 6.15 Search and notifications

- Search names of clients, projects, folders, files, plus document text, sheet cells and comment text, only within what the person can open. Results grouped by type, with filters.
- Notification bell and email for: shared with you, assigned to a project, mention, reply, new comment on your upload, new version uploaded, approved, changes requested, files uploaded through your share link. Per event settings.

---

## 7. Fast uploads and downloads

**Uploads**
- Browser uploads straight to storage (Cloudflare R2) using signed multipart URLs. The API only signs; file bytes never pass through it.
- Parts of 16 to 64 MB (bigger parts for bigger files), **6 parts in parallel**, automatic retry of failed parts.
- Many files at once: upload 3 files in parallel, queue the rest.
- Resume after a dropped connection or page refresh.
- Upload tray: each file's progress, speed, time left, pause, resume, cancel; overall progress. Warn before closing the tab.
- Max file size: 100 GB.

**Downloads**
- Single files: signed URL straight from storage through Cloudflare's network. Supports resume and seeking.
- Many files or folders: the worker builds a zip in the background and streams it to storage; the person gets a notification and a download link. For selections under 2 GB, start the zip download right away by streaming.

**Playback**
- Videos start fast using preview copies (HLS at 720p and 1080p) made by the worker after upload, as in section 9.6 of the main spec. Until the preview is ready, play the original if the browser supports it.

**Targets**: uploads and downloads limited only by the person's internet speed; a 1080p video starts playing in under 2 seconds; a folder with 1,000 files opens in under 1 second.

---

## 8. Live editing (documents and sheets)

- Documents and sheets are stored as **Yjs** documents so several people can edit at once without overwriting each other.
- One small **Node.js collaboration service** (`/services/collab`) running **Hocuspocus**, started by `make dev`, served at `/collab`.
- On connect, it asks the Go API (internal endpoint with a shared secret) for the person's access. No access: refuse. Not Full access: read only.
- Saves to Postgres at most every 2 seconds and when the last person leaves; saves plain text for search.
- Short offline periods: edits kept in the browser and synced on reconnect.
- Documents use **Tiptap** with free open source extensions only.
- Spreadsheets: in the spreadsheet milestone plan, compare 2 or 3 spreadsheet engines that are free for commercial use (no paid license, no watermark), work with Yjs, and support the formulas in 6.11. Do not use Univer's paid collaboration features or any library needing a commercial license. Recommend one and wait for approval.

---

## 9. Data model (new and changed)

UUID ids, `created_at`, `updated_at`, `company_id` on every row, soft delete with `deleted_at` where Trash applies.

```
memberships.role                 [admin, manager, editor]
clients(company_id, name, website, notes_item_id, logo_key, created_by, deleted_at)
client_contacts(company_id, client_id, name, email, default_level [none, viewer, commenter, uploader, full],
                can_download bool, user_id null, last_signed_in_at, unique(client_id, email))
projects(company_id, client_id not null, name, status [active, archived], tracker_item_id,
         file_count, folder_count, video_count, total_bytes, created_by, deleted_at)
items(company_id, project_id, parent_id null, kind [folder, file, document, spreadsheet], name,
      position numeric, created_by, file_count, folder_count, total_bytes,   -- counts for folders
      review_status [none, needs_review, changes_requested, approved], locked bool,
      deleted_at, deleted_by, original_parent_id)
file_versions(item_id, number, storage_key, size_bytes, mime, duration_ms, width, height, fps,
              preview_status, preview_keys jsonb, uploaded_by)
documents(item_id, ydoc_state bytea, text_content)
spreadsheets(item_id, ydoc_state bytea, text_content)
grants(company_id, target_type [project, item], target_id, email, user_id null,
       level [viewer, commenter, uploader, full], can_download bool, granted_by,
       unique(target_type, target_id, email))
share_links(company_id, project_id, name, token_hash, access [view, comment, upload, comment_upload],
            allow_download, latest_only, password_hash, expires_at, ask_identity, upload_limit_bytes,
            uploaded_bytes, view_count, last_opened_at, disabled_at, created_by)
share_link_items(share_link_id, item_id)
share_visitors(share_link_id, name, email, first_seen_at, last_seen_at)
comments(company_id, item_id, version_id null, parent_id null, author_user_id null, author_visitor_id null,
         body, visibility [everyone, team], timecode_start_ms, timecode_end_ms, page, x, y, drawing jsonb,
         anchor jsonb, attachment_key, resolved_at, resolved_by, deleted_at)
reviews(item_id, version_id, actor, decision [approved, changes_requested], note)
item_versions(item_id, ydoc_snapshot, name, created_by)        -- documents and sheets
stars(user_id, item_id); recent_items(user_id, item_id, last_opened_at)
activity(company_id, project_id, item_id, actor, action, details jsonb)
notifications(user_id, type, payload jsonb, read_at, emailed_at)
login_codes(email, code_hash, expires_at, attempts)
uploads(...)  -- as in the main spec, with item_id
```

- Grants are stored by email, so access works before someone's first sign in.
- Folder and project counts are updated in the same transaction as every add, move, delete and restore, walking up the parent chain. A nightly job recounts and logs any difference.
- A move can never put a folder inside itself or its own children.

---

## 10. API outline (under `/api/v1`)

Clients and contacts: `GET|POST /clients`, `GET|PATCH|DELETE /clients/{id}`, `GET|POST /clients/{id}/contacts`, `PATCH|DELETE /contacts/{id}`.
Projects: `GET|POST /projects`, `GET|PATCH|DELETE /projects/{id}`, `POST /projects/{id}/archive`, `GET|POST|PATCH|DELETE /projects/{id}/people`.
Items: `GET /projects/{id}/items?parent_id=&type=&sort=`, `POST /items`, `GET|PATCH|DELETE /items/{id}`, `POST /items/move`, `POST /items/copy`, `GET /items/{id}/path`, `GET /items/{id}/counts`.
Uploads: `POST /uploads`, `/uploads/{id}/parts`, `/uploads/{id}/complete`, `DELETE /uploads/{id}`; new versions with `item_id`.
Downloads: `GET /items/{id}/download?version=&format=`, `POST /downloads/zip`, `GET /downloads/{id}`.
Review: `GET /items/{id}/versions`, `GET /items/{id}/versions/{v}/playlist.m3u8`, `GET|POST /items/{id}/comments`, `PATCH|DELETE /comments/{id}`, `POST /comments/{id}/resolve|reopen`, `POST /items/{id}/review`, `POST /items/{id}/reopen`, `GET /items/{id}/comments/export`.
Access: `GET /items/{id}/access`, `GET /projects/{id}/access`, `POST /grants`, `PATCH|DELETE /grants/{id}`, `POST /items/{id}/request-access`.
Share links: `GET|POST /share-links`, `PATCH|DELETE /share-links/{id}`; public `GET /s/{token}`, `POST /s/{token}/unlock`, `POST /s/{token}/identify`, `GET /s/{token}/items`, comments, review, download and upload under `/s/{token}/...`.
Lists: `GET /home`, `GET /reviews`, `GET /shared-with-me`, `GET|POST|DELETE /stars`, `GET /trash`, `POST /trash/{id}/restore`, `DELETE /trash/{id}`, `GET /search`, `GET /notifications`.
Auth: `POST /auth/code/send`, `POST /auth/code/verify`, Google sign in.
Internal (collab service only): `POST /internal/collab/authorize`, `POST /internal/collab/store`.

---

## 11. Design notes

- Follow the design tokens, `/design` files and `docs/PROJECT_WORKSPACE.md`.
- File type icons: folder, video, audio, image, PDF, document (blue), spreadsheet (green), archive, generic.
- Loading skeletons, empty states with one action, error states with **Try again**.
- Toasts with **Undo** for move, rename and delete.
- Confirm dialogs only for: delete client, delete project, delete forever, moves that change access.

---

## 12. Not in version 1

Billing and public sign up, boards and automations, automatic Tracker updates from reviews, suggestion mode in documents, charts and pivot tables in sheets, desktop sync app, mobile apps.

---

## 13. Milestones (replace old 3 to 11)

| # | Milestone | Includes |
|---|---|---|
| P1 | Roles, clients, projects | Team roles Admin, Manager, Editor; disable public sign up; email code and Google sign in for known emails; clients list, client dialog with contacts, client page; projects list; new project dialog with client dropdown, people and template; project people and access dialog; Editors see only assigned projects |
| P2 | Files, folders, fast upload and download | Items, project page per `PROJECT_WORKSPACE.md`, folder tree, unlimited nesting, counts (Section 3.1), create, rename, move, copy, star, delete, Trash, multiple select, fast parallel resumable uploads of any type and whole folders, downloads and zips, file viewer for non video files |
| P3 | Permissions and sharing | `authz.Access`, access levels and Can download, inheritance, client contact defaults, Share dialog People tab, Copy link, share links with all settings, share link page, Shared with me, move confirm, full permission test suite |
| P4 | Video review | Processing worker and HLS previews, player, timestamp comments, drawing, Team only comments, versions and compare, Approve and Request changes, review status, Reviews page, comment export, audio and image comments |
| P5 | Documents | Collab service, Tiptap editor, live editing, cursors, comments, version history, export and import |
| P6 | Spreadsheets and Tracker | Engine comparison and approval first, then editor, live editing, formulas, import and export, automatic Tracker sheet in every project |
| P7 | Search, notifications, polish | Search across names and contents, notifications in app and email, client Notes, performance check against Section 7 targets, security review. **Internal launch for the Idyll team and clients after P7.** |
