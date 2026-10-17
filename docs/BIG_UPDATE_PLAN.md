# Playhead Big Update Plan (Steps 0 to 14)

This plan replaces all previous roadmaps. It details every step from database safety to the new role hierarchy, shared My Drive, project folder structure, universal client picker, updated card shapes, moving animation system, company badges, and review demo.

---

## 1. Safety, Stack & Core Rules
- **Inter Everywhere**: Tabular numbers for all numbers/dates (`tabular-nums font-sans`). Monospace fonts removed.
- **Zero Fake Data**: Only real database entities and Cloudflare R2 / MinIO presigned uploads.
- **Token Compliance**: Strict design system audit passes with zero exceptions except approved previews.
- **Server Enforcement**: All permissions checked in Go backend (`authz` package). Never rely only on frontend gating.
- **Testing & Commits**: Go tests + Playwright smoke tests after every step. Commit and push (`git push origin main`) after each step with commit ID reported in the summary for Harsh.
- **Icons**: Preserved exactly as updated in `c0a14a0` (stroke width + 1 with `vectorEffect="non-scaling-stroke"`).
- **Cards Source**: Four SVG files located in `/Users/harsh/CODING PROJECTS/Playhead/New Cards/`:
  - `folder-card-shape.svg`
  - `project-card-shape.svg`
  - `document-card.svg`
  - `spreadsheet-card.svg`

---

## 2. Step-by-Step Execution Plan

### Step 0: Safety & Database Backup
- **Goal**: Full rollback capability before any schema migration.
- **Tasks**:
  1. Add `db/backups/` to `.gitignore`.
  2. Run `pg_dump` on the database container:
     `docker exec -t playhead-postgres pg_dump -U playhead playhead > db/backups/playhead_backup_$(date +%Y%m%d_%H%M%S).sql`
  3. Verify the generated backup is non-empty and syntactically valid SQL.
  4. Ensure every subsequent migration has both `-- +goose Up` and `-- +goose Down`.

---

### Step 1: New Access Model & Team Roles (Server First)
- **Goal**: Replace the word "Admin" everywhere with executive and team roles; enforce 5 project access levels, folder overrides, and completely eliminate "Restricted".
- **Team Roles (in Team page, no "Admin" label visible anywhere)**:
  - **Full Access Roles ("Admins" internally)**:
    1. `CEO` (Harsh)
    2. `COO` (Rohit)
    3. `CFO`
    4. `Chief Sales Officer`
    5. `Design Head`
    *Capabilities*: Full access everywhere, overrides all other settings, sees all projects, clients, My Drive, Trash.
  - **Project Manager**:
    *Capabilities*: Sees ONLY projects they are added to (at the level given there). Extra permissions: can create new projects; can manage access (add editors and client contacts) on projects where they have `Full` or `Editor` level. *Cannot delete clients, cannot modify Team or roles, no My Drive*.
  - **Editor** (freelancers):
    *Capabilities*: Sees ONLY projects they are added to (at the level given). *No My Drive*.
  - **Role Management Rules**:
    - Only `CEO` and `COO` can change roles in Team. Everyone else sees roles read-only.
    - `CEO` can add new custom role titles later and choose "Full access" or "Per project".
  - **Migration of Existing Users**:
    - Harsh -> `CEO`
    - Rohit -> `COO`
    - Existing Admins -> `COO`
    - Existing Managers -> `Project Manager`
    - Existing Editors -> `Editor`
- **Clients (Client Contacts)**:
  - See ONLY projects they are added to. No My Drive.
- **Project Access Levels (in Manage Access)**:
  1. `Full`: Everything in the project incl. rename/delete project, folders, files, manage access.
  2. `Editor`: Rename project; create/rename/delete folders and files; upload; download; comment. *Cannot delete project*.
  3. `Uploader`: Upload; delete only files THEY uploaded; view; comment.
  4. `Commenter`: View and comment.
  5. `Viewer`: View only.
  - `can_download` boolean switch per person.
- **Folder Overrides**:
  - Folders inherit project access by default.
  - Any folder can define explicit user access overrides (e.g., set `none` for client contacts on "Raw files" folder).
  - Inside that folder and its children, the folder override wins. Full access roles ("Admins") always win.
