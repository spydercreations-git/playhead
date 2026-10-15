# Milestone P5 Implementation Plan: Documents & Collaboration

> **Scope**: `docs/FEATURES_DOCS_SHEETS.md`, Section 3 "Documents Engine & Features (Milestone P5)" ("Build now" list only). Where it conflicts with `docs/PLAYHEAD_SPEC_V2.md`, `FEATURES_DOCS_SHEETS.md` wins.  
> **Deferred**: In-line text comments, text `@mentions`, and suggest/track-changes mode are strictly deferred and NOT built in P5.  
> **Look and Layout**: Section 6.10 of `docs/PLAYHEAD_SPEC_V2.md`, Section 1.2 & Section 2 of `docs/FEATURES_DOCS_SHEETS.md`, and Playhead design tokens.

---

## 1. Collaboration Service (`services/collab`)

A dedicated real-time collaboration server built with Node.js, `@hocuspocus/server`, and `yjs`.

### 1.1 Architecture & Startup
- **Location**: `services/collab/` (Node.js 20+ / TypeScript).
- **Port**: `8082` (WebSocket endpoint: `ws://localhost:8082` in development; reverse proxied in production).
- **`make dev` Integration**: Managed in `Makefile` alongside the API and Web services via concurrent background execution.
- **Docker Compose Integration**: Added to `infra/docker-compose.yml` as `playhead-collab` container, depending on `postgres` and `redis`.

### 1.2 Connection & Authentication Flow
1. **Client Connection**: When opening `/d/{id}`, the client establishes a WebSocket connection with the Hocuspocus provider, passing the document ID and an authentication token (session token or signed share visitor cookie).
2. **Internal Verification Hook (`onAuthenticate`)**:
   - Hocuspocus calls the Go API internal endpoint: `POST http://localhost:8080/api/internal/collab/verify`.
   - Protected by a shared secret header: `X-Collab-Secret: ${COLLAB_INTERNAL_SECRET}`.
   - Go API verifies the token and runs `authz.AccessItem(person, item)` on the document.
   - **Response**:
     ```json
     {
       "allowed": true,
       "user_id": "uuid",
       "name": "Jane Doe",
       "email": "jane@idyll.com",
       "avatar_url": "",
       "color": "#3B82F6",
       "is_team_member": true,
       "access_level": "full",
       "read_only": false
     }
     ```
   - **Access Rules**:
     - **No Access**: If `allowed == false`, the connection is immediately terminated with WebSocket close code `4403 ("Forbidden")`.
     - **Not Full Access**: If `access_level != "full"`, Hocuspocus sets `connection.readOnly = true`. The user can view live edits in real-time, but any client-sent editing updates are dropped by the server.
     - **Non-Team Member Gate**: See Section 3 for strict Team-Only Notes isolation.

### 1.3 5-Second Revocation Guarantee
- Active connections store their session identifier and last verified timestamp in the Hocuspocus connection context.
- **Two-Layer Revocation**:
  1. **Immediate Invalidation (Redis Pub/Sub)**: Whenever user grants, company memberships, or project roles are modified in the Go API (`DeleteGrant`, `UpdateGrant`, `RemoveMember`), an event is published to Redis channel `playhead:collab:revocations`. Hocuspocus subscribes to this channel and immediately evicts affected connections.
  2. **5-Second Polling Fallback**: An internal tick runs every 5 seconds inside the Collab server, re-verifying active connections against cached permissions or the Go internal endpoint. If access has lapsed or been revoked, `connection.close(4403, "Access revoked")` is called within 5 seconds.

### 1.4 Persistence & Search Indexing
- **Debounced Save (at most every 2 seconds)**: When active mutations occur, Hocuspocus buffers updates and flushes the binary Yjs document state (`content_state BYTEA`) to PostgreSQL table `documents` using a 2-second debounce timer.
- **Last Person Leaves**: In the `onDisconnect` hook, when active connection count for a document drops to zero, the document is flushed to PostgreSQL immediately.
- **Plain Text Extraction**: On each database save, the collab server converts the Yjs state to plain text and writes both:
  - `plain_text`: Complete document plain text (for internal team search).
  - `public_plain_text`: Plain text with all Team-Only Notes blocks stripped (for client and public search).
  - Also calculates and updates `word_count`, `character_count`, and `reading_time_seconds`.

