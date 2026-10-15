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
} from "./prosemirror-converter.js";

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
    const state = await loadDocumentState(data.documentName);
    if (state && state.length > 0) {
      Y.applyUpdate(data.document, state);
    }
    return data.document;
  },

  async onStoreDocument(data: onStoreDocumentPayload) {
    const state = Buffer.from(Y.encodeStateAsUpdate(data.document));
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

    // Requirement 4: Automatic version when there were edits and last version >= 10 minutes old
    await checkAndCreateAutomaticVersion(
      data.documentName,
      state,
      extracted.contentJson,
      extracted.plainText
    );
  },

  async beforeUnloadDocument(data: beforeUnloadDocumentPayload) {
    // Last person left: ensure document state is stored cleanly
    const state = Buffer.from(Y.encodeStateAsUpdate(data.document));
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
    let ydoc = (server as any).hocuspocus?.documents?.get(document_id);
    let wasActive = true;

    if (!ydoc) {
      wasActive = false;
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
    let ydoc = (server as any).hocuspocus?.documents?.get(document_id);
    if (!ydoc) {
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
      word_count: extracted.wordCount,
      character_count: extracted.characterCount,
      reading_time_seconds: extracted.readingTimeSeconds,
    });
  } catch (err: any) {
    console.error(`Failed to import .docx for document ${document_id}:`, err);
    res.status(500).json({ error: err.message || "Failed to import Word document" });
  }
});

// Attach Express router to Hocuspocus HTTP server
server.httpServer.removeAllListeners("request");
server.httpServer.on("request", app);

server.listen().then(() => {
  console.log(`[Playhead Collab] Server listening on ws & http://localhost:${PORT}`);
});
