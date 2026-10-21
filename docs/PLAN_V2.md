# PLAYHEAD PLAN V2 (master plan, decided by Harsh on 21 Oct 2026)
This file replaces the old "big update" steps. Keep it in the repo as docs/PLAN_V2.md and follow it.

## GENERAL RULES (always)
- Backend first in each phase: database migration (with Down), API, permission checks on the server, tests. Then the UI.
- Never break existing data. Before any phase that deletes or moves data: make a database backup (pg_dump) and say where it is in the report.
- One dark grey theme only (already done). Tokens only, Inter only, icons stay exactly as they are now.
- No fake or hard-coded data anywhere. Every permission is checked on the server, never only in the UI.
- Every new endpoint goes into TestAllRolesEndpoints (allow/deny per role).
- After each phase: run all tests, commit, push, short report with "SUMMARY FOR HARSH" in plain English.

## SIDEBAR (final)
Home, Tasks, Library, Clients, Documents, Quick links, Trash. Bottom: Admin, Storage, Settings.
Removed: My Drive, Spreadsheets, Reviews, Shared with me, Starred.

==================================================
## PHASE 1: ROLES AND ADMIN
==================================================
1. Three roles only: Staff, Editor, Client.
   - Staff also has a free text TITLE shown as a tag (CEO, COO, CFO, CSO, Design Head, Project Manager...).
   - Permission switches per person (on/off), with defaults per role:
     `admin` (open Admin page), `manage_access`, `create_project`, `rename_project`, `delete_project`, `move_items`, `copy_items`, `delete_items`, `create_task`, `delete_task`, `change_task_status`, `invite_people`.
     - Staff default: all on except `admin` (`admin` on for Harsh and Rohit).
     - Editor default: `move_items`, `copy_items`, `change_task_status` (only on tasks they are added to). Everything else off.
     - Client default: `create_project` (inside their own client only), `create_task` (for their own client only). Everything else off.
   - Migration from the current 7 roles: CEO, COO, CFO, CSO, Design Head, Project Manager -> Staff (title = old role name). Editor -> Editor. Client people -> Client. Keep every user's data and access. List the result in the report.
   - Replace all role checks with permission checks (helpers in authz). No role string comparisons in handlers.
2. Admin page (replaces Team). Only people with the admin switch.
   - Tabs: Staff, Editors, Clients.
   - Staff and Editors tabs: list (picture, name, @username, email, title, status: active / invited), "Add staff" / "Add editor" (name, email, title for staff), edit title, permission switches, resend invite, deactivate (never hard delete; their files and comments stay).
   - Clients tab: every client with its people. Add / remove people, resend invite. Same data as the Clients page (adding a person in either place is the same thing).
   - Every add sends the invite email (temporary password + Sign in with Google), as already built.
3. Tests: migration keeps access; every permission switch is enforced on the server; non-admin gets 403 on Admin APIs.

==================================================
## PHASE 2: LIBRARY (old Projects page)
==================================================
1. Rename Projects to Library everywhere in the UI (routes /library). Inside: Client > Project > Folders (unlimited depth) > Files.
2. Every Library project belongs to a client. Create an internal client "Idyll Productions" for Idyll's own files.
3. Who creates projects: staff (create_project) and clients (inside their own client only, automatically). Editors cannot create projects; they see a project only when added in Manage access.
4. New project gets two folders automatically: "Raw files" and "Edited files". Show a small notice after creating: "Raw files and Edited files folders were created."
5. Uploads only inside a folder inside a project. Never at project root, never outside a project.
6. Project, folder and file menu (3 dots and right click), in this order: Manage access, Copy link, Download (project/folder = zip, folder by folder), Copy to, Move to, Duplicate, Rename, Delete (last, red).
7. Permissions: project access passes down to folders and files; any folder or file can override (industry standard). Levels stay: Full, Editor, Uploader, Commenter, Viewer + can download.
8. Copy link: each link chooses "People with access" (default; others see "No access", signed in users with access open it normally) or "Anyone with the link (view only)" (preview without login, no comments, no download).
9. Moving: any folder into any folder and any file into any folder, unlimited depth, inside the SAME project only. Never into itself or its own subfolder. Moving to another project is always blocked (server returns 403). Real moving animation in the UI.
10. Copy to / Duplicate: allowed only into projects of the SAME client.
11. Upload animation: while uploading, the card shows the file blurred with progress; then "Generating thumbnail"; then the thumbnail (video frame or the photo itself) and the upload date.
12. Tests for every rule above.