---

## 2. Editor Libraries & Open-Source License Inventory

> [!IMPORTANT]
> **Strict Zero-Paid-Extensions Policy**: We do **not** use Tiptap Pro, Tiptap Cloud, or any commercial closed-source plugins. All packages are free, open-source MIT or BSD licensed.

### 2.1 Editor Stack & License Roster

| Library | Version | License | Purpose |
|---|---|---|---|
| `@tiptap/core` | `^2.10.x` | MIT | Core Tiptap rich text engine |
| `@tiptap/react` | `^2.10.x` | MIT | React component wrappers & hooks |
| `@tiptap/pm` | `^2.10.x` | MIT | ProseMirror state & view foundation |
| `@tiptap/starter-kit` | `^2.10.x` | MIT | Headings, bold, italic, strike, lists, code block |
| `@tiptap/extension-underline` | `^2.10.x` | MIT | Underline styling |
| `@tiptap/extension-text-style` | `^2.10.x` | MIT | Inline span styling foundation |
| `@tiptap/extension-color` | `^2.10.x` | MIT | Custom text color selection |
| `@tiptap/extension-highlight` | `^2.10.x` | MIT | Multicolor text highlight backgrounds |
| `@tiptap/extension-text-align` | `^2.10.x` | MIT | Left, center, right, and justify alignment |
| `@tiptap/extension-task-list` | `^2.10.x` | MIT | Interactive task checklists |
| `@tiptap/extension-task-item` | `^2.10.x` | MIT | Nested checklist items with checkbox toggles |
| `@tiptap/extension-table` | `^2.10.x` | MIT | Rich tables with resizable columns |
| `@tiptap/extension-table-row` | `^2.10.x` | MIT | Table rows |
| `@tiptap/extension-table-header` | `^2.10.x` | MIT | Table header cells |
| `@tiptap/extension-table-cell` | `^2.10.x` | MIT | Table cells with custom background color |
| `@tiptap/extension-image` | `^2.10.x` | MIT | Resizable inline images with alignment |
| `@tiptap/extension-link` | `^2.10.x` | MIT | Web hyperlinks & internal Playhead links |
| `@tiptap/extension-collaboration` | `^2.10.x` | MIT | Yjs ProseMirror sync binding |
| `@tiptap/extension-collaboration-cursor` | `^2.10.x` | MIT | Multi-user colored cursors and name tags |
| `@tiptap/extension-character-count` | `^2.10.x` | MIT | Word count, character count, reading time |
| `yjs` | `^13.6.x` | MIT | CRDT collaboration data engine |
| `@hocuspocus/server` | `^2.13.x` | MIT | Open-source Node.js WebSocket collaboration server |
| `@hocuspocus/provider` | `^2.13.x` | MIT | Client WebSocket provider |
| `y-indexeddb` | `^9.0.x` | MIT | Offline IndexedDB document caching & sync |
| `mammoth` | `^1.8.x` | BSD 2-Clause | Free Word (`.docx`) to HTML importer |
| `docx` | `^8.5.x` | MIT | Free client/server Word (`.docx`) file generator |
| `turndown` & `turndown-plugin-gfm` | `^7.2.x` | MIT | HTML to GitHub Flavored Markdown exporter |
| `marked` | `^15.0.x` | MIT | Markdown to HTML parser for `.md` imports |
| `html2pdf.js` | `^0.10.x` | MIT | Clean client-side PDF document generation |

---

## 3. Team-Only Notes: Security Architecture & Tradeoff Analysis

### 3.1 The Security Challenge
Yjs is a distributed CRDT: connected peers receive the complete binary document update log. Hiding a block in the browser UI (e.g. `display: none` or React conditional rendering) is **completely insecure** because clients or share link visitors with developer tools or packet inspection could reconstruct every keystroke of internal rates, contractor budgets, or private studio notes.

### 3.2 Evaluation of Approaches

#### Option A: Dual Yjs Subdocuments (`doc:{id}:public` + `doc:{id}:team`)
- **How it works**: The public document and team notes block live in two separate Yjs rooms. Non-team users only connect to the public room.
- **Tradeoffs**:
  - *Cons*: High synchronization complexity. Inline ordering between two separate CRDT structures causes race conditions; copy-pasting, undo/redo across block boundaries, and text selection breaks between the two independent ProseMirror instances. 
  - *Cons*: Overkill for Playhead's permissions model because clients and share link visitors are Viewers or Commenters ("Not Full access: read only").

