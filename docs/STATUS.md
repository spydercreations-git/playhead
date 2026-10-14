# Playhead Project Status

Current milestone: **P3 (Permissions, Roles & Sharing)** completed.

---

## 1. What is Done

### Milestone P1: Foundation, Workspace & Local Infra
- PostgreSQL 16, Redis 7, MinIO (local R2 stand-in), and Mailpit local environment running via Docker Compose.
- Complete identity, session, and role structures.
- Client and project management with templates (`video_project`, `blank_project`).
- Case-insensitive email normalization and strict multi-tenant company isolation.

### Milestone P2: Files, Folders, Uploads & Downloads
- File tree hierarchy with parent-child folder tracking, batch actions (move, copy, trash).
- Resumable parallel multipart upload engine direct to S3/R2 storage with pre-reserved storage quotas.
- Browser-based streaming zip downloads using `client-zip` (Store mode, 0 compression, infinite file size, never buffered into memory) and Chrome/Edge File System Access API ("Download into a folder").
- Starred items, trash lifecycle, and storage alerts.

### Milestone P3: Permissions, Roles & Sharing
1. **Granular Permissions & Role Engine**:
   - 17 granular permission constants (`clients.*`, `projects.*`, `files.*`, `sharing.*`, `team.*`, `admin.*`).
   - Custom roles CRUD (`/api/v1/roles`) with customizable badge colors and permission matrices.
   - System roles (`Admin`) are immutable and cannot be deleted.
   - Guard against deleting roles with active members assigned (returns 400).
   - Last Admin protection: the final Admin of a company cannot be demoted or removed (returns 400).

2. **Access Hierarchy & Fast Single-Query Folder Access**:
   - `AccessFolder()` evaluates permissions via an ancestor recursive CTE in a single database query.
   - Folders with 1,000 files open in < 20ms without per-file permission checks.
   - Access levels: `none`, `viewer`, `commenter`, `uploader`, `full`.
   - Access is inherited from Project -> Parent Folder -> Child Items unless elevated by item grants.

3. **Item & Project Grants (People Tab)**:
   - Adding or editing collaborators on an item requires `full` access on that item.
   - Grants support custom access levels (`viewer`, `commenter`, `uploader`, `full`) and a discrete `can_download` toggle.
   - Email notifications sent when access is granted, respecting recipient notification preferences.
   - Recipients without an account can sign in using a 6-digit code sent to that email.
   - Instant revocation: removing a grant terminates access immediately.
   - `/shared-with-me` dashboard route displays all items and projects shared directly with the user.

4. **Public Share Links (`/s/{token}`)**:
   - Creating a public share link requires `full` access on attached items **AND** the `sharing.create_public_links` permission.
   - Viewers, Commenters, and Uploaders see "Request access" instead of "Share".
   - **Scope Isolation**: Visitors can only view, download, or upload to items attached to the link and their child folders. Any request outside the attached items returns a clean `404 Not Found`.
   - **Link States**: Disabled links return `404 Not Found`. Expired links return `410 Gone`.
   - **Password Protection**: Unlocking sets a short-lived `ph_share_unlock_{token}` HTTP-only cookie scoped to that link.
   - **Visitor Identification**: Optional prompt for Name and Email before link access.
   - **Upload Dropzone Links**: Upload links put files only in the linked folder, count against company storage, and enforce `upload_limit_bytes` (rejecting files exceeding the limit with 413).

5. **Copy Link & Notification Bell**:
   - "Copy link" button next to Share on projects, folders, and files copies the internal Playhead URL and triggers the toast: *"Link copied. Only people with access can open it."*
   - Project Bell button sets notification preference: "All activity", "Only mentions and my files", or "Off".
   - Settings > Notifications page at `/settings/notifications` for configuring in-app vs email alerts.

6. **UI & Aesthetic Overhaul (01-project-folder-view.png)**:
   - Strictly **NO EMOJIS** anywhere in the interface; SVG Lucide icons used exclusively.
   - Folder cards feature real top tabs with 1 large and 2 small thumbnail previews.
   - Video cards show version tags (`v3`), duration pills, Lucide comment icon counter (`MessageSquare`), and status tags (`Approved`, `Needs review`, `Changes requested`).
   - Document cards feature folded paper corners and blue `DOC` / red `PDF` badges.
   - Spreadsheet cards display dark grid previews with green headers and sheet tabs.
   - Floating selection pill matching the design specification.

---

## 2. What is Not Done (Next Milestones)

- **Milestone P4: Video Player, Review & PDF Annotation**:
  - HLS video player with frame-accurate scrubbing, hover scrub previews.
  - Video timecode comments, pen/brush drawing overlays.
  - Multi-page PDF viewer with `pdftoppm` rendered page previews.
  - Side-by-side and overlay comparison modes.
- **Milestone P5: Payments & Subscriptions**:
  - Paddle Billing checkout, subscription webhooks, seat and storage limit upgrades.