- **Remove "Restricted"**:
  - Migration `00012_remove_restricted.sql`: Drop column `is_restricted` from `projects`.
  - Strip all references to `is_restricted` across SQL queries, Go handlers, and React components.
- **Tests**:
  - Comprehensive access matrix test in Go (`services/api/internal/handler/access_matrix_test.go`):
    - Tests: CEO/COO/Full-Access, Project Manager, Editor, Uploader, Commenter, Viewer, Unassigned User, Client Contact, Share Link Visitor.
    - Against: List projects, Open project, Open folder with override, Upload, Delete own upload, Delete other's file, Rename project, Delete project, Create folder, Download with switch OFF, Manage access, Access My Drive.

---

### Step 2: Shared My Drive
- **Goal**: One single shared My Drive for Full Access roles ("Admins") only.
- **Tasks**:
  1. Merge per-user drives: consolidate all users' files into one company-wide drive.
  2. Consolidate duplicate default folders (`Videos`, `Images`, `Documents`, `Music`) into a single canonical set under company ID, keeping all files.
  3. Default folders are names only: any file type can be stored in any of them; folders can be created, renamed, or deleted.
  4. Move orphan documents and spreadsheets (`project_id IS NULL`) into the shared My Drive.
  5. API gating: require full access role for My Drive (`403 Forbidden` for Project Managers, Editors, and Clients).
  6. Frontend: Hide "My Drive" nav link completely for non-full-access users.
  7. Update all existing drive tests to assert the shared admin-only behavior.

---

### Step 3: Project Structure & Lifecycles
- **Goal**: Folder-only uploads, default folders, recursive sizes, sectioned folder contents, Project Tracker, and 30-day Trash cascade.
- **Tasks**:
  1. **Uploads Inside Folders Only**: Reject uploads to project root (`400 Bad Request`). Existing root files migrated into "Raw files".
  2. **Default Folders**: New projects automatically create `Raw files` and `Edited files`. If all folders in a project are deleted, show empty state: "Create a folder to start uploading" with a creation button.
  3. **Any File Type**: Any file type allowed in any folder with no per-folder size limit.
  4. **Folder Size Calculation**: Show `<N> items · <total size>` (e.g. `14 items · 4.2 GB` or `Empty`) calculated recursively across all nested subfolders. Updates immediately upon upload, move, delete, restore.
  5. **Folder Content Sections**:
     - Files section first.
     - Divider line + "Documents" section (hidden when empty).
     - Divider line + "Spreadsheets" section (hidden when empty).
  6. **Project Tracker**:
     - Automatically created with every project (migration for existing projects).
     - Spreadsheet that also shows on the Spreadsheets page under that client. Cannot be deleted, only cleared.
     - Default columns: `Video name`, `Editor`, `Status` (dropdown: Not started, Editing, In review, Changes requested, Approved), `Due date`, `Version`, `Link`, `Notes`.
     - Tracker Manage Access: View / Edit / No access for project members.
     - Per-column "Hide from clients": server sanitizes rows before returning to client contacts; WebSocket/Yjs room blocks client connections from receiving hidden columns.
     - Linked in project sidebar as "Project tracker".
  7. **Mark Inactive**:
     - Toggle status (`status = 'inactive'`). Displays an "Inactive" badge at top and on cards; items remain fully functional.
  8. **30-Day Trash & Cascading Delete**:
     - Projects, folders, files, documents, spreadsheets, clients soft-deleted to Trash for 30 days.
     - Deleting a project cascades soft-deletion to all contained items.
     - Block restoring a project if its client is in Trash.
     - Restoring a client restores its projects.
     - Delete project: Full access roles or Project `Full` level only, requires typing project name.
     - Delete client: Full access roles only, requires typing client name.

---

### Step 4: Universal Client Picker Dialog
- **Goal**: Single reusable client selection dialog used across the entire application.
- **Tasks**:
  1. Create `apps/web/src/components/clients/client-picker-dialog.tsx`:
     - "Select client" button triggers dialog.
     - Search input filter.
     - A-Z list of all clients with profile pictures / colored initials.
     - Single select, then "Show projects" (or "Select").
     - When client selected: toolbar displays "Back to all clients" button.
     - Full keyboard navigation: Up/Down arrow keys + Enter to select.
  2. Replace every legacy client dropdown across Projects, Documents, Spreadsheets, and New Project dialog.