#### Option B: Single Master Y.Doc with Server-Side Sanitized Projection (Recommended)
- **How it works**:
  1. **Internal Team Members (`is_team_member == true`)**: Connect directly to the live Yjs room via WebSocket (`doc:{id}`). They enjoy seamless real-time collaborative editing, unified undo/redo, presence cursors, and drag-and-drop around team blocks.
  2. **Clients & Public Share Visitors (`is_team_member == false`)**:
     - **NEVER receive the raw Yjs WebSocket stream**.
     - When opening `/d/{id}` or `/s/{token}/doc/{id}`, they receive a **Server-Side Sanitized Read-Only Projection** (`GET /api/v1/documents/{id}/view`).
     - The Go API / Collab service loads the document JSON, traverses the ProseMirror node tree, and **recursively strips all `team_notes` nodes** before serializing to JSON/HTML.
     - The client renders the document in Tiptap (`editable: false`).
     - **Live Updates for External Viewers**: When an internal team member edits the document, the Collab server broadcasts sanitized JSON snapshots over a read-only WebSocket channel or Server-Sent Events (SSE). Team blocks never exist in this channel.
  3. **Guarantees Across All Output Channels**:
     - **Downloads & Exports (PDF, Word `.docx`, Markdown `.md`)**: Generated server-side or from the sanitized projection. Non-team download requests have team notes stripped at the AST level.
     - **Print Stylesheet**: When printed, team notes are omitted unless the caller is a verified team member.
     - **Search Indexing**: The database stores both `plain_text` and `public_plain_text` (with team notes scrubbed). Client queries and share link searches query strictly against `public_plain_text`.
     - **Version History**: Snapshots returned to non-team members have all `team_notes` blocks scrubbed before leaving the server.

### 3.3 Recommendation
**We adopt Option B (Server-Side Sanitized Projection)**. It provides a mathematical 100% guarantee that team data never crosses the wire to clients, while keeping internal team editing fast, reliable, and free of CRDT synchronization artifacts.

---

## 4. Version History Engine

1. **Automatic Snapshots (Every 10 Minutes)**:
   - The Collab server maintains `lastVersionAt` per document.
   - If active editing occurs and $\ge 10$ minutes have elapsed since the last checkpoint, an automatic snapshot is committed to `document_versions` with `is_named: false` and name `"Automatic version"`.
2. **Manual "Name this version"**:
   - Top bar button opens a clean modal.
   - User inputs a label (e.g. `"Client Review Draft 1"`, `"Shoot Day Script"`).
   - Snapshot is written with `is_named: true`, user's ID, and custom name.
3. **Version History Panel**:
   - Flyout sidebar on the right displaying a chronological list of versions.
   - Displays relative time ("15m ago", "Yesterday 3:30 PM"), author avatar, name, and named version badge.
4. **Preview Mode**:
   - Clicking a version switches the editor canvas to a read-only historical preview.
   - Floating amber banner: *"Previewing version from [Date] by [Author]"* with two actions:
     - **"Back to current"**: Closes preview and returns to live document.
     - **"Restore this version"**: Restores the selected version.
5. **Non-Destructive Restore**:
   - Restoring a version loads its content and applies it to the active Yjs document as the latest change.
   - Automatically generates a new version entry: `"Restored from [Version Name/Date]"`.
   - **Crucial Rule**: Existing newer versions are **never deleted**. Full chronological history is preserved.

---

## 5. Offline Editing & Sync

1. **`y-indexeddb` Integration**:
   - Client initializes `new IndexeddbPersistence("playhead:doc:" + documentId, ydoc)`.
   - All local keystrokes are written to IndexedDB immediately, enabling uninterrupted offline editing if Wi-Fi drops.
2. **Status Indicator in Toolbar**:
   - 🟢 **Synced**: All local changes confirmed by Collab server.
   - 🟡 **Saving...**: Changes buffered and saving to server.
   - 🟠 **Offline - Changes saved locally**: Connection disconnected; typing continues offline.
