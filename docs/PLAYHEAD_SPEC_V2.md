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
7. **Strict UI Rule (Every Milestone)**: All UI must match `design/01-project-folder-view.svg` (and `.png`), `Dashboard.svg`, and the design tokens. **No gradients, glows, emojis, or placeholder text.** After each milestone, capture and save screenshots of all new screens in `docs/screenshots/<milestone>/`. In Milestone P3, adjust the P2 project page to match `01-project-folder-view.svg` exactly.
8. **Card Shapes (Everywhere)**: Follow physical card silhouettes (Section 3.2): tabbed folders with 1 large + 2 small previews; folded-corner documents with paper preview and blue `DOC` label; spreadsheets with dark grid preview, green header row, colored status cells, hanging sheet tabs, and green `SHEET` label. Real metadata only: name, project, last editor & relative time ("Rik · 20m ago"), and collaborator avatars.
9. References: Google Drive (files and sharing), Google Docs (documents), Google Sheets (spreadsheets), Frame.io (video review). Copy behavior and layout only. Never copy their logos, colors, icons or wording.
10. Small decisions this spec leaves open: pick the most Google Drive or Frame.io like option and record it in `docs/DECISIONS.md`.
11. **Typography**: Inter everywhere (weights 400 to 700 via next/font/google), tabular figures for timecodes, sheet numbers, and counters. Plus Jakarta Sans removed.

---

## 1. The problem and what Playhead does

Clients send footage through Google Drive, WeTransfer, Dropbox and others. The team downloads from each place, re-uploads, and loses track of files, feedback and status.

**Playhead puts it all in one place:** every client, every project, every file, every comment and every tracking sheet, with clear permissions on everything.

Version 1 includes: clients, projects, unlimited folders and files of any type, fast uploads and downloads, file and folder counts, Frame.io style video review with versions and approval, documents, spreadsheets with an automatic project tracker, share links, custom roles, notification settings, and permissions on everything.

---

## 2. People, custom roles, and permissions

### 2.1 Team roles and custom RBAC (company level, built in P3)

Playhead uses a database-driven custom roles engine:
- Table `roles(id, company_id, name, color, permissions jsonb, is_system, created_at, updated_at)`.
- Memberships reference a role (`memberships.role_id`).
- **Granular Permissions (17 total)**:
  - Clients: `clients.view_all`, `clients.create`, `clients.edit`, `clients.delete`
  - Projects: `projects.view_all` (if unset, sees only assigned projects), `projects.create`, `projects.archive`, `projects.delete`, `projects.manage_people`
  - Files: `files.delete_forever`, `files.empty_trash`, `files.download_all`
  - Sharing: `sharing.create_public_links`
  - Team: `team.invite`, `team.change_roles`, `team.manage_roles`
  - Admin: `admin.storage`, `admin.settings`
- **System Roles vs Starter Roles**:
  - **Admin**: Immutable system role (`is_system = true`) containing every permission. Cannot be edited or deleted. A company must always maintain at least one Admin.
  - **Manager** and **Editor**: Configured as editable starter roles seeded per company. Existing members retain their current role.
- **Team Management**:
  - The Team page features a dedicated **Roles** tab: lists existing roles with member count, allows creating a **New role** (name, color badge, granular permission checkboxes grouped by category), editing custom roles, and deleting roles (requires reassigning existing members first).
- **Enforcement Rule**:
  - `authz` checks specific permissions (`authz.HasPermission(person, perm)`), **never role names**.
  - Project access levels (`Viewer`, `Commenter`, `Uploader`, `Full access`) remain intact and operate within project boundaries.
- **Automated Tests**:
  - A role without `clients.create` receives `403 Forbidden` when attempting to create a client.
  - The last Admin in a company cannot be removed or assigned to a non-Admin role.
  - Deleting a role that has active assigned members is refused with an error.

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

### 3.2 Card shapes and physical silhouettes (everywhere)