---

### Step 5: Clients Page & Cards (Frame.io Aesthetic)
- **Goal**: Client profile picture upload, mute toggle, hover zoom, and redesigned client card.
- **Tasks**:
  1. Profile picture upload in New Client and Client Settings (square crop, PNG/JPG/WebP, saved to R2 storage with thumbnails). Fallback: initials on color.
  2. Client Card component:
     - Square picture filling top of card.
     - ONLY client name on picture (no "Harsh's Workspace" or other subtitle).
     - Soft dark fade gradient at bottom of picture for contrast (added to linter exceptions).
     - Bottom row: "Updated <time ago>" and ⋯ button.
     - Hover: picture zooms slightly (`scale(1.04)`, 200ms ease) and card border lightens to `#424344`.
     - S / M / L grid sizing.
  3. Bell icon at top-right of picture: toggle notifications on/muted for this client (per-user, stored in DB).
  4. ⋯ and right-click menu:
     - Mute notifications / Unmute
     - Mark inactive / Mark active
     - Client settings
     - Delete client
  5. Client Settings: Name, picture, contact people (unlimited, no roles at client level; roles set per project), team-only notes. Adding a contact sends invite email.
  6. Client page (`P09`): Tabs `Projects`, `Files`, `People` with real data.

---

### Step 6: Projects Page
- **Goal**: Client picker navigation, client-grouped view, and project card actions.
- **Tasks**:
  1. "Select client" button triggers Universal Client Picker.
  2. "All clients" view: Grouped by client. Client picture + name, 4 most recently opened projects, "View all" link, divider line.
  3. One client selected view: All projects for that client in a grid, plus "Back to all clients".
  4. ⋯ and right-click menu: Manage access, Mark inactive / Mark active, Rename, Delete.
  5. New Project dialog uses the client picker.

---

### Step 7: Documents and Spreadsheets
- **Goal**: Folder-bound documents and spreadsheets with client picker navigation.
- **Tasks**:
  1. Documents and spreadsheets live in project folders (except old ones migrated to My Drive).
  2. Documents page: Client Picker. Grouped by project when client selected. In "All clients" view: view-only (creation requires selecting client, project, and folder).
  3. Document ⋯ and right-click menu: Show in project (opens folder and highlights item), Open, Download, Rename, Manage access, Move, Delete.
  4. Spreadsheets page works identically and displays each project's tracker.
  5. Home page "New document" / "New spreadsheet": opens "Save to" dialog (Client -> Project -> Folder; remembers last selection).

---

### Step 8: Home Page Overhaul
- **Goal**: Clean dashboard focused on recent work and shared My Drive.
- **Tasks**:
  1. Header action buttons: `Upload`, `New folder`, `New document`, `New spreadsheet` (no New project button).
  2. My Drive section: 4 default folder cards with real counts and sizes. Visible to Full Access roles only.
  3. Recent projects section: Last 8 projects opened by the user.
  4. Recent folders section: Last 8 project folders opened by the user.
  5. Remove "My projects" section. "Waiting for review" stays hidden for now.

---

### Step 9: Navigation Route Cleanup & Trash Page
- **Goal**: Clean sidebar routes and robust multi-type Trash page.
- **Tasks**:
  1. Remove `Reviews`, `Shared with me`, `Starred` from sidebar navigation and routing (review player `/review/[id]` remains active).
  2. Trash page (`/trash`):
     - Columns: Name, Type (Media, Folder, Project, Client, Document, Spreadsheet), Size, Deleted by, Deleted, Actions.
     - Full access roles see everything; others see items they deleted.
     - "Restore" and "Delete forever" working end-to-end with cascading rules.

---

