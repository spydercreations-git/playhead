import {
  Server,
  onAuthenticatePayload,
  connectedPayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
  beforeUnloadDocumentPayload,
} from "@hocuspocus/server";
import * as Y from "yjs";
import express, { Request, Response } from "express";
import crypto from "crypto";
import {
  loadDocumentState,
  saveDocumentContent,
  createDocumentVersion,
  checkAndCreateAutomaticVersion,
  loadSpreadsheetState,
  loadSpreadsheetRecord,
  saveSpreadsheetContent,
  createSpreadsheetVersion,
  checkAndCreateAutomaticSpreadsheetVersion,
} from "./database.js";
import { extractDocumentData } from "./text-extractor.js";
import {
  verifyTicketWithApi,
  registerConnection,
  unregisterConnection,
  setupRevocationListener,
} from "./auth.js";
import {
  buildYDocFromJson,
  replaceContentInLiveDoc,
  convertDocxToProseMirror,
  prosemirrorJsonToHtml,
} from "./prosemirror-converter.js";
import {
  buildYDocFromSheets,
  yDocToFortuneSheet,
  extractSpreadsheetData,
  setCellInLiveDoc,
  insertRowInLiveDoc,
  setColumnMetaInLiveDoc,
  parseExcelOrCsvBuffer,
  spreadsheetDataToHtml,
} from "./spreadsheet-converter.js";
import { generatePdf, buildPrintableHtml } from "./pdf-generator.js";

// Helper functions for spreadsheet names
function isSpreadsheet(name: string): boolean {
  return name.startsWith("sheet:");
}

function parseSpreadsheetId(name: string): string {
  return name.startsWith("sheet:") ? name.replace("sheet:", "") : name;
}

// 1. Production Secret Validation
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.ENVIRONMENT === "production" ||
  process.env.ENV === "production";

const defaultDevSecret = "default-dev-collab-secret-at-least-32-chars-long";
const collabSecret = process.env.COLLAB_INTERNAL_SECRET || defaultDevSecret;

