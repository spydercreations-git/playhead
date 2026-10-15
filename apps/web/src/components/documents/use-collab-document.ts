"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

export type SyncStatus = "saved" | "saving" | "offline";

interface CollabTicketResponse {
  ticket: string;
  expires_at: string;
}

interface CollabUser {
  name: string;
  color: string;
  avatar?: string;
}

const COLLAB_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#6366f1", // Indigo
];

function pickColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

interface UseCollabDocumentOptions {
  documentId: string;
  isTeamMember: boolean;
  canEdit: boolean;
  initialContentJson?: any;
}

export function useCollabDocument({
  documentId,
  isTeamMember,
  canEdit,
  initialContentJson,
}: UseCollabDocumentOptions) {
  const { user } = useAuth();

  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("saved");
  const [activeUsers, setActiveUsers] = useState<CollabUser[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Single persistent Y.Doc instance for this document
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const indexeddbProviderRef = useRef<IndexeddbPersistence | null>(null);

  // Color & presence state
  const userColor = useMemo(() => {
    return pickColor(user?.id || user?.name || "anonymous");
  }, [user]);

  // Online / Offline window listeners
  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
      setSyncStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Initialize Collab or Offline IndexedDB
  useEffect(() => {
    if (!documentId) return;

    // Hard Rule 1: Non-team people NEVER connect to live Yjs WebSocket
    if (!isTeamMember) {
      setSyncStatus("saved");
      return;
    }

    let isMounted = true;
    let hpProvider: HocuspocusProvider | null = null;

    // 1. Setup offline IndexedDB persistence
    try {
      const idb = new IndexeddbPersistence(`playhead-doc-${documentId}`, ydoc);
      indexeddbProviderRef.current = idb;

      idb.on("synced", () => {
        if (isMounted) {
          // Local offline data is ready
        }
      });
    } catch (e) {
      console.warn("Failed to initialize IndexedDB persistence", e);
    }

    // 2. Fetch short-lived signed collab ticket (60s validity) and connect
    async function initCollab() {
      try {
        setSyncStatus("saving");
        const res = await apiRequest<CollabTicketResponse>(
          `/documents/${documentId}/collab-ticket`,
          { method: "POST" }
        );

        if (!isMounted) return;

        const wsBaseUrl =
          process.env.NEXT_PUBLIC_COLLAB_WS_URL || "ws://localhost:8082";

        hpProvider = new HocuspocusProvider({
          url: wsBaseUrl,
          name: documentId,
          document: ydoc,
          token: res.ticket,
          // Listeners for sync and status
          onStatus: (data) => {
            if (!isMounted) return;
            if (data.status === "connecting") {
              setSyncStatus("saving");
            } else if (data.status === "connected") {
              setSyncStatus("saved");
            } else if (data.status === "disconnected") {
              setSyncStatus("offline");
            }
          },
          onSynced: () => {
            if (isMounted) {
              setSyncStatus("saved");
            }
          },
          onAwarenessUpdate: ({ states }) => {
            if (!isMounted) return;
            const users: CollabUser[] = [];
            states.forEach((state: any) => {
              if (state.user && state.user.name) {
                users.push(state.user);
              }
            });
            setActiveUsers(users);
          },
        });

        // Set user awareness
        hpProvider.setAwarenessField("user", {
          name: user?.name || "Collaborator",
          color: userColor,
          avatar: user?.avatar_url,
        });

        if (isMounted) {
          setProvider(hpProvider);
        }
      } catch (err) {
        console.warn("Collab ticket error or connection refused:", err);
        if (isMounted) {
          setSyncStatus("offline");
        }
      }
    }

    initCollab();

    return () => {
      isMounted = false;
      if (hpProvider) {
        hpProvider.destroy();
      }
      if (indexeddbProviderRef.current) {
        indexeddbProviderRef.current.destroy();
      }
      ydoc.destroy();
    };
  }, [documentId, isTeamMember, ydoc, user, userColor]);

  return {
    ydoc,
    provider,
    syncStatus,
    setSyncStatus,
    activeUsers,
    userColor,
    isOffline,
  };
}