### Step 10: Cards & Project Sidebar Design
- **Goal**: Exact SVG card shapes from `New Cards/`, unified footers, S/M/L switcher, and Frame.io sidebar.
- **Tasks**:
  1. `DocumentCard`: exact implementation of `/New Cards/document-card.svg` (folded corner, `#2E2F34` preview, `#4876F3` title line, `#C9C4BA` body lines).
  2. `SpreadsheetCard`: exact implementation of `/New Cards/spreadsheet-card.svg` (`#1B1C20` mini sheet preview, `#3FCF8E` 22% header, `#3A3C44` cell bars; `#1B1C20` and `#3A3C44` added to hex exceptions).
  3. Unified Card Footer across Document, Spreadsheet, and File cards:
     - Row 1: Title (14 SemiBold, 1 line truncate) + ⋯ button.
     - Row 2: Location (13, `#A3A6AD`).
     - Row 3: `<last editor> · <date>` (12, `#7C7F87`) + avatar stack (max 3, +N).
     - 8px gaps, consistent card height.
  4. Project & Folder Card SVG shape:
     - Single continuous outline SVG path for tab + body (from `New Cards/project-card-shape.svg` and `New Cards/folder-card-shape.svg`):
       `M0.5 {H-12.5} V10.5 Q0.5 0.5 10.5 0.5 H88 C96 0.5 100 2.5 105 7.5 L111 13.5 C115 17.5 118 18.5 124 18.5 H{W-12.5} Q{W-0.5} 18.5 {W-0.5} 30.5 V{H-12.5} Q{W-0.5} {H-0.5} {W-12.5} {H-0.5} H12.5 Q0.5 {H-0.5} 0.5 {H-12.5} Z`
     - Tab fill: `#26272C`. Body fill: `#212121`.
     - Border: 1px `#2E2F34`, hover `#424344`, selected 2px `#4876F3`.
  5. S / M / L size switcher on every grid page (~180px / 232px / 300px). At S size, hide 3rd footer row. Persisted on server per user.
  6. Focus rings: `:focus-visible` only (no blue outline on mouse click).
  7. Project Workspace Sidebar (Frame.io inspired):
     - Header: Client picture + project name + client name.
     - Folder tree with chevrons, "+" for new folder, file drag-and-drop. No duplicate "Files" header, no "0" counts.
     - "Recently deleted" directly below folder tree.
     - "Project tracker" link.
     - Remove "Sheets and docs", "+ Create Tracker", and Share links section.

---

### Step 11: End-to-End Menus, Notifications & Profile Pictures
- **Goal**: Full audit of every menu, live notifications, upload animations, and profile pictures.
- **Tasks**:
  1. Menu audit: Test every ⋯ and right-click menu item across all pages. Remove any orphaned items. Document in report: Page | Menu Item | API Endpoint | Test.
  2. Notifications: Bell popover with real activity stream (comments, mentions, uploads finished, approvals, access grants, deletions), unread dots, Mark all read, click to open item. Respects team-only comments and per-client mute.
  3. Upload animations: Top bar progress ring, upload panel 160ms smooth accordion, progress bar animation, done check, plain English error status, retry. Respect reduced motion.
  4. User Profile Pictures: Upload in Settings (square crop, presigned upload to R2). Displayed across all avatar components.

---

### Step 12: Moving Folders and Files (with Real Physics Animation) - [Order Update: Step 12 is now Moving]
- **Goal**: Server-enforced movement rules with client isolation and drag-and-drop flying animations.
- **Server Rules**:
  1. Folder can move into another folder (any depth) within the same project.
  2. Moving between projects is permitted ONLY if both projects belong to the SAME client. Cross-client moving is rejected with `403 Forbidden ("Can't move between clients")`.
  3. Projects can never be moved to another client.
  4. A folder cannot be moved into itself or any of its own subfolders.
  5. Full access roles ("Admins") can also move between My Drive and any project.
  6. Permissions: `Editor` / `Full` (or Full Access role) on source; upload rights on destination. Uploaders can move only files they uploaded.
  7. Atomic transaction: preserves subfolders, files, versions, comments, renditions. Moving into a target project resets folder access overrides to follow target project access (dialog warns user prior to move).
  8. Project tracker cannot be moved.