if (isProd) {
  if (
    !process.env.COLLAB_INTERNAL_SECRET ||
    collabSecret === defaultDevSecret ||
    collabSecret === "playhead-collab-internal-secret-dev-only" ||
    collabSecret.length < 32
  ) {
    console.error(
      "FATAL: COLLAB_INTERNAL_SECRET must be set and cannot be the development default or shorter than 32 characters in production"
    );
    process.exit(1);
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const PORT = parseInt(process.env.PORT || "8082", 10);

// Setup Redis revocation listener and 5s polling loop
setupRevocationListener();

// 2. Configure Hocuspocus Server
export const server = new Server({
  port: PORT,
  timeout: 30000,
  debounce: 2000, // Saves to Postgres at most every 2 seconds

  async onAuthenticate(data: onAuthenticatePayload) {
    const { token, documentName } = data;
    if (!token) {
      throw new Error("Collab ticket is required");
    }

    const verify = await verifyTicketWithApi(documentName, token);

    // Rule 1: No access -> refuse
    if (!verify.allowed) {
      throw new Error("Access denied: " + (verify.reason || "unauthorized"));
    }

    // Rule 2: Non-team members (client contacts, share link visitors) NEVER get the live Yjs connection
    if (!verify.is_team_member) {
      throw new Error("Forbidden: Non-team members cannot connect to live collaboration");
    }

    // Rule 3: Not Full access -> read-only
    if (verify.read_only || verify.access_level !== "full") {
      data.connectionConfig.readOnly = true;
    }

    return {
      user: {
        id: verify.user_id,
        name: verify.name,
        email: verify.email,
        avatar: verify.avatar_url,
        color: verify.color || "#4876F3",
      },
      ticket: token,
      readOnly: verify.read_only || verify.access_level !== "full",
      isTeamMember: verify.is_team_member,
    };
  },

  async connected(data: connectedPayload) {
    const ctx = data.context as any;
    if (ctx && ctx.user) {
      registerConnection(
        data.socketId,
        data.documentName,
        ctx.user.id,
        ctx.ticket,
        data.connection
      );
    }
  },

  async onDisconnect(data: onDisconnectPayload) {
    if (data.socketId) {
      unregisterConnection(data.socketId);
    }
  },

  async onLoadDocument(data: onLoadDocumentPayload) {
    if (isSpreadsheet(data.documentName)) {
      const sId = parseSpreadsheetId(data.documentName);
      const record = await loadSpreadsheetRecord(sId);
      if (record?.state && record.state.length > 0) {
        Y.applyUpdate(data.document, record.state);
      } else if (record?.contentJson) {
        const initDoc = buildYDocFromSheets(record.contentJson);
        const state = Buffer.from(Y.encodeStateAsUpdate(initDoc));
        Y.applyUpdate(data.document, state);
      }
    } else {
      const state = await loadDocumentState(data.documentName);
      if (state && state.length > 0) {
        Y.applyUpdate(data.document, state);
      }
    }
    return data.document;
  },

  async onStoreDocument(data: onStoreDocumentPayload) {
    const state = Buffer.from(Y.encodeStateAsUpdate(data.document));

    if (isSpreadsheet(data.documentName)) {
      const sId = parseSpreadsheetId(data.documentName);
      const extracted = extractSpreadsheetData(data.document);

      await saveSpreadsheetContent(
        sId,
        state,
        extracted.contentJson,
        extracted.plainText,
        extracted.publicPlainText,
        extracted.rowCount,
        extracted.colCount,
        extracted.cellCount
      );

      await checkAndCreateAutomaticSpreadsheetVersion(
        sId,
        state,
        extracted.contentJson,
        extracted.plainText
      );
    } else {
      const extracted = extractDocumentData(data.document);

      await saveDocumentContent(
        data.documentName,
        state,
        extracted.contentJson,
        extracted.plainText,
        extracted.publicPlainText,
        extracted.wordCount,
        extracted.characterCount,
        extracted.readingTimeSeconds
      );

      await checkAndCreateAutomaticVersion(
        data.documentName,
        state,
        extracted.contentJson,
        extracted.plainText
      );
    }
  },

  async beforeUnloadDocument(data: beforeUnloadDocumentPayload) {
    // Last person left: ensure document state is stored cleanly
    const state = Buffer.from(Y.encodeStateAsUpdate(data.document));

    if (isSpreadsheet(data.documentName)) {
      const sId = parseSpreadsheetId(data.documentName);
      const extracted = extractSpreadsheetData(data.document);

      await saveSpreadsheetContent(
        sId,
        state,
        extracted.contentJson,
        extracted.plainText,
        extracted.publicPlainText,
        extracted.rowCount,
        extracted.colCount,
        extracted.cellCount
      );
    } else {
      const extracted = extractDocumentData(data.document);

      await saveDocumentContent(
        data.documentName,
        state,
        extracted.contentJson,
        extracted.plainText,
        extracted.publicPlainText,
        extracted.wordCount,
        extracted.characterCount,
        extracted.readingTimeSeconds
      );
    }
  },
});


// 3. Express App for Internal Collab Endpoints
const app = express();
app.use(express.json({ limit: "50mb" }));

// Middleware: Collab internal secret verification
function authCollabInternal(req: Request, res: Response, next: () => void) {
  const secret = req.headers["x-collab-secret"];
  if (typeof secret !== "string" || !timingSafeCompare(secret, collabSecret)) {
    res.status(401).json({ error: "Unauthorized: invalid collab secret" });
    return;
  }
  next();
}

// Health check endpoint
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "collab" });
});

/**
 * Internal Endpoint: POST /internal/init-document
 * Creates the real Yjs state from template / initial ProseMirror JSON on the server
 * and saves content_state and extracted data directly into Postgres.
 */
