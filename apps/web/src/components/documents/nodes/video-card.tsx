"use client";

import React, { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Lock, Play, Film, AlertCircle, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/api";

interface VideoCardData {
  has_access: boolean;
  id?: string;
  name?: string;
  thumbnail_url?: string;
  version_number?: number;
  review_status?: string;
  duration_ms?: number;
}

function VideoCardView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const itemId = node.attrs.itemId;
  const docId = node.attrs.documentId;
  const shareToken = node.attrs.shareToken;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VideoCardData | null>(null);

  useEffect(() => {
    if (!itemId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadCardPreview() {
      try {
        setLoading(true);
        let endpoint = `/documents/${docId}/items/${itemId}/card-preview`;
        if (shareToken) {
          endpoint = `/s/${shareToken}/documents/${docId}/items/${itemId}/card-preview`;
        }
        const res = await apiRequest<VideoCardData>(endpoint);
        if (isMounted) {
          setData(res);
        }
      } catch (err) {
        if (isMounted) {
          setData({ has_access: false });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCardPreview();
    return () => {
      isMounted = false;
    };
  }, [itemId, docId, shareToken]);

  if (loading) {
    return (
      <NodeViewWrapper className="my-4">
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50 animate-pulse max-w-md">
          <div className="w-20 h-14 bg-muted rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // Refused or no access rule
  if (!data || !data.has_access) {
    return (
      <NodeViewWrapper className="my-4">
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/60 bg-muted/20 text-muted-foreground max-w-md select-none">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground/70">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground/80 flex items-center gap-1.5">
              <span>Restricted video item</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              No access — you do not have permission to view this video
            </p>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  const statusColors: Record<string, string> = {
    approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    in_review: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    changes_requested: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  const statusLabel: Record<string, string> = {
    approved: "Approved",
    in_review: "In Review",
    changes_requested: "Changes Requested",
  };

  return (
    <NodeViewWrapper className="my-4">
      <div
        className="group relative flex items-center gap-4 p-3 rounded-xl border border-border bg-card/80 hover:bg-card hover:border-primary/40 transition-all max-w-lg cursor-pointer shadow-sm select-none"
        onClick={() => {
          if (data.id) {
            window.open(`/review/${data.id}`, "_blank");
          }
        }}
      >
        {/* Thumbnail Preview with Play Icon */}
        <div className="relative w-24 h-16 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center border border-border/50">
          {data.thumbnail_url ? (
            <img
              src={data.thumbnail_url}
              alt={data.name || "Video thumbnail"}
              className="w-full h-full object-cover"
            />
          ) : (
            <Film className="w-6 h-6 text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </div>
        </div>

        {/* Video Metadata */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {data.name || "Untitled Video"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {data.version_number && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                v{data.version_number}
              </span>
            )}

            {data.review_status && statusLabel[data.review_status] && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  statusColors[data.review_status] || "bg-muted text-muted-foreground"
                }`}
              >
                {statusLabel[data.review_status]}
              </span>
            )}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const PlayheadVideoCard = Node.create({
  name: "playheadVideoCard",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      itemId: {
        default: null,
      },
      documentId: {
        default: null,
      },
      shareToken: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="playhead-video-card"]',
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          return {
            itemId: element.getAttribute("data-item-id"),
            documentId: element.getAttribute("data-document-id"),
            shareToken: element.getAttribute("data-share-token"),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "playhead-video-card",
        "data-item-id": HTMLAttributes.itemId,
        "data-document-id": HTMLAttributes.documentId,
        "data-share-token": HTMLAttributes.shareToken,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoCardView);
  },
});