- **Animation & UX**:
  - Drag: card with thumbnail/preview follows cursor (slightly smaller, tilted 2-3°, shadow). Multi-select shows stacked cards with count badge.
  - Drop targets: valid targets highlight with accent border (`#4876F3`); invalid targets show "not allowed" cursor.
  - Drop: card shrinks and flies into target folder (~250ms), target folder pulses once, empty grid space collapses smoothly. Toast says "Moved to <folder>" with Undo button.
  - ⋯ menu "Move to": uses the same flying animation if destination is visible on screen; otherwise card fades out with toast.
  - `prefers-reduced-motion`: no flying animation, clean cross-fade.
- **Tests**:
  - Move folder into folder.
  - Move to another project of same client.
  - Blocked move to another client's project (API 403).
  - Blocked move into own subfolder.
  - Undo restores original location.

---

### Step 13: Who Is This Person (Company Icon Badge)
- **Goal**: Automatic client affiliation, small company badge, and contextual hover tooltips.
- **Rules & Implementation**:
  1. **Client Affiliation**: Adding someone to a client automatically links their profile to that client. In Settings, they see their name and photo with the client's logo and "Managed by Idyll Productions". When logged in, their top bar displays their client's logo. If the client name or logo updates, all its contacts update automatically.
  2. **16px Round Company Badge**:
     - Rendered next to a person's name or overlapping the avatar's bottom-right corner across comments, Manage Access lists, avatar stacks, mentions, notifications, and tracker cells.
     - Client people: client's logo (or initials on color).
     - Idyll team: Idyll Productions logo. Temporary until Harsh sends final asset: "IP" initials on #212121 as the badge, modularly defined so the asset can be swapped cleanly.
  3. **Tooltip on Hover**:
     - Client people: `"Sarah is from Everygen"` (or `"Richard is a client"` if individual client without logo).
     - Team: `"<Name> is <Role> at Idyll Productions"` (e.g. `"Harsh is CEO at Idyll Productions"`, `"Rohit is COO at Idyll Productions"`, `"Kushal is an Editor at Idyll Productions"`).
  4. Shared `PersonBadge` component used everywhere.
- **Tests**: Tooltip text rendering tests for client contacts, CEO, and editors.

---

### Step 14: Review Demo (Done LAST after Moving & Badges)
- **Goal**: Generate real media assets and verify review workspace end-to-end.
- **Tasks**:
  1. Scripted creation of real "Review demo" client and project via real API calls.
  2. `ffmpeg` generated test files:
     - 16:9 1080p 30s video with burned-in timecode and audio tones.
     - 9:16 vertical 20s clip.
     - 1:1 square 15s clip.
     - High-res PNG image.
     - Multi-page PDF.
  3. Upload through real upload flow and transcode through Asynq worker (HLS streams, thumbnails, waveforms, PDF pages).
  4. Deliver exact localhost review player links.

---

## 3. Execution Sequence
Each step will be implemented sequentially:
1. **Step 0**: Safety & Database Backup (`docker exec -t playhead-postgres pg_dump -U postgres playhead_dev > db/backups/playhead_backup_<date>.sql`)
2. **Step 1**: Access Model & Executive Roles (Harsh=CEO, Rohit=COO, etc.) + Access Matrix Tests
3. **Step 2**: Shared My Drive & Drive Merge (Admins only)
4. **Step 3**: Project Structure, Sizing, Tracker (with client column protection: client never in raw Yjs room; server-filtered copy + server-checked edit API), Trash Cascade (with `delete_batch_id` for accurate client restore)
5. **Step 4**: Universal Client Picker Dialog
6. **Step 5**: Clients Page, Cards & Profile Pictures
7. **Step 6**: Projects Page & Client Grouping
8. **Step 7**: Documents & Spreadsheets Pages
9. **Step 8**: Home Page Overhaul
10. **Step 9**: Navigation Cleanup & Trash Page
11. **Step 10**: Card Shapes (`New Cards/`) & Sidebar
12. **Step 11**: Menus, Notifications, Upload Animations & Avatars
13. **Step 12**: File & Folder Moving with Physics Animation (formerly Step 13)
14. **Step 13**: Company Badges & Tooltips (formerly Step 14)
15. **Step 14**: Review Demo Media Generation (done LAST)