3. **Reconnection & Conflict Reconciliation**:
   - On network restoration, Hocuspocus provider automatically reconnects.
   - Local Yjs state converges mathematically with the server CRDT via vector clocks, ensuring zero dropped keystrokes.

---

## 6. Embedded Video Cards

1. **Paste Detection**:
   - Pasting a Playhead link (e.g. `https://playhead.app/v/{fileId}` or `/projects/{pId}/files/{fileId}`) triggers a custom Tiptap Node `playheadVideoCard`.
2. **Permission-Checked Metadata Fetch**:
   - Client calls `GET /api/v1/items/{fileId}/card-preview`.
   - Go API evaluates `authz.AccessItem(caller, item)`.
3. **Rendering States**:
   - **Authorized Reader (`CanView == true`)**:
     - 16:9 thumbnail with duration chip (e.g. `01:15`)
     - File title
     - Version chip (e.g. `v2`)
     - Review status chip (`Needs review`, `Approved`, `Changes requested`)
     - One-click launch to review player modal or direct link.
   - **Unauthorized Reader (`CanView == false` or item deleted)**:
     - Rendered with a locked card silhouette:
       - 🔒 Lock icon
       - `"Playhead Video"`
       - `"No access: You don't have permission to view this video."`

---

## 7. Document Images: Secure Storage Pipeline

> [!IMPORTANT]
> **Hard Rule**: File bytes never pass through the API server. Raw unauthenticated URLs are never stored.

1. **Image Ingestion**:
   - Triggered via drag-and-drop, clipboard paste, or toolbar image button.
2. **Presigned Upload Request**:
   - Client calls `POST /api/v1/documents/{id}/images/presign` with `{ filename, size_bytes, mime }`.
   - API verifies caller has `Full` access on the document.
   - **Storage Quota Check**: Evaluated inside a PostgreSQL transaction (spec Section 7.3).
   - Generates presigned R2/MinIO `PUT` URL for key:
     `companies/{company_id}/documents/{document_id}/images/{uuid}.{ext}`.
3. **Direct Upload**:
   - Client uploads bytes directly to MinIO / Cloudflare R2.
4. **Registration**:
   - Client calls `POST /api/v1/documents/{id}/images/complete` with `{ asset_id, storage_key, width, height }`.
   - API records entry in `document_assets` and returns asset URL.
5. **Editor Insertion**:
   - Custom Tiptap `ImageNode` inserts image with resize handles and alignment options (left, center, right).

---

## 8. Templates

Four studio-grade starting templates pre-configured with rich formatting:

1. **Creative Brief**:
   - Title: `Creative Brief: [Campaign Name]`
   - Overview & Objectives
   - Target Audience & Tone of Voice
   - Key Deliverables & Video Formats (9:16, 16:9)
   - Milestones Table: Deliverable, First Cut, Revisions, Final Delivery
   - Team-Only Notes block: Client budget, margin, internal hourly rate.
2. **Video Script (AV Format)**:
   - Title: `Script Draft: [Video Title]`
   - Logline, Hook & Creative Concept
   - Multi-column AV Table: `Scene #`, `Visual / Action`, `Audio / Dialogue`, `Duration / TC`
   - Team-Only Notes block: Director's private camera notes and backup talent options.
3. **Production Shot List**:
   - Title: `Shot List & Schedule: [Shoot Name]`
   - Location, Call Time & Crew Roster
   - Shot Table: `Scene`, `Shot #`, `Angle & Lens`, `Movement`, `Description`, `Equipment`, `Status Checklist`
   - Interactive gear prep and location sign-off checklist.
4. **Creator Notes (UGC Guidelines)**:
   - Title: `Creator UGC Guidelines: [Brand Name]`
   - Concept Overview & 3 Hook Variations
   - Key Talking Points & Mandatory Mentions
   - Visual Dos and Don'ts Checklist (Lighting, framing, audio)
   - Deliverables Specs (9:16 vertical 4K/1080p, clean audio)
   - Team-Only Notes block: Negotiated creator rate, usage rights window, private contact phone/email.

---

## 9. Automated Test Plan

