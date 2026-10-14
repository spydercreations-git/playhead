# Playhead: Documents and Spreadsheets Specification

Exhaustive feature lists, card shapes, and page structures for Documents (Milestone P5) and Spreadsheets (Milestone P6).

---

## 1. Card Shapes (Everywhere: Workspace, Documents, Spreadsheets, Search)

Every card in Playhead follows these strict shape and visual specifications:

### 1.1 Folder Cards
- **Silhouette**: Tabbed folder silhouette on top with rounded corners.
- **Preview Area**: Shows 1 large preview on the left and 2 small previews stacked on the right (reflecting the latest media inside).
- **Metadata**:
  - Name (e.g. `Hook tests`)
  - Subtitle: item count and size (`12 items · 8.4 GB`)
  - Last editor and time (`Rik · 20m ago`)
  - Avatars of team members currently active or collaborating on it
  - Selection checkbox top-left, `⋯` context menu top-right

### 1.2 Document Cards (`DOC`)
- **Silhouette**: Page shape with a distinctive folded top-right corner.
- **Preview Area**: Paper-textured document preview rendering the document's initial lines and formatted layout.
- **Badge**: Blue `DOC` badge on the preview.
- **Metadata**:
  - Document Title
  - Project name and client
  - Last editor and time (`Rik · 20m ago`)
  - Avatars of collaborating editors
  - Selection checkbox and `⋯` context menu

### 1.3 Spreadsheet Cards (`SHEET`)
- **Silhouette**: Dark grid card preview with a green header row and colored status cells.
- **Badge**: Green `SHEET` badge on the preview.
- **Hanging Sheet Tabs**: Distinctive sheet tabs hanging beneath the bottom edge of the card (e.g., `[Tracker]`, `[Payments | Summary]`).
- **Metadata**:
  - Spreadsheet Title
  - Project name and client
  - Last editor and time (`Rik · 20m ago`)
  - Active collaborator avatars
  - Selection checkbox and `⋯` context menu

---

## 2. Dedicated "Documents" and "Spreadsheets" Pages (Built in P5 & P6)

*Note: Main menu navigation links for "Documents" and "Spreadsheets" are hidden until Milestones P5 and P6.*

When built, both pages feature:
1. **Header**:
   - Title (`Documents` or `Spreadsheets`)
   - Count banner: (e.g. `"14 documents across 4 clients"`)
   - Primary action button (top-right): `"New document"` or `"New spreadsheet"`
2. **Filters & Search**:
   - Instant search box (filtering title and text content)
   - Filter dropdowns: **Client**, **Project**, and **Owner**
   - Sorting dropdown: (Last modified, Title, Client, Date created)
   - Grid vs List view toggle
3. **Client Filter Chips**:
   - Quick horizontal chip row: `["All clients", "Everygen 5", "Launchpoint 3", ...]`
4. **Grouped View**:
   - When `"All clients"` is selected, cards are grouped by client with the client's logo, name, and document/spreadsheet count as section headings.

---

## 3. Documents Engine & Features (Milestone P5)

Built using **Tiptap** with open-source extensions and collaborative sync via the Node.js **Hocuspocus** collaboration server (`/services/collab`).

### 3.1 Build Now (Milestone P5)
- **Typography & Text Styles**: Normal, Title, Heading 1 (`H1`), Heading 2 (`H2`), Heading 3 (`H3`).
- **Inline Formatting**: Bold, Italic, Underline, Strikethrough, Text color, Highlight color, Font size, Alignment (Left, Center, Right, Justify).
- **Lists & Checklists**: Bulleted lists with nesting/indent, Numbered lists with indent, Interactive task checklists.
- **Tables**: Rich tables with insert/delete rows & columns, resize, cell background color, and header rows.
- **Media & Assets**: Images (copy-paste, drag-and-drop, upload to storage), image resizing and alignment.
- **Links**: Web hyperlinks and direct internal links to Playhead files, folders, and projects.
- **Navigation & Editing Helpers**:
  - Find and Replace with match counts
  - Slash command menu (`/` triggers block inserter: headings, lists, tables, images, video cards)
  - Markdown shortcuts (`#`, `*`, `>`, `-`, `[]`)
  - Collapsible Outline panel based on headings
  - Word count, character count, and estimated reading time
- **Real-time Collaboration & History**:
  - Live multi-user collaborative editing with real-time colored cursors and presence names
  - Version history with point-in-time restore
  - Offline editing mode with automatic reconciliation and sync on reconnection