app.post("/internal/init-document", authCollabInternal, async (req: Request, res: Response) => {
  const { document_id, company_id, content_json } = req.body;
  if (!document_id) {
    res.status(400).json({ error: "document_id is required" });
    return;
  }

  try {
    const ydoc = buildYDocFromJson(content_json);
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractDocumentData(ydoc);

    await saveDocumentContent(
      document_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.wordCount,
      extracted.characterCount,
      extracted.readingTimeSeconds
    );

    // If document is already loaded in memory, sync the update
    const activeDoc = (server as any).hocuspocus?.documents?.get(document_id);
    if (activeDoc) {
      Y.applyUpdate(activeDoc, state);
    }

    res.json({
      ok: true,
      document_id,
      word_count: extracted.wordCount,
      character_count: extracted.characterCount,
      reading_time_seconds: extracted.readingTimeSeconds,
    });
  } catch (err: any) {
    console.error(`Failed to init document ${document_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to initialize document state" });
  }
});

/**
 * Internal Endpoint: POST /internal/replace-content
 * Applies restored / imported content inside the live Y.Doc as a transaction.
 * Connected peers see the update immediately and offline copies do not resurrect deleted content.
 */
app.post("/internal/replace-content", authCollabInternal, async (req: Request, res: Response) => {
  const { document_id, company_id, content_json, version_name, is_named, user_id } = req.body;
  if (!document_id) {
    res.status(400).json({ error: "document_id is required" });
    return;
  }

  try {
    // Check if the document is active in memory
    const activeDoc = (server as any).documents?.get(document_id) || (server as any).hocuspocus?.documents?.get(document_id);
    let ydoc = activeDoc;
    let wasActive = true;

    if (!ydoc) {
      wasActive = false;
      console.warn(
        `[replace-content WARNING]: live document '${document_id}' not found in active server.hocuspocus.documents!`
      );
      ydoc = new Y.Doc();
      const existingState = await loadDocumentState(document_id);
      if (existingState && existingState.length > 0) {
        Y.applyUpdate(ydoc, existingState);
      }
    }

    // Apply content replacement inside a transaction
    replaceContentInLiveDoc(ydoc, content_json);

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractDocumentData(ydoc);

    await saveDocumentContent(
      document_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.wordCount,
      extracted.characterCount,
      extracted.readingTimeSeconds
    );

    // Optionally create a named version record
    let versionId: string | null = null;
    if (version_name) {
      versionId = await createDocumentVersion(
        document_id,
        version_name,
        is_named ?? true,
        state,
        extracted.contentJson,
        extracted.plainText,
        user_id
      );
    }

    res.json({
      ok: true,
      document_id,
      version_id: versionId,
      was_live: wasActive,
      word_count: extracted.wordCount,
      character_count: extracted.characterCount,
      reading_time_seconds: extracted.readingTimeSeconds,
    });
  } catch (err: any) {
    console.error(`Failed to replace content for document ${document_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to replace document content" });
  }
});

/**
 * Internal Endpoint: POST /internal/import-docx
 * Converts .docx buffer on server side using mammoth, validates file size (max 25MB),
 * replaces live document content, and creates a version.
 */
app.post("/internal/import-docx", authCollabInternal, async (req: Request, res: Response) => {
  const { document_id, company_id, user_id, file_base64 } = req.body;
  if (!document_id || !file_base64) {
    res.status(400).json({ error: "document_id and file_base64 are required" });
    return;
  }

  try {
    const docxBuffer = Buffer.from(file_base64, "base64");
    // 25MB file size limit
    const MAX_DOCX_BYTES = 25 * 1024 * 1024;
    if (docxBuffer.length > MAX_DOCX_BYTES) {
      res.status(400).json({ error: "File size exceeds 25MB limit" });
      return;
    }

    const contentJson = await convertDocxToProseMirror(docxBuffer);

    // Replace in live doc
    const activeDoc = (server as any).documents?.get(document_id) || (server as any).hocuspocus?.documents?.get(document_id);
    let ydoc = activeDoc;
    let wasActive = true;

    if (!ydoc) {
      wasActive = false;
      console.warn(
        `[import-docx WARNING]: live document '${document_id}' not found in active server.hocuspocus.documents!`
      );
      ydoc = new Y.Doc();
      const existingState = await loadDocumentState(document_id);
      if (existingState && existingState.length > 0) {
        Y.applyUpdate(ydoc, existingState);
      }
    }

    replaceContentInLiveDoc(ydoc, contentJson);

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractDocumentData(ydoc);

    await saveDocumentContent(
      document_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.wordCount,
      extracted.characterCount,
      extracted.readingTimeSeconds
    );

    const versionId = await createDocumentVersion(
      document_id,
      "Word import",
      true,
      state,
      extracted.contentJson,
      extracted.plainText,
      user_id
    );

    res.json({
      ok: true,
      document_id,
      version_id: versionId,
      was_live: wasActive,
      word_count: extracted.wordCount,
      character_count: extracted.characterCount,
      reading_time_seconds: extracted.readingTimeSeconds,
    });
  } catch (err: any) {
    console.error(`Failed to import .docx for document ${document_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to import Word document" });
  }
});

/**
 * Helper to get or load a live spreadsheet Y.Doc
 */
async function getOrLoadLiveSheetDoc(spreadsheetId: string): Promise<{ ydoc: Y.Doc; wasLive: boolean }> {
  const docName = `sheet:${spreadsheetId}`;
  const activeDoc = (server as any).documents?.get(docName) || (server as any).hocuspocus?.documents?.get(docName);
  if (activeDoc) {
    return { ydoc: activeDoc, wasLive: true };
  }
  const record = await loadSpreadsheetRecord(spreadsheetId);
  let ydoc = new Y.Doc();
  if (record?.state && record.state.length > 0) {
    Y.applyUpdate(ydoc, record.state);
  } else if (record?.contentJson) {
    ydoc = buildYDocFromSheets(record.contentJson);
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractSpreadsheetData(ydoc);
    await saveSpreadsheetContent(
      spreadsheetId,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );
  }
  return { ydoc, wasLive: false };
}

/**
 * Internal Endpoint: POST /internal/init-sheet
 */
app.post("/internal/init-sheet", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sheets_data } = req.body;
  if (!spreadsheet_id) {
    res.status(400).json({ error: "spreadsheet_id is required" });
    return;
  }

  try {
    const ydoc = buildYDocFromSheets(sheets_data || []);
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractSpreadsheetData(ydoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    const docName = `sheet:${spreadsheet_id}`;
    const activeDoc = (server as any).documents?.get(docName) || (server as any).hocuspocus?.documents?.get(docName);
    if (activeDoc) {
      Y.applyUpdate(activeDoc, state);
    }

    res.json({
      ok: true,
      spreadsheet_id,
      row_count: extracted.rowCount,
      col_count: extracted.colCount,
      cell_count: extracted.cellCount,
    });
  } catch (err: any) {
    console.error(`Failed to init spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to initialize spreadsheet" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/set-cell
 * Sets cell in live Y.Doc by stable rowId and colId.
 */
app.post("/internal/sheet/set-cell", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sheet_id, row_id, col_id, value } = req.body;
  if (!spreadsheet_id || !sheet_id || !row_id || !col_id) {
    res.status(400).json({ error: "spreadsheet_id, sheet_id, row_id, col_id are required" });
    return;
  }

  try {
    const { ydoc, wasLive } = await getOrLoadLiveSheetDoc(spreadsheet_id);
    setCellInLiveDoc(ydoc, sheet_id, row_id, col_id, value);

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractSpreadsheetData(ydoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    res.json({
      ok: true,
      spreadsheet_id,
      was_live: wasLive,
      row_id,
      col_id,
    });
  } catch (err: any) {
    console.error(`Failed to set cell in spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to set cell" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/insert-row
 */
app.post("/internal/sheet/insert-row", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sheet_id, index } = req.body;
  if (!spreadsheet_id || !sheet_id) {
    res.status(400).json({ error: "spreadsheet_id and sheet_id are required" });
    return;
  }

  try {
    const { ydoc, wasLive } = await getOrLoadLiveSheetDoc(spreadsheet_id);
    const newRowId = insertRowInLiveDoc(ydoc, sheet_id, typeof index === "number" ? index : 0);

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractSpreadsheetData(ydoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    res.json({
      ok: true,
      spreadsheet_id,
      new_row_id: newRowId,
      was_live: wasLive,
    });
  } catch (err: any) {
    console.error(`Failed to insert row in spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to insert row" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/set-column-meta
 */
app.post("/internal/sheet/set-column-meta", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sheet_id, col_id, meta } = req.body;
  if (!spreadsheet_id || !sheet_id || !col_id || !meta) {
    res.status(400).json({ error: "spreadsheet_id, sheet_id, col_id, and meta are required" });
    return;
  }

  try {
    const { ydoc, wasLive } = await getOrLoadLiveSheetDoc(spreadsheet_id);
    setColumnMetaInLiveDoc(ydoc, sheet_id, col_id, meta);

    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    const extracted = extractSpreadsheetData(ydoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    res.json({
      ok: true,
      spreadsheet_id,
      col_id,
      was_live: wasLive,
    });
  } catch (err: any) {
    console.error(`Failed to set column meta for spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to set column metadata" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/get-view
 * Returns JSON sheets data. If sanitized is true, strips all hidden columns and marks locked columns.
 */
app.post("/internal/sheet/get-view", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sanitized } = req.body;
  if (!spreadsheet_id) {
    res.status(400).json({ error: "spreadsheet_id is required" });
    return;
  }

  try {
    const { ydoc } = await getOrLoadLiveSheetDoc(spreadsheet_id);
    const sheets = yDocToFortuneSheet(ydoc, !!sanitized);

    res.json({
      ok: true,
      spreadsheet_id,
      sheets,
    });
  } catch (err: any) {
    console.error(`Failed to get view for spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to get sheet view" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/replace-content
 */
app.post("/internal/sheet/replace-content", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, sheets_data, version_name, is_named, user_id } = req.body;
  if (!spreadsheet_id) {
    res.status(400).json({ error: "spreadsheet_id is required" });
    return;
  }

  try {
    const docName = `sheet:${spreadsheet_id}`;
    const activeDoc = (server as any).documents?.get(docName) || (server as any).hocuspocus?.documents?.get(docName);
    const newYDoc = buildYDocFromSheets(sheets_data || []);
    const state = Buffer.from(Y.encodeStateAsUpdate(newYDoc));

    if (activeDoc) {
      Y.applyUpdate(activeDoc, state);
    }

    const extracted = extractSpreadsheetData(activeDoc || newYDoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    let versionId: string | null = null;
    if (version_name) {
      versionId = await createSpreadsheetVersion(
        spreadsheet_id,
        version_name,
        is_named ?? true,
        state,
        extracted.contentJson,
        extracted.plainText,
        user_id
      );
    }

    res.json({
      ok: true,
      spreadsheet_id,
      version_id: versionId,
      row_count: extracted.rowCount,
      col_count: extracted.colCount,
      cell_count: extracted.cellCount,
    });
  } catch (err: any) {
    console.error(`Failed to replace spreadsheet content for ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to replace spreadsheet content" });
  }
});

/**
 * Internal Endpoint: POST /internal/sheet/import-excel
 */
app.post("/internal/sheet/import-excel", authCollabInternal, async (req: Request, res: Response) => {
  const { spreadsheet_id, file_base64, filename, user_id } = req.body;
  if (!spreadsheet_id || !file_base64) {
    res.status(400).json({ error: "spreadsheet_id and file_base64 are required" });
    return;
  }

  try {
    const fileBuffer = Buffer.from(file_base64, "base64");
    const MAX_BYTES = 25 * 1024 * 1024; // 25MB limit
    if (fileBuffer.length > MAX_BYTES) {
      res.status(400).json({ error: "File size exceeds 25MB limit" });
      return;
    }

    const sheetsData = await parseExcelOrCsvBuffer(fileBuffer, filename || "import.xlsx");
    const newYDoc = buildYDocFromSheets(sheetsData);
    const state = Buffer.from(Y.encodeStateAsUpdate(newYDoc));

    const docName = `sheet:${spreadsheet_id}`;
    const activeDoc = (server as any).documents?.get(docName) || (server as any).hocuspocus?.documents?.get(docName);
    if (activeDoc) {
      Y.applyUpdate(activeDoc, state);
    }

    const extracted = extractSpreadsheetData(activeDoc || newYDoc);

    await saveSpreadsheetContent(
      spreadsheet_id,
      state,
      extracted.contentJson,
      extracted.plainText,
      extracted.publicPlainText,
      extracted.rowCount,
      extracted.colCount,
      extracted.cellCount
    );

    const versionId = await createSpreadsheetVersion(
      spreadsheet_id,
      `Import: ${filename || "Excel/CSV"}`,
      true,
      state,
      extracted.contentJson,
      extracted.plainText,
      user_id
    );

    res.json({
      ok: true,
      spreadsheet_id,
      version_id: versionId,
      row_count: extracted.rowCount,
      col_count: extracted.colCount,
      cell_count: extracted.cellCount,
    });
  } catch (err: any) {
    console.error(`Failed to import Excel/CSV for spreadsheet ${spreadsheet_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to import Excel/CSV" });
  }
});

/**
 * Internal Endpoint: POST /internal/preview-pdf-html
 * Returns printable sanitized HTML for the live preview dialog in the UI.
 */
app.post("/internal/preview-pdf-html", authCollabInternal, async (req: Request, res: Response) => {
  try {
    let { html, content_json, sheets, title, background, theme_color, size, margins, orientation, fit_to_width, include_team_notes } = req.body;

    if (!html) {
      if (content_json) {
        html = prosemirrorJsonToHtml(content_json);
      } else if (sheets) {
        html = spreadsheetDataToHtml(sheets);
      } else {
        html = "<p></p>";
      }
    }

    const printableHtml = buildPrintableHtml({
      html,
      title,
      background,
      theme_color,
      size,
      margins,
      orientation,
      fit_to_width,
      include_team_notes,
    });

    res.json({ html: printableHtml });
  } catch (err: any) {
    console.error("Failed to build PDF preview HTML:", err);
    res.status(500).json({ error: err?.message || "Failed to build preview" });
  }
});

/**
 * Internal Endpoint: POST /internal/export-pdf
 * Generates a PDF via headless Chromium with page breaks, Inter font, page numbers, and custom themes.
 */
app.post("/internal/export-pdf", authCollabInternal, async (req: Request, res: Response) => {
  try {
    let { html, content_json, sheets, title, background, theme_color, size, margins, orientation, fit_to_width, include_team_notes } = req.body;

    if (!html) {
      if (content_json) {
        html = prosemirrorJsonToHtml(content_json);
      } else if (sheets) {
        html = spreadsheetDataToHtml(sheets);
      } else {
        res.status(400).json({ error: "Missing document content or html" });
        return;
      }
    }

    const pdfBuffer = await generatePdf({
      html,
      title,
      background,
      theme_color,
      size,
      margins,
      orientation,
      fit_to_width,
      include_team_notes,
    });

    const safeFilename = (title || "export").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Failed to export PDF:", err);
    res.status(500).json({ error: err?.message || "Failed to generate PDF" });
  }
});

// Attach Express router to Hocuspocus HTTP server
server.httpServer.removeAllListeners("request");
server.httpServer.on("request", app);

server.listen().then(() => {
  console.log(`[Playhead Collab] Server listening on ws & http://localhost:${PORT}`);
});
