"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Share2,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from "@/components/ui/icon";
import { toast } from "@/lib/toast";
import { VideoPlayer } from "./video-player";
import { CommentsPanel, CommentItem, ReviewHistoryItem, VersionInfoItem } from "./comments-panel";
import { CommentComposer } from "./comment-composer";
import { DrawingData } from "./drawing-overlay";
import { VersionCompare } from "./version-compare";

export interface ReviewItemData {
  id: string;
  project_id: string;
  project_name?: string;
  name: string;
  kind: string;
  mime: string;
  size_bytes: number;
  review_status: string;
  latest_version_number: number;
  created_at: string;
  created_by_name?: string;
}

interface ReviewWorkspaceProps {
  item: ReviewItemData;
  itemsList?: ReviewItemData[];
  canDownload?: boolean;
  canApprove?: boolean;
  canComment?: boolean;
  isTeamMember?: boolean;
  currentUserId?: string;
  onClose: () => void;
  onSelectNext?: () => void;
  onSelectPrev?: () => void;
  onOpenShare?: () => void;
  publicShareToken?: string; // set when opened via public share link
}
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)playhead_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = getCsrfToken();
    if (csrf && !headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", csrf);
    }
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });
}

export function ReviewWorkspace({
  item,
  itemsList = [],
  canDownload = true,
  canApprove = true,
  canComment = true,
  isTeamMember = true,
  currentUserId,
  onClose,
  onSelectNext,
  onSelectPrev,
  onOpenShare,
  publicShareToken,
}: ReviewWorkspaceProps) {
  const [activeVersionNumber, setActiveVersionNumber] = useState<number>(item.latest_version_number || 1);
  const [versions, setVersions] = useState<VersionInfoItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistoryItem[]>([]);
  const [reviewStatus, setReviewStatus] = useState<string>(item.review_status || "needs_review");
  const [mentionable, setMentionable] = useState<any[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [activeDrawing, setActiveDrawing] = useState<DrawingData | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState<boolean>(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState<boolean>(false);
  const [approvalDecision, setApprovalDecision] = useState<"approved" | "changes_requested">("approved");
  const [approvalNote, setApprovalNote] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [visitorName, setVisitorName] = useState<string>("");
  const [visitorEmail, setVisitorEmail] = useState<string>("");

  const isPublic = !!publicShareToken;
  const basePath = isPublic ? `/api/v1/s/${publicShareToken}` : `/api/v1`;

  // Item position counter (e.g. "1 of 5")
  const currentIndex = itemsList.findIndex((i) => i.id === item.id);
  const positionText = itemsList.length > 0 ? `${currentIndex >= 0 ? currentIndex + 1 : 1} of ${itemsList.length}` : "";

  // 1. Fetch versions for item
  const fetchVersions = useCallback(async () => {
    if (isPublic) return; // public share links use single version or current
    try {
      const res = await authFetch(`/api/v1/items/${item.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        if (data.versions) {
          setVersions(data.versions);
        }
      }
    } catch (e) {
      console.error("Failed to load versions:", e);
    }
  }, [item.id, isPublic]);

  // 2. Fetch comments list (Requirement 7: Team only filter enforced on server)
  const fetchComments = useCallback(async () => {
    try {
      const url = isPublic
        ? `/api/v1/s/${publicShareToken}/items/${item.id}/comments`
        : `/api/v1/items/${item.id}/comments`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.comments) {
          setComments(data.comments);
        }
      }
    } catch (e) {
      console.error("Failed to load comments:", e);
    }
  }, [item.id, isPublic, publicShareToken]);

  // 3. Fetch review history
  const fetchReviews = useCallback(async () => {
    if (isPublic) return;
    try {
      const res = await authFetch(`/api/v1/items/${item.id}/reviews`);
      if (res.ok) {
        const data = await res.json();
        if (data.reviews) {
          setReviewHistory(data.reviews);
        }
      }
    } catch (e) {
      console.error("Failed to load reviews:", e);
    }
  }, [item.id, isPublic]);

  // 4. Fetch mentionable list (Requirement 9: people who have access)
  const fetchMentionable = useCallback(async () => {
    if (isPublic) return;
    try {
      const res = await authFetch(`/api/v1/items/${item.id}/mentionable`);
      if (res.ok) {
        const data = await res.json();
        if (data.mentionable) {
          setMentionable(data.mentionable);
        }
      }
    } catch (e) {
      console.error("Failed to load mentionable:", e);
    }
  }, [item.id, isPublic]);

  // Initial load
  useEffect(() => {
    fetchVersions();
    fetchComments();
    fetchReviews();
    fetchMentionable();
  }, [fetchVersions, fetchComments, fetchReviews, fetchMentionable]);

  // Requirement 8: Live updates via 8s polling
  useEffect(() => {
    const timer = setInterval(() => {
      fetchComments();
      if (!isPublic) fetchReviews();
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchComments, fetchReviews, isPublic]);

  // Current active version metadata
  const currentVersion = versions.find((v) => v.number === activeVersionNumber);
  const playlistUrl = isPublic
    ? `/api/v1/s/${publicShareToken}/items/${item.id}/playlist.m3u8`
    : `/api/v1/items/${item.id}/versions/${activeVersionNumber}/playlist.m3u8`;

  // Submit comment handler
  const handleCreateComment = async (data: {
    body: string;
    visibility: "everyone" | "team";
    timecodeStartMs: number | null;
    timecodeEndMs: number | null;
  }) => {
    const url = isPublic
      ? `/api/v1/s/${publicShareToken}/items/${item.id}/comments`
      : `/api/v1/items/${item.id}/comments`;

    const payload: any = {
      version_id: currentVersion?.id,
      body: data.body,
      visibility: data.visibility,
      timecode_start_ms: data.timecodeStartMs,
      timecode_end_ms: data.timecodeEndMs,
      drawing: activeDrawing ? activeDrawing.shapes : null,
    };

    if (isPublic) {
      payload.visitor_name = visitorName || "Guest Reviewer";
      payload.visitor_email = visitorEmail || "guest@review.com";
    }

    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setActiveDrawing(null);
      setIsDrawingMode(false);
      await fetchComments();
    } else {
      const err = await res.json();
      throw new Error(err.message || "Failed to post comment");
    }
  };

  // Reply handler
  const handleReplyComment = async (parentId: string, bodyText: string) => {
    const url = isPublic
      ? `/api/v1/s/${publicShareToken}/items/${item.id}/comments`
      : `/api/v1/items/${item.id}/comments`;

    const payload: any = {
      parent_id: parentId,
      version_id: currentVersion?.id,
      body: bodyText,
      visibility: "everyone",
    };

    if (isPublic) {
      payload.visitor_name = visitorName || "Guest Reviewer";
      payload.visitor_email = visitorEmail || "guest@review.com";
    }

    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchComments();
    }
  };

  // Resolve comment
  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    const endpoint = resolved ? `/api/v1/comments/${commentId}/resolve` : `/api/v1/comments/${commentId}/reopen`;
    const res = await authFetch(endpoint, { method: "POST" });
    if (res.ok) {
      await fetchComments();
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    const res = await authFetch(`/api/v1/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchComments();
    }
  };

  // Edit comment
  const handleEditComment = async (commentId: string, newBody: string) => {
    const res = await authFetch(`/api/v1/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newBody }),
    });
    if (res.ok) {
      await fetchComments();
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const url = isPublic
      ? `/api/v1/s/${publicShareToken}/items/${item.id}/comments/export`
      : `/api/v1/items/${item.id}/comments/export`;
    window.open(url, "_blank");
  };

  // Submit Approval / Request Changes decision
  const handleSubmitReviewDecision = async () => {
    const url = isPublic
      ? `/api/v1/s/${publicShareToken}/items/${item.id}/review`
      : `/api/v1/items/${item.id}/review`;

    const payload: any = {
      version_id: currentVersion?.id,
      decision: approvalDecision,
      note: approvalNote,
    };

    if (isPublic) {
      payload.visitor_name = visitorName;
      payload.visitor_email = visitorEmail;
    }

    const res = await authFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setReviewStatus(approvalDecision);
      setShowApprovalDialog(false);
      setApprovalNote("");
      toast.success(`Review decision submitted: ${approvalDecision}`);
      if (!isPublic) await fetchReviews();
    } else {
      const err = await res.json();
      toast.error(err.message || "Failed to submit decision");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#181818] text-white font-sans animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="flex h-14 items-center justify-between border-b border-[#212121] px-6 bg-[#181818]">
        {/* Left: Back button, project breadcrumb, filename, version dropdown, review status chip */}
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#A3A6AD] hover:bg-[#181818] hover:text-white transition-colors"
            title="Back to project (Esc)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 text-xs">
            {item.project_name && (
              <>
                <span className="text-[#A3A6AD] max-w-[120px] truncate">{item.project_name}</span>
                <span className="text-[#424344]">/</span>
              </>
            )}
            <span className="font-semibold text-white max-w-[200px] truncate" title={item.name}>
              {item.name}
            </span>
          </div>

          {/* Version Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181818] hover:bg-[#212121] border border-[#2E2F34] text-xs font-mono font-bold text-white transition-colors"
            >
              <span>v{activeVersionNumber}</span>
              <ChevronDown className="w-3 h-3 text-[#A3A6AD]" />
            </button>

            {showVersionDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#181818] border border-[#2E2F34] rounded-xl shadow-overlay p-1 z-50">
                <div className="px-2.5 py-1 text-xs text-[#A3A6AD]  font-semibold">
                  Switch Version
                </div>
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setActiveVersionNumber(v.number);
                      setShowVersionDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                      v.number === activeVersionNumber ? "bg-[#FFBB56] text-white" : "text-[#A3A6AD] hover:bg-[#212121]"
                    }`}
                  >
                    <span>Version v{v.number}</span>
                    <span className="text-xs opacity-70">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Review Status Chip */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold  ${
              reviewStatus === "approved"
                ? "bg-[#3FCF8E]/15 text-[#3FCF8E] border border-[#3FCF8E]/30"
                : reviewStatus === "changes_requested"
                ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30"
                : "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30"
            }`}
          >
            {reviewStatus === "approved" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : reviewStatus === "changes_requested" ? (
              <AlertCircle className="w-3 h-3" />
            ) : (
              <Clock className="w-3 h-3" />
            )}
            <span>{reviewStatus.replace("_", " ")}</span>
          </div>
        </div>

        {/* Center: Item Position Counter (1 of N) */}
        {positionText && (
          <div className="hidden md:flex items-center gap-2 bg-[#181818] px-3 py-1 rounded-full border border-[#212121] text-xs text-[#A3A6AD]">
            {onSelectPrev && (
              <button onClick={onSelectPrev} className="hover:text-white transition-colors" title="Previous item">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="font-mono text-xs">{positionText}</span>
            {onSelectNext && (
              <button onClick={onSelectNext} className="hover:text-white transition-colors" title="Next item">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Right: Actions (Request Changes, Approve, Share, Copy Link) */}
        <div className="flex items-center gap-2.5">
          {canApprove && (
            <>
              {/* Request Changes (red outline) */}
              <button
                onClick={() => {
                  setApprovalDecision("changes_requested");
                  setShowApprovalDialog(true);
                }}
                className="px-3 py-1.5 rounded-lg border border-[#EF4444]/60 text-[#EF4444] hover:bg-[#EF4444]/10 text-xs font-semibold transition-colors"
              >
                Request changes
              </button>

              {/* Approve (green button) */}
              <button
                onClick={() => {
                  setApprovalDecision("approved");
                  setShowApprovalDialog(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#3FCF8E] hover:bg-[#3FCF8E] text-black text-xs font-bold shadow transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>
            </>
          )}

          {/* Share Button (Internal only) */}
          {onOpenShare && !isPublic && (
            <button
              onClick={onOpenShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#212121] text-xs font-semibold text-white border border-[#2E2F34] transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-[#FFBB56]" />
              <span>Share</span>
            </button>
          )}

          {/* Copy Link Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#212121] text-xs font-medium text-[#A3A6AD] hover:text-white border border-[#2E2F34] transition-colors"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>{copiedLink ? "Copied!" : "Copy link"}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left / Center Player Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#181818] overflow-hidden">
          <VideoPlayer
            playlistUrl={playlistUrl}
            isAudio={item.kind === "audio" || item.mime.startsWith("audio/")}
            mime={item.mime}
            fileName={item.name}
            versionNumber={activeVersionNumber}
            uploaderName={currentVersion?.uploader_name || item.created_by_name}
            uploadDate={new Date(item.created_at).toLocaleDateString()}
            width={currentVersion?.width}
            height={currentVersion?.height}
            fps={currentVersion?.fps || 24}
            durationMs={currentVersion?.duration_ms}
            fileSizeBytes={currentVersion?.size_bytes || item.size_bytes}
            comments={comments.map((c) => ({
              id: c.id,
              author_name: c.author_name,
              timecode_start_ms: c.timecode_start_ms,
              timecode_end_ms: c.timecode_end_ms,
              visibility: c.visibility,
              body: c.body,
              resolved: !!c.resolved_at,
            }))}
            activeDrawing={activeDrawing}
            isDrawingMode={isDrawingMode}
            onDrawingChange={setActiveDrawing}
            onDrawingClose={() => setIsDrawingMode(false)}
            onTimeUpdate={setCurrentTimeMs}
            onSeekToComment={(commentId) => {
              const c = comments.find((cm) => cm.id === commentId);
              if (c && c.drawing) {
                setActiveDrawing(c.drawing);
              }
            }}
            onToggleCompare={() => setIsComparing(true)}
            isComparing={isComparing}
            canDownload={canDownload}
          />
        </div>

        {/* Right Sidebar: Comments & Details Panel with Bottom Composer */}
        <div className="w-full lg:w-96 flex flex-col h-72 lg:h-full border-t lg:border-t-0 lg:border-l border-[#212121] bg-[#181818]">
          {/* Comments Panel */}
          <div className="flex-1 overflow-hidden">
            <CommentsPanel
              itemId={item.id}
              comments={comments}
              reviewHistory={reviewHistory}
              versions={versions}
              activeVersionNumber={activeVersionNumber}
              reviewStatus={reviewStatus}
              fps={currentVersion?.fps || 24}
              currentUserId={currentUserId}
              hasFullAccess={canApprove}
              canComment={canComment}
              onSeekToTime={(timeMs) => setCurrentTimeMs(timeMs)}
              onPreviewDrawing={(drawing) => setActiveDrawing(drawing)}
              onResolveComment={handleResolveComment}
              onDeleteComment={handleDeleteComment}
              onEditComment={handleEditComment}
              onReplyComment={handleReplyComment}
              onExportCSV={handleExportCSV}
              onSelectVersion={(vNum) => setActiveVersionNumber(vNum)}
            />
          </div>

          {/* Bottom Comment Composer */}
          {canComment && (
            <CommentComposer
              currentTimeMs={currentTimeMs}
              fps={currentVersion?.fps || 24}
              canUseTeamOnly={isTeamMember && !isPublic}
              mentionableList={mentionable}
              hasDrawing={!!activeDrawing}
              onToggleDrawing={() => setIsDrawingMode(!isDrawingMode)}
              onSubmitComment={handleCreateComment}
            />
          )}
        </div>
      </div>

      {/* Decision Dialog Modal (Approve or Request Changes) */}
      {showApprovalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-[#181818] border border-[#212121] rounded-xl shadow-overlay p-6 space-y-4">
            <h3 className="text-base font-bold text-white capitalize">
              {approvalDecision === "approved" ? "Approve this version" : "Request changes"}
            </h3>
            <p className="text-xs text-[#A3A6AD]">
              {approvalDecision === "approved"
                ? "This version will be marked as approved. Team and clients will see your decision."
                : "Let the editors know what adjustments are required before final delivery."}
            </p>

            {isPublic && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Your Name *"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  className="w-full bg-[#181818] text-xs p-2.5 rounded-lg border border-[#212121] text-white outline-none focus:border-[#FFBB56]"
                />
                <input
                  type="email"
                  placeholder="Your Email *"
                  value={visitorEmail}
                  onChange={(e) => setVisitorEmail(e.target.value)}
                  className="w-full bg-[#181818] text-xs p-2.5 rounded-lg border border-[#212121] text-white outline-none focus:border-[#FFBB56]"
                />
              </div>
            )}

            <textarea
              placeholder="Add optional notes about your decision..."
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              rows={3}
              className="w-full bg-[#181818] text-xs p-3 rounded-xl border border-[#212121] text-white outline-none focus:border-[#FFBB56] placeholder-[#A3A6AD] resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowApprovalDialog(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#A3A6AD] hover:text-white hover:bg-[#181818] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReviewDecision}
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all shadow ${
                  approvalDecision === "approved"
                    ? "bg-[#3FCF8E] hover:bg-[#3FCF8E] text-black"
                    : "bg-[#EF4444] hover:bg-[#DC2626] text-white"
                }`}
              >
                {approvalDecision === "approved" ? "Confirm Approval" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version Compare Modal */}
      {isComparing && versions.length > 0 && (
        <VersionCompare
          itemId={item.id}
          versions={versions}
          currentVersionNumber={activeVersionNumber}
          onClose={() => setIsComparing(false)}
          fps={currentVersion?.fps || 24}
        />
      )}
    </div>
  );
}