| Test Case | Scope | Expected Behavior |
|---|---|---|
| **1. Viewer gets read-only connection** | Collab WebSocket | Collab server accepts connection, flags `readOnly: true`; edits sent by viewer are rejected. |
| **2. Person without access is refused** | Collab WebSocket | WebSocket connection fails with close code `4403 Forbidden`. |
| **3. Removed access disconnects within 5s** | Collab Revocation | Revoking grant or membership closes active WebSocket connection within 5 seconds. |
| **4. Zero-leak team notes: Live connection** | Collab Security | Non-team user never receives raw Yjs stream containing team blocks. |
| **5. Zero-leak team notes: Exports & Print** | Export Handlers | PDF, `.docx`, `.md`, and print stylesheet contain zero traces of team notes when accessed by client. |
| **6. Zero-leak team notes: Search** | Search Indexing | Search against `public_plain_text` yields 0 matches for keywords inside team notes. |
| **7. Zero-leak team notes: Version history** | Versions API | Historical snapshot returned to client has all team blocks scrubbed. |
| **8. Real-time concurrent editing** | Yjs Convergence | Two editors typing simultaneously in different paragraphs retain all changes without conflict. |
| **9. Offline editing & reconnection** | `y-indexeddb` | Keystrokes while offline persist to IndexedDB and merge cleanly to server on reconnect. |
| **10. Video card permissions** | Card Component | User with view access sees thumbnail/version/status; user without access sees locked "No access" card. |

---

## 10. Database Tables, API Endpoints, UI Screens & Build Sequence

### 10.1 Database Tables (Goose Migration `00008_p5_documents.sql`)

```sql
-- 1. Documents core table
CREATE TABLE documents (
    id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    content_state BYTEA,                                  -- Raw binary Yjs document state
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,      -- ProseMirror JSON snapshot
    plain_text TEXT NOT NULL DEFAULT '',                  -- Full text for team search
    public_plain_text TEXT NOT NULL DEFAULT '',           -- Scrubbed text for client search
    word_count INT NOT NULL DEFAULT 0,
    character_count INT NOT NULL DEFAULT 0,
    reading_time_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Document versions
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255),
    is_named BOOLEAN NOT NULL DEFAULT FALSE,
    content_state BYTEA NOT NULL,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plain_text TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Document image assets
CREATE TABLE document_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    storage_key VARCHAR(512) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INT,
    height INT,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 10.2 API Endpoints

#### Internal Collaboration Endpoints:
- `POST /api/internal/collab/verify` (Header: `X-Collab-Secret`): Verifies caller access, team status, and write rights.
- `POST /api/internal/collab/save` (Header: `X-Collab-Secret`): Flushes Yjs state, plain text, and search tokens to PostgreSQL.

#### Documents & Editor Endpoints (`/api/v1`):
- `POST /api/v1/projects/{id}/documents`: Create new document (Blank or template).
- `GET /api/v1/documents`: List documents across company (supports search, client, project, owner filters).
- `GET /api/v1/documents/{id}`: Document metadata, item details, and permissions.
- `GET /api/v1/documents/{id}/view`: Server-sanitized JSON/HTML for external viewers.
- `PUT /api/v1/documents/{id}/title`: Rename document.
- `POST /api/v1/documents/{id}/images/presign`: Request presigned S3/R2 upload URL with quota check.
- `POST /api/v1/documents/{id}/images/complete`: Register completed image asset.
- `GET /api/v1/documents/{id}/versions`: List document versions (scrubbed for non-team users).
- `POST /api/v1/documents/{id}/versions`: Name current version.
- `POST /api/v1/documents/{id}/versions/{version_id}/restore`: Restore historical version non-destructively.
- `GET /api/v1/documents/{id}/export/{format}`: Export as `pdf`, `docx`, or `md` (scrubbed for non-team users).
- `POST /api/v1/documents/{id}/import/docx`: Import `.docx` file into document.
- `GET /api/v1/items/{id}/card-preview`: Permission-checked card metadata for embedded video cards.

### 10.3 UI Screens, Components & Controls

1. **Dedicated `/documents` Page**:
   - Sidebar: Unhide "Documents" navigation item right below "Projects".
   - Header: Count banner (`"14 documents across 4 clients"`), Primary `+ New document` button with template selector.
   - Filter bar: Search input, Client/Project/Owner dropdowns, Sort dropdown, Grid/List view toggle.
   - Client chips row: `["All clients", "Launchpoint 3", "Everygen 5", ...]`.
   - Grouped client sections with client logo, name, and document counts.
   - Distinct Document Card shape: Folded top-right corner, paper-textured preview rendering document text, blue `DOC` badge, last editor and time, collaborator avatars.

2. **Document Editor (`/d/{id}`)**:
   - **Top Navigation Bar**:
     - Back navigation arrow (to project or `/documents`).
     - Editable document title.
     - Star toggle button.
     - Sync status indicator (`Synced` / `Saving...` / `Offline`).
     - Active collaborator presence avatars with colored rings.
     - "Name this version" button & Version history toggle.
     - Export menu (PDF, Word `.docx`, Markdown `.md`, Print).
     - Word count & estimated reading time.
     - Unified Playhead Share button.
   - **Formatting Toolbar**:
     - Undo / Redo.
     - Text Style selector (Normal, Title, Heading 1, Heading 2, Heading 3).
     - Font size selector.
     - Bold, Italic, Underline, Strikethrough.
     - Text Color & Highlight Color pickers.
     - Text Alignment (Left, Center, Right, Justify).
     - Bulleted list, Numbered list, Interactive checklist.
     - Table inserter & column/row controls.
     - Image uploader & Link inserter.
     - Insert Playhead Video Card.
     - Insert Team-Only Notes block (yellow background, lock badge, team-only label).
     - Page Mode toggle (Paginated standard paper vs Full-width canvas).
     - Dark Page Mode toggle.
   - **In-Canvas Helpers**:
     - Slash command menu (`/` triggers block inserter).
     - Markdown shortcuts (`#`, `*`, `>`, `-`, `[]`).
     - Collapsible Outline panel based on headings (left flyout).
     - Find and Replace bar (`Cmd+F`) with match counts.