- **Playhead Video Integration**:
  - Embedded Video Cards: pasting a Playhead video link embeds a live card showing video thumbnail, current version, review status, and one-click player launch.
- **Templates**: Pre-built starting templates (Brief, Script, Shot List, Creator Notes).
- **Team-Only Notes Block**:
  - Special protected content block within the document styled with a yellow background and lock badge.
  - **Server-Side Security**: Automatically stripped on the server when documents are viewed by client contacts or via public share links.
- **Import, Export & Print**:
  - Download as PDF, Word (`.docx`), and Markdown (`.md`)
  - Import Word (`.docx`) into editable Playhead document
  - Clean print stylesheet
- **Layout Options**:
  - Page mode (standard paginated paper view) vs Full-width canvas
  - Dark page mode toggle

### 3.2 LATER (Do NOT build in P5)
- Comments on text selections
- `@mentions` inside document text
- Suggestion / Track-changes mode

---

## 4. Spreadsheet Engine & Features (Milestone P6)

Spreadsheets provide a seamless Google Sheets-like grid experience powered by an open-source collaborative spreadsheet engine integrated with Yjs and Playhead's storage layer.

### 4.1 Build Now (Milestone P6)
- **Grid Operations**:
  - Full Google Sheets-like cell editing and keyboard navigation
  - Insert, delete, move, hide, and resize rows and columns
  - Full copy-paste support from Google Sheets and Microsoft Excel (preserving formatting and numbers)
  - Fill handle for dragging sequences and formulas
  - Freeze rows and columns (freeze header rows)
  - Merge cells across rows and columns
  - Group and collapse rows/columns
  - Multi-level Undo (`Cmd+Z`) and Redo (`Cmd+Y` / `Cmd+Shift+Z`)
  - Find and replace
- **Multiple Sheets & Tabs**:
  - Multi-sheet workbook support with sheet tabs at bottom
  - Tab management: Rename, Reorder, Duplicate, Tab color, Hide, Delete
  - References across sheets (e.g. `=Summary!A1 + Details!B2`)
- **Formatting & Types**:
  - Text styles: Bold, italic, strikethrough, font size, text color
  - Fill colors, borders (outer, inner, colored borders)
  - Alignment: Horizontal (left, center, right) and Vertical (top, middle, bottom), Text wrapping
  - Number formats: Currency (`$ USD`), Percent (`%`), Decimals, Date (`YYYY-MM-DD`, `MMM DD`), Time
  - Conditional formatting rules (highlight cells based on values, color scales)
- **Cell Types & Rich Data**:
  - Dropdown cells with custom color tags per option (ideal for Status columns)
  - Interactive Checkbox cells
  - Date picker popup cells
  - Person cells with user photo and name
  - **File Link Cells**: pasting a Playhead video/asset link embeds a thumbnail, version badge, and review status inside the cell.
- **Formulas & Calculation Engine**:
  - Formula bar with syntax highlighting and interactive cell selection
  - In-line formula help and documentation popup
  - Core mathematical, logic, lookup, and array formulas:
    `SUM`, `AVERAGE`, `COUNT`, `COUNTIF`, `SUMIF`, `IF`, `IFS`, `IFERROR`, `AND`, `OR`, `ROUND`, `CONCATENATE`, `TEXT`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `TODAY`, `NOW`, `DATE`, `DAYS`, `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `UNIQUE`, `SORT`, `FILTER`
- **Data Tools**:
  - Sort range or sheet (A-Z, Z-A)
  - Filter views
  - Data validation rules
- **Collaboration, Permissions & Security**:
  - Live multi-user collaborative editing showing each collaborator's active cell border and name
  - Cell comments: threaded comments, replies, `@mentions`, and resolve
  - Revision / Version history
  - **Client Column Locking**: Admins and Managers can lock specific columns so client contacts cannot edit sensitive budget, internal rate, or margin data.
- **Templates**:
  - Automatic **Tracker** sheet generated for every project (pre-configured with Video Name, Status, Editor, Version, Due Date)
  - Creator Payments template
  - Production Budget template
  - Shot Schedule template
- **Import, Export & Print**:
  - Import from Microsoft Excel (`.xlsx`) and CSV
  - Export/download as Excel (`.xlsx`), CSV, and PDF
  - Formatted print view

### 4.2 LATER (Do NOT build in P6)
- Charts and graphs
- Pivot tables
- Automated status progression webhooks
- Kanban board view