- **Milestone P6: Background Transcoding Worker**:
  - Asynq worker executing FFmpeg 1080p/720p/360p HLS encodes and sprite generation.
- **Milestone P7: Polish, Activity Logs & Production Hardening**:
  - Full company audit log and Sentry instrumentation.

---

## 3. Known Problems

- In local Docker development without external SMTP credentials, emails are captured locally in Mailpit (`http://localhost:8025`). This is by design for local testing.
- Streaming ZIP downloads require an HTTPS origin or `localhost` context to use the Web Streams API.

---

## 4. Open Questions

- None blocking P4. All design rules, permissions hierarchy, and storage quotas are fully locked in `docs/PLAYHEAD_SPEC_V2.md` and `docs/DECISIONS.md`.

---

## 5. How to Test Sharing

### A. Automatic Backend Test Suite
Run the comprehensive test suite verifying all 9 permission and sharing requirements:
```bash
go test -v ./services/api/internal/handler -run TestP3PermissionsRolesAndSharing
```
**Verified tests**:
1. `TestShareLinkScope_OutsideItem404`: Visiting an item outside the link's attached scope returns `404`.
2. `TestViewerCannotCreateGrantsOrShareLinks_403`: Users with Viewer access receive `403 Forbidden` if attempting to create grants or share links.
3. `TestFullAccessWithoutSharingPermission_CannotCreatePublicLink_403`: A user with Full item access but missing `sharing.create_public_links` receives `403 Forbidden`.
4. `TestRemovingGrant_RemovesAccessImmediately`: Revoking a grant immediately drops access to `none`.
5. `TestExpiredAndDisabledLinks`: Expired link returns `410 Gone`; disabled link returns `404 Not Found`.
6. `TestUploadLink_RejectsUploadsOverLimit`: Uploading a file exceeding `upload_limit_bytes` returns `413 Payload Too Large`.
7. `TestFolderListing_FixedDatabaseQueries`: Listing a folder with 1,000 files executes a constant number of queries in < 20ms.
8. `TestLastAdminProtection`: Demoting or removing the last Admin returns `400 Bad Request`.
9. `TestDeleteRoleWithMembers_Refused`: Deleting a custom role with assigned members returns `400 Bad Request`.

### B. Interactive UI Testing in Browser

1. **Boot Local Dev Environment**:
   ```bash
   make dev
   ```
   Open `http://localhost:3000` in your browser.

2. **Test People Grants**:
   - Open any project from the dashboard (e.g. `http://localhost:3000/projects/<project_id>`).
   - Click the blue **Share** button in the top right.
   - Under the **People** tab:
     - Enter an email (e.g., `colleague@studio.com`).
     - Choose an access level (`Viewer`, `Commenter`, `Uploader`, or `Full access`).
     - Check/uncheck "Can download original files" and "Notify by email".
     - Click **Add**.
   - Check Mailpit at `http://localhost:8025` to see the dispatched access notification email.
   - Sign in as that user: navigate to `/shared-with-me` to see the newly shared project.

3. **Test Public Share Links**:
   - Open the **Share** modal on a project or select a file and click **Share**.
   - Switch to the **Public Links** tab.
   - Click **+ Create Link**:
     - Give the link a name (e.g., `Client Review Draft`).
     - Choose visitor access: `View only`, `Comment & Review`, or `Upload only`.
     - (Optional) Check **Password protect** and set `secret123`.
     - (Optional) Set an upload limit (e.g., 50 MB).
     - Click **Generate Link**.
   - Click **Copy Link** on the generated link card.
   - Open an incognito/private browser window and paste the link (`http://localhost:3000/s/<token>`).
   - If password-protected, the password modal will appear:
     - Enter incorrect password: shows error.
     - Enter `secret123`: unlocks and sets the `ph_share_unlock_*` cookie.
   - Verify only the shared items appear.
   - Try downloading if downloads are enabled.
   - If it is an Upload link, test dropping a file into the upload zone to verify direct upload.

4. **Test "Copy Link" Button**:
   - In any project view, click the **Copy link** button next to Share.
   - Verify the toast appears: *"Link copied. Only people with access can open it."*
   - Pasting this URL into an unauthorized browser redirects to login.

5. **Test "Request Access" Button**:
   - Log in as a user who only has `Viewer` or `Commenter` access to a project.
   - Notice that the top right action button now displays **Request access** instead of "Share".
   - Clicking it opens the access request modal.

6. **Test Custom Roles & Permissions**:
   - Navigate to `/team`.
   - Switch to the **Roles & Permissions** tab.
   - View existing roles (`Admin`, `Manager`, `Editor`).
   - Click **New Role**, enter `Colorist`, pick a badge color, and select granular permissions.
   - Click **Create Role**.
   - Switch to **Members** tab and assign a member to the new `Colorist` role.