==================================================
## PHASE 3: TASKS
==================================================
1. A task = work a client assigns to Idyll (Asana style). Created by clients (for their own client) and staff. Button: "Assign new task" (on Home and the Tasks page).
2. Fields: task name, client, deadline, status, linked Library project (optional), links (max 15), description (rich text, its title can be renamed per task), comments.
3. Status (custom dropdown, not the native one): Not started, In progress, Completed, Not needed. Plus an automatic red "Overdue" label when the deadline has passed and the task is not Completed or Not needed. Deadline shows "Today" / "Tomorrow" instead of the date when it fits.
   Who changes status: staff and editors added to the task. Clients only see it.
4. Manage access per task (staff only): add staff and editors to the task. Clients never see who is assigned.
5. Links: "Add link" (title + URL) or "Select file from Playhead" (pick a Library file the person can access). Each link is a small pill with 8px corners and the site icon. Hover shows delete, copy, open. Click opens in a new tab. Max 15 per task.
6. Description editor (TipTap, already in the project): undo, redo, "+" insert menu, text style menu (Normal text, Large / Medium / Small heading, Bulleted list, Numbered list, Code block, with keyboard shortcuts), "/" opens the same menu, bold, italic, strikethrough, underline, link (inserted as a link pill), highlight, inline code, quote, insert divider line. Every icon has a tooltip. See Harsh's reference screenshots.
7. Comments: two tabs.
   - Client chat: the client and staff.
   - Internal: staff and editors added to the task. Clients never see it.
   - @mention list shows only people allowed in that tab.
   - Real time (websocket or SSE). Attachments up to 30 MB (any file). Direct reply (not threads): the reply shows the quoted message with a connecting line; clicking the quote scrolls to the original and makes it blink for 1 to 2 seconds. History lines like "Harsh completed this task".
8. Tasks page: a list with columns Task name, Status, Deadline, comment count, Open. Open slides the side panel in from the right with everything above. Filters: month and status. Drag rows to set priority order (saved). Delete only for staff, inside the side panel, goes to Trash.
9. Notifications: assigned to a task, new comment / mention, status changed, task overdue.
10. Tests: clients see only their client's tasks and only the Client chat tab; editors see only tasks they are added to; overdue logic; link limit; attachment size limit.

==================================================
## PHASE 4: HOME, DOCUMENTS, QUICK LINKS, STORAGE, REMOVALS
==================================================
1. Home (work dashboard): "Good morning, <name>" + "<N> files are waiting for review". Buttons: Upload (asks project and folder first, remembers the last choice) and Assign new task.
   Left: Waiting for review (3 cards, See all), Your projects (4 most recently opened, 2x2). Right: Recent activity (full height; each line opens the exact item). Bottom note for staff and editors only: "Playhead is Idyll Productions' private workspace for client work. Please don't use it for personal files."
   Everyone sees only what they can access.
2. Documents: a separate page, not linked to Library projects. Create, rename, delete documents; share a document with people (view / edit). Google Docs quality editor (our own, TipTap, no Google API).
3. Quick links: private per user. "Add quick link" (name + URL). Cards with copy, open (new tab), delete. No limit that matters (thousands).
4. Storage: shows total workspace storage used (and per client). No payments.
5. Removals (backup first):
   - My Drive: move all its files into the internal client "Idyll Productions" (project "From My Drive", same folders), then remove My Drive pages and APIs.
   - Spreadsheets: delete all spreadsheets and project tracker sheets (Harsh confirmed), remove the page, APIs, FortuneSheet and the tracker access feature.
   - Reviews, Shared with me, Starred: remove pages and APIs. Keep all comment and review data; the review player stays.
6. Search across clients, projects, folders, files, tasks and documents, respecting permissions.

==================================================
## PHASE 5: POLISH (later)
==================================================
Harsh will send one UI list. Settings page stays as it is for now.
