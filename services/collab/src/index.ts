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
import { loadDocumentState, saveDocumentContent } from "./database.js";
import { extractDocumentData } from "./text-extractor.js";
import {
  verifyTicketWithApi,
  registerConnection,
  unregisterConnection,
  setupRevocationListener,
} from "./auth.js";

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

const PORT = parseInt(process.env.PORT || "8082", 10);

// Setup Redis revocation listener and 5s polling loop
setupRevocationListener();

// 2. Configure Hocuspocus Server
const server = new Server({
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

server.listen().then(() => {
  console.log(`[Playhead Collab] Server listening on ws://localhost:${PORT}`);
});