Every card across project workspaces, lists, documents, and spreadsheets enforces realistic physical styling:
- **Folders**: Physical silhouette with top tab; preview displays 1 large thumbnail on the left and 2 small stacked thumbnails on the right.
- **Documents**: Page silhouette with folded top-right corner; paper preview showing text excerpts; blue `DOC` badge.
- **Spreadsheets**: Dark grid preview with green header row, colored status cells, green `SHEET` badge, and physical sheet tabs hanging beneath the card's bottom edge (e.g. `[Tracker]`, `[Payments | Summary]`).
- **Metadata**: Every card displays name, project name, last editor and relative time ("Rik · 20m ago"), and collaborator avatars.

### 3.3 Dedicated Documents and Spreadsheets Pages (built in P5 & P6)

*Note: Main sidebar navigation links for "Documents" and "Spreadsheets" are positioned directly below "Projects", but remain hidden until Milestones P5 and P6.*

- **Header**: Title, aggregate count ("14 documents across 4 clients"), "New document" or "New spreadsheet" primary button.
- **Filters**: Instant search box, Client dropdown, Project dropdown, Owner dropdown, sort selector, and Grid/List toggle.
- **Client Chips**: Quick horizontal filter chips ("All clients", "Everygen 5", "Launchpoint 3").
- **Grouped Layout**: When "All clients" is selected, cards are visually grouped by client with client logo, name, and total item count as a section heading. Full specifications documented in `docs/FEATURES_DOCS_SHEETS.md`.

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

### 6.9 Video review screen (Frame.io style, Milestone P4)

The video review interface follows the strict layout in `docs/PROJECT_WORKSPACE.md` and detailed specifications:

- **Top Bar**:
  - Back navigation, breadcrumb path, file name, version dropdown (e.g. `v3`), review status chip (`Needs review`, `Changes requested`, `Approved`).
  - Item position counter (`"1 of N"` with previous and next arrows).
  - Primary actions: **Request changes** (red outline), **Approve** (green button).
  - Collaboration actions: **Share** button, **Copy link**, and live active user avatars.
- **Left / Center Player Canvas**:
  - Matte black player area rendering the video in its native aspect ratio.
  - Interactive overlay: when a comment is selected, its on-frame drawing (boxes, arrows, freehand lines) renders over the paused frame.
  - **Timeline**:
    - Comment avatars positioned at their exact timecode marker.
    - Range comments rendered as continuous colored bands across the scrubber.
    - Lock badge on team-only comment markers.
  - **Player Controls**:
    - Play/pause, loop toggle, playback speed selector (0.5x, 1x, 1.25x, 1.5x, 2x), volume slider with mute.
    - Centered timecode display with format dropdown (`Timecode SMPTE`, `Frames`, `Seconds`).
    - HD quality selector, markers visibility toggle (on/off), version compare mode (side-by-side synchronized scrubbing), fullscreen toggle.
  - **Metadata Strip** (directly beneath controls):
    - Current version badge, uploader name, upload date, resolution (e.g. `3840×2160`), frame rate (`24 fps`), file size.
- **Right Panel (Tabs: Comments [count] and Details)**:
  - Header: `"All comments"` with status filter (All, Unresolved, Resolved), sort (Timecode, Newest), and quick search.
  - Threaded comment list:
    - Commenter avatar, name, badge (**Client** or **Team**), company affiliation, relative timestamp.
    - Clickable orange timecode chip (e.g. `01:24.08`) jumping the player instantly to that frame.
    - Comment body text, `"Drawing"` indicator link, and `"N replies"` expandable thread link.
    - Resolve circle button (transforms into green checkmark when resolved; comment greys out).
    - Threaded replies indented under parent comment.
    - **Team-Only Comments**: Rendered with light yellow background and `"Team only"` lock badge. Never sent or visible to client contacts or share link visitors.
- **Bottom Comment Composer**:
  - Removable orange timecode chip reflecting current player playhead position.
  - Placeholder: `"Leave a comment at this moment..."`.
  - Action buttons: Draw tool, Attach file, Mention (`@`), Audience visibility dropdown (**Everyone** / **Team only**), and blue **Send** button.

### 6.10 Documents (Google Docs style, Milestone P5)

