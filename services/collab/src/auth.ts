import Redis from "ioredis";

export interface VerifyResult {
  allowed: boolean;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string;
  color?: string;
  is_team_member: boolean;
  access_level: string;
  read_only: boolean;
  reason?: string;
}

const API_URL = process.env.API_URL || "http://localhost:8080";
const COLLAB_INTERNAL_SECRET =
  process.env.COLLAB_INTERNAL_SECRET || "default-dev-collab-secret-at-least-32-chars-long";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export async function verifyTicketWithApi(
  documentId: string,
  ticket: string
): Promise<VerifyResult> {
  const endpoint = `${API_URL}/api/internal/collab/verify`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Collab-Secret": COLLAB_INTERNAL_SECRET,
      },
      body: JSON.stringify({
        document_id: documentId,
        ticket,
      }),
    });

    if (!res.ok) {
      return {
        allowed: false,
        user_id: "",
        name: "",
        email: "",
        is_team_member: false,
        access_level: "none",
        read_only: true,
        reason: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = (await res.json()) as VerifyResult;
    return data;
  } catch (err: any) {
    console.error("Failed to verify ticket with Go API:", err);
    return {
      allowed: false,
      user_id: "",
      name: "",
      email: "",
      is_team_member: false,
      access_level: "none",
      read_only: true,
      reason: err.message,
    };
  }
}

// Active connection registry for 5-second revocation & Redis pub/sub eviction
interface ActiveConn {
  documentId: string;
  userId: string;
  ticket: string;
  connectedAt: number;
  lastCheckedAt: number;
  socket: any;
}

const activeConnections = new Map<string, ActiveConn>();

export function registerConnection(
  id: string,
  documentId: string,
  userId: string,
  ticket: string,
  socket: any
) {
  activeConnections.set(id, {
    documentId,
    userId,
    ticket,
    connectedAt: Date.now(),
    lastCheckedAt: Date.now(),
    socket,
  });
}

export function unregisterConnection(id: string) {
  activeConnections.delete(id);
}

// Redis Pub/Sub for immediate revocation
export function setupRevocationListener() {
  const sub = new Redis(REDIS_URL, {
    lazyConnect: true,
  });

  sub.connect()
    .then(() => {
      sub.subscribe("playhead:collab:revocations", (err) => {
        if (err) {
          console.error("Failed to subscribe to playhead:collab:revocations:", err);
        } else {
          console.log("Subscribed to playhead:collab:revocations");
        }
      });

      sub.on("message", (channel, message) => {
        if (channel === "playhead:collab:revocations") {
          try {
            const payload = JSON.parse(message);
            const { document_id, user_id } = payload;
            for (const [connId, conn] of activeConnections.entries()) {
              if (
                (!document_id || conn.documentId === document_id) &&
                (!user_id || conn.userId === user_id)
              ) {
                console.log(`[REVOKE] Evicting connection ${connId} for user ${conn.userId}`);
                try {
                  conn.socket?.close(4403, "Access revoked");
                } catch (e) {
                  // ignore
                }
                activeConnections.delete(connId);
              }
            }
          } catch (e) {
            console.error("Failed to parse revocation payload:", e);
          }
        }
      });
    })
    .catch((err) => {
      console.warn("Redis pub/sub not available for collab service (using 5s poll fallback):", err.message);
    });

  // 5-second polling fallback loop
  setInterval(async () => {
    const now = Date.now();
    for (const [connId, conn] of activeConnections.entries()) {
      // Re-verify connections every 5 seconds
      if (now - conn.lastCheckedAt >= 5000) {
        conn.lastCheckedAt = now;
        try {
          const res = await verifyTicketWithApi(conn.documentId, conn.ticket);
          if (!res.allowed || !res.is_team_member) {
            console.log(`[REVOKE-5s] Evicting connection ${connId} for user ${conn.userId}`);
            try {
              conn.socket?.close(4403, "Access revoked");
            } catch (e) {
              // ignore
            }
            activeConnections.delete(connId);
          }
        } catch (err) {
          // Keep connection if transient network issue
        }
      }
    }
  }, 5000);
}