### 10.4 Sequential Build Order

1. **Step 1: Database Migration & Models (`00008_p5_documents.sql`)**:
   - Create `documents`, `document_versions`, and `document_assets` tables.
   - Generate `sqlc` queries for document retrieval, updates, versioning, and asset tracking.
2. **Step 2: Standalone Collaboration Service (`services/collab`)**:
   - Set up Node.js service with `@hocuspocus/server`, `yjs`, and Redis connection.
   - Implement `onAuthenticate` with Go internal verification hook.
   - Implement 5-second revocation loop and Redis Pub/Sub listener.
   - Implement debounced persistence to PostgreSQL with plain text extraction.
   - Wire into `infra/docker-compose.yml` and root `Makefile`.
3. **Step 3: Backend API Endpoints & Zero-Leak Security**:
   - Add internal endpoint `POST /api/internal/collab/verify`.
   - Add document CRUD, templates seeder, and image presigned upload endpoints.
   - Add `GET /api/v1/items/{id}/card-preview` with `authz.AccessItem` checking.
   - Implement server-side scrubbing for non-team document views, exports, and versions.
4. **Step 4: Frontend Tiptap Editor & Collaboration Engine**:
   - Install open-source Tiptap packages, Yjs, `@hocuspocus/provider`, and `y-indexeddb`.
   - Build custom Tiptap extensions: Team-Only Notes block, Playhead Video Card, and Custom Image Node.
   - Build Document Editor layout at `/d/{id}` with paginated/canvas modes, dark mode, toolbar, outline panel, find/replace, and slash menu.
5. **Step 5: Import, Export & Offline Sync**:
   - Implement Word (`.docx`) import via `mammoth`.
   - Implement `.docx` export via `docx`, Markdown via `turndown`, and PDF print styling.
   - Implement offline sync via `y-indexeddb` with toolbar status badge.
6. **Step 6: Dedicated `/documents` Page & Card Shapes**:
   - Unhide "Documents" in sidebar navigation.
   - Implement `/documents` route with client filter chips, client grouping, search, and sorting.
   - Implement physical folded-corner Document Card with paper preview and blue `DOC` badge.
7. **Step 7: Automated Test Suite & Browser Verification**:
   - Run backend tests covering viewer read-only, access refusal, 5s revocation, zero-leak team notes across all channels, and video card privacy.
   - Run multi-client collaboration test in browser, offline sync verification, and export tests.
   - Update `docs/PROGRESS.md` and commit/push to GitHub.