Opens at `/d/{id}`. Full feature breakdown governed by `docs/FEATURES_DOCS_SHEETS.md` Section 3:
- **Build Now (P5)**: Text styles (Normal, Title, H1-H3); bold, italic, underline, strikethrough; text and highlight colors; font size and alignment; bulleted and numbered lists with indent; task checklists; tables (insert/delete rows/cols, cell background, resize); images (paste, drag, upload); links to web and internal Playhead files; find and replace; slash menu (`/`); markdown shortcuts; collapsible outline panel; word count and reading time; live multi-cursor editing via Yjs + Hocuspocus; version history with restore; embedded Playhead video cards (thumbnail, version, review status); templates (brief, script, shot list, creator notes); server-scrubbed team-only notes block (automatically stripped for clients and share links); export (PDF, Word `.docx`, Markdown `.md`); Word import; print stylesheet; page vs full-width view; dark page mode; offline editing with automatic sync.
- **Deferred (Do NOT build in P5)**: In-line text comments, text `@mentions`, suggestion/track-changes mode.

### 6.11 Spreadsheets (Google Sheets style, Milestone P6) and the Project Tracker

Opens at `/s/{id}`. Full feature breakdown governed by `docs/FEATURES_DOCS_SHEETS.md` Section 4:
- **Build Now (P6)**: Full Google Sheets-style cell editing; insert, delete, move, resize, hide, and group rows/columns; copy-paste from Excel and Google Sheets with formatting preserved; fill handle; freeze rows/columns; merge cells; multi-level undo/redo; find and replace; multiple sheets with tabs (rename, reorder, duplicate, color, hide, delete); cell styles, fill colors, and borders; horizontal/vertical alignment and text wrap; number formatting (USD currency, percent, dates, time); conditional formatting rules; dropdown cells with customizable color tag per option; interactive checkboxes; date picker popup; person cells with photo; Playhead file link cells (thumbnail, version, status); 30+ core formulas (`SUM`, `AVERAGE`, `COUNT`, `COUNTIF`, `SUMIF`, `IF`, `IFS`, `IFERROR`, `AND`, `OR`, `ROUND`, `CONCATENATE`, `TEXT`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `TODAY`, `NOW`, `DATE`, `DAYS`, `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `UNIQUE`, `SORT`, `FILTER`); cross-sheet references; formula documentation help; live collaboration with colored cell selections; cell comments with replies, resolve, and mentions; revision history; client column locking; pre-built templates (Tracker, Creator payments, Budget, Shot schedule); Excel/CSV import and export; PDF print.
- **Deferred (Do NOT build in P6)**: Charts and graphs, pivot tables, automatic status webhooks, and Kanban board view.

**Automatic Project Tracker Sheet**:
- Named "Tracker", automatically generated and pinned at the top of the project sidebar upon project creation.
- Pre-configured columns: Video Name, File Link, Editor, Status chip dropdown (Not started, Editing, Needs review, Changes requested, Approved, Delivered), Due Date, Revision, Notes.
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
- Notification bell and email for: shared with you, assigned to a project, mention, reply, new comment on your upload, new version uploaded, approved, changes requested, files uploaded through your share link, storage alerts for Admins.

#### Notification Settings (Built in P3, used by all later milestones)
1. **Settings > Notifications page**:
   - A row per event:
     - Shared with me
     - Added to a project
     - Mentioned
     - New comment on my upload
     - Reply to my comment
     - New version uploaded
     - Approved or changes requested
     - Client uploaded through a link
     - Storage alerts (Admins only)
   - Each row has two toggles: **In app** and **Email**.
   - Defaults: all ON, except Email for "new version uploaded" is OFF.
   - Email frequency choice: **Send right away** (default) or **One daily summary**.
2. **Project Bell (Project header)**:
   - A bell icon button in every project header, next to **Share**.
   - Dropdown with three options:
     - **All activity**: notifies on all comments, uploads, and changes in this project.
     - **Only mentions and my files** (default): notifies only on mentions, replies, and activity on items created/uploaded by the person.
     - **Off**: silences project updates (direct mentions still notify).
   - Saved per person per project.
3. **Enforcement & Links**:
   - Every notification checks both user event preferences and project bell level before sending.
   - Every notification email includes a clickable **Notification settings** link at the bottom.
4. **Data model**:
   - `notification_prefs(user_id, event_type, in_app bool, email bool, unique(user_id, event_type))`
   - `project_notification_prefs(user_id, project_id, level [all, mentions_and_mine, off], unique(user_id, project_id))`
   - `user_settings.email_frequency [instant, daily_summary]`

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
- Folders and multiple files: browser-based streaming download directly from storage presigned URLs (no server zip streaming, no size limit, zero file bytes through API).
  - Default for all browsers: one zip file assembled on-the-fly in the browser using `client-zip` (store mode, no compression), streaming chunks directly to disk without loading full folders into RAM.
  - Chrome and Edge: optional "Download into a folder" in the Download menu using the File System Access API (`showDirectoryPicker`), saving files directly with folder hierarchies preserved.
  - 3 files in parallel; floating Download Tray displays progress, pause, and cancel.
  - Strict permission check: if any item has `can_download == false`, the API refuses with 403.

**Playback**
- Videos start fast using preview copies (HLS at 720p and 1080p) made by the worker after upload, as in section 9.6 of the main spec. Until the preview is ready, play the original if the browser supports it.

**Targets**: uploads and downloads limited only by the person's internet speed; a 1080p video starts playing in under 2 seconds; a folder with 1,000 files opens in under 1 second.

---

## 8. Live editing & unified email service

### 8.1 Live editing (documents and sheets)
- Documents and sheets are stored as **Yjs** documents so several people can edit at once without overwriting each other.
- One small **Node.js collaboration service** (`/services/collab`) running **Hocuspocus**, started by `make dev`, served at `/collab`.
- On connect, it asks the Go API (internal endpoint with a shared secret) for the person's access. No access: refuse. Not Full access: read only.
- Saves to Postgres at most every 2 seconds and when the last person leaves; saves plain text for search.
- Short offline periods: edits kept in the browser and synced on reconnect.
- Documents use **Tiptap** with free open source extensions only.
- Spreadsheets: in the spreadsheet milestone plan, compare 2 or 3 spreadsheet engines that are free for commercial use (no paid license, no watermark), work with Yjs, and support the formulas in 6.11. Do not use Univer's paid collaboration features or any library needing a commercial license. Recommend one and wait for approval.

### 8.2 Unified email service
- All system and notification emails are routed through `services/shared/email` (Mailpit locally, Resend in production via `RESEND_API_KEY` and `EMAIL_FROM`).
- Clean visual template with Playhead logo, dark/neutral typography, and exactly one primary call-to-action button.
- Every notification email includes a mandatory clickable **"Notification settings"** footer link (`/settings/notifications`).
- **5-Minute Comment Debouncing**: When multiple comments or replies occur on the same file within 5 minutes, notifications are aggregated and dispatched as a single consolidated digest email.
- Full email catalog and templates documented in `docs/EMAILS.md`.

---

## 9. Data model (new and changed)

UUID ids, `created_at`, `updated_at`, `company_id` on every row, soft delete with `deleted_at` where Trash applies.

```
roles(company_id, name, color, permissions jsonb, is_system)
memberships(user_id, company_id, role_id -> roles.id)
notification_prefs(user_id, event_type, in_app bool, email bool, unique(user_id, event_type))
project_notification_prefs(user_id, project_id, level [all, mentions_and_mine, off], unique(user_id, project_id))
clients(company_id, name, website, notes_item_id, logo_key, created_by, deleted_at)
client_contacts(company_id, client_id, name, email, default_level [none, viewer, commenter, uploader, full],
                can_download bool, user_id null, last_signed_in_at, unique(client_id, email))
projects(company_id, client_id not null, name, status [active, archived], tracker_item_id,
         file_count, folder_count, video_count, total_bytes, created_by, deleted_at)
items(company_id, project_id, parent_id null, kind [folder, file, document, spreadsheet], name,
      position numeric, created_by, file_count, folder_count, video_count, total_bytes,
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
uploads(...)  -- multipart tracker with item_id, status, parts, reserved bytes
```

- Grants are stored by email, so access works before someone's first sign in.
- Folder and project counts are updated in the same transaction as every add, move, delete and restore, walking up the parent chain. A nightly job recounts and logs any difference.
- A move can never put a folder inside itself or its own children.

---

## 10. API outline (under `/api/v1`)

Clients and contacts: `GET|POST /clients`, `GET|PATCH|DELETE /clients/{id}`, `GET|POST /clients/{id}/contacts`, `PATCH|DELETE /contacts/{id}`.
Projects: `GET|POST /projects`, `GET|PATCH|DELETE /projects/{id}`, `POST /projects/{id}/archive`, `GET|POST|PATCH|DELETE /projects/{id}/people`, `GET|PUT /projects/{id}/notifications`.
Roles: `GET|POST /roles`, `GET|PATCH|DELETE /roles/{id}`.
Notification Prefs: `GET|PUT /settings/notifications`.
Items: `GET /projects/{id}/items?parent_id=&type=&sort=`, `POST /items`, `GET|PATCH|DELETE /items/{id}`, `POST /items/move`, `POST /items/copy`, `GET /items/{id}/path`, `GET /items/{id}/counts`.
Uploads: `POST /uploads`, `/uploads/{id}/parts`, `/uploads/{id}/complete`, `DELETE /uploads/{id}`; new versions with `item_id`.
Downloads: `GET /items/{id}/download?version=&format=`, `POST /downloads/prepare` (manifest with presigned URLs).
Review: `GET /items/{id}/versions`, `GET /items/{id}/versions/{v}/playlist.m3u8`, `GET|POST /items/{id}/comments`, `PATCH|DELETE /comments/{id}`, `POST /comments/{id}/resolve|reopen`, `POST /items/{id}/review`, `POST /items/{id}/reopen`, `GET /items/{id}/comments/export`.
Access: `GET /items/{id}/access`, `GET /projects/{id}/access`, `POST /grants`, `PATCH|DELETE /grants/{id}`, `POST /items/{id}/request-access`.
Share links: `GET|POST /share-links`, `PATCH|DELETE /share-links/{id}`; public `GET /s/{token}`, `POST /s/{token}/unlock`, `POST /s/{token}/identify`, `GET /s/{token}/items`, comments, review, download and upload under `/s/{token}/...`.
Lists: `GET /home`, `GET /reviews`, `GET /shared-with-me`, `GET|POST|DELETE /stars`, `GET /trash`, `POST /trash/{id}/restore`, `DELETE /trash/{id}`, `GET /search`, `GET /notifications`.
Auth: `POST /auth/code/send`, `POST /auth/code/verify`, Google sign in.
Internal (collab service only): `POST /internal/collab/authorize`, `POST /internal/collab/store`.

---

## 11. Design notes

- Follow the design tokens, `/design` files (especially `design/01-project-folder-view.svg` and `Dashboard.svg`), and `docs/PROJECT_WORKSPACE.md`.
- Strict UI styling: No gradients, no glows, no emojis, no placeholder text.
- File type icons: folder (tabbed silhouette), video, audio, image, PDF, document (folded paper, blue `DOC`), spreadsheet (dark grid, green header, hanging tabs, green `SHEET`), archive, generic.
- Loading skeletons, empty states with one action, error states with **Try again**.
- Toasts with **Undo** for move, rename and delete.
- Confirm dialogs only for: delete client, delete project, delete forever, moves that change access.
- Screenshot archiving: `docs/screenshots/<milestone>/` populated at the end of every milestone.

---

## 12. Not in version 1

Billing and public sign up, boards and automations, automatic Tracker updates from reviews, suggestion mode in documents, charts and pivot tables in sheets, desktop sync app, mobile apps.

---

## 13. Milestones (replace old 3 to 11)

| # | Milestone | Includes |
|---|---|---|
| P1 | Roles, clients, projects | Team roles Admin, Manager, Editor; disable public sign up; email code and Google sign in for known emails; clients list, client dialog with contacts, client page; projects list; new project dialog with client dropdown, people and template; project people and access dialog; Editors see only assigned projects |
| P2 | Files, folders, fast upload and download | Items, project page per `PROJECT_WORKSPACE.md`, folder tree, unlimited nesting, counts (Section 3.1), create, rename, move, copy, star, delete, Trash, multiple select, fast parallel resumable uploads of any type and whole folders, browser-direct downloads (`client-zip` and File System Access API), file viewer for non video files |
| P3 | Permissions, Custom Roles, Notification Settings & Sharing | • **Pixel-perfect UI**: Adjust P2 project page to match `design/01-project-folder-view.svg` exactly (folder tab silhouette with 1 large + 2 small previews, file card comment counts and author overlays, floating selection pill bar, upload tray styling).<br>• **Custom Roles RBAC**: `roles` table with 17 permissions, immutable system Admin role (last Admin protected), editable starter roles Manager and Editor, Team page Roles tab, `authz.HasPermission()` checks.<br>• **Notification Settings**: Settings > Notifications page with In app / Email toggles per event, email frequency (instant vs daily summary), project header bell button (All, Mentions & Mine, Off), `notification_prefs` and `project_notification_prefs` tables.<br>• **Permissions & Sharing**: `authz.Access` engine (combining roles, grants, client contact defaults), Can download enforcement, inheritance, Share dialog People tab, Copy link, public share links with passwords/expiry/access types, public share link viewer, Shared with me view, move permission confirmation, full test suite.<br>• **Milestone Screenshots**: Save completed screens in `docs/screenshots/p3/`. |
| P4 | Video review screen | Frame.io style 3-column / fixed-header player: top bar (breadcrumb, v3 dropdown, Needs review chip, 1 of N arrows, Request changes, Approve, Share, Copy link, people avatars); left player area with true video aspect ratio, on-frame drawing display on paused frames, timeline with precise comment avatars, range bands, team-only lock markers, playback controls (SMPTE timecode / frames / seconds, loop, speed, volume, HD, compare, fullscreen), metadata strip (version, uploader, date, resolution, fps, size); right panel with Comments (orange jump chips, replies, resolve tick, team-only yellow badge/lock) and Details tabs; bottom composer with current orange timecode chip, draw, attach, mention, Everyone/Team only dropdown, blue Send button; background processing worker generating HLS previews; comment PDF/CSV export. |
| P5 | Documents | Collab service (`/services/collab` via Hocuspocus + Yjs), Tiptap editor at `/d/{id}`; build features per `docs/FEATURES_DOCS_SHEETS.md`: typography (Title, H1-H3), formatting, indent lists, checklists, rich tables, images, links, find/replace, slash menu (`/`), markdown shortcuts, outline panel, word count/reading time, live cursors, version history with restore, embedded Playhead video cards, templates (brief, script, shot list, creator notes), server-scrubbed team-only notes block, export (PDF, Word, Markdown), Word import, print, page vs full width, dark page mode, offline editing. Main menu "Documents" page with aggregate counts, filters, and client grouping. (Deferred: in-line text comments, text mentions, suggest mode). |
| P6 | Spreadsheets and Tracker | Engine evaluation and approval first, then editor at `/s/{id}`; build features per `docs/FEATURES_DOCS_SHEETS.md`: Google Sheets-like grid editing, rows/cols insert/delete/resize/hide/group, copy-paste with formatting, fill handle, freeze, merge, undo/redo, multiple sheets & tabs, cell styles, borders, number formats, conditional formatting, dropdowns with color tags, checkboxes, date pickers, person cells, Playhead file link cells, 30+ core formulas (`SUM`, `AVERAGE`, `COUNT`, `IF`, `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `UNIQUE`, `SORT`, `FILTER`, etc.), cross-sheet references, formula help, live editing, cell comments with replies/resolve/mentions, version history, client column locking, pre-built templates (Tracker, Creator payments, Budget, Shot schedule), Excel/CSV import/export, PDF print. Automatic Tracker sheet created with every project. Main menu "Spreadsheets" page with aggregate counts, filters, and client grouping. (Deferred: charts, pivot tables, auto status, board view). |
| P7 | Search, Notifications, Polish & Launch | Full text and metadata search across files, documents, sheets, and comments; background notification worker with 5-minute comment debouncing/aggregation and daily digests; client collaborative Notes doc; comprehensive performance benchmarks against Section 7 latency targets; security audit; internal launch for Idyll Productions team and clients. |

