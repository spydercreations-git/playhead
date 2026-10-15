"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Info,
  CheckCircle2,
  Circle,
  Download,
  Search,
  Lock,
  CornerDownRight,
  Trash2,
  Edit2,
  Eye,
  Check,
  X,
  FileText,
  Clock,
  Sparkles,
  User,
} from "lucide-react";
import { formatTimecode, TimecodeFormat } from "./timecode";

export interface CommentItem {
  id: string;
  item_id: string;
  version_id: string;
  parent_id?: string | null;
  author_user_id?: string | null;
  author_visitor_id?: string | null;
  author_name: string;
  author_email?: string;
  author_avatar_url?: string | null;
  author_role?: string | null;
  body: string;
  visibility: "everyone" | "team";
  timecode_start_ms: number | null;
  timecode_end_ms: number | null;
  drawing?: any;
  resolved_at: string | null;
  resolved_by_name?: string | null;
  created_at: string;
  reply_count?: number;
  replies?: CommentItem[];
}

export interface ReviewHistoryItem {
  id: string;
  version_number: number;
  author_name: string;
  author_email?: string;
  decision: "approved" | "changes_requested";
  note?: string;
  created_at: string;
}

export interface VersionInfoItem {
  id: string;
  number: number;
  size_bytes: number;
  mime: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  preview_status: string;
  created_at: string;
  uploader_name?: string;
}

interface CommentsPanelProps {
  itemId: string;
  comments: CommentItem[];
  reviewHistory: ReviewHistoryItem[];
  versions: VersionInfoItem[];
  activeVersionNumber: number;
  reviewStatus: string;
  fps?: number;
  timecodeFormat?: TimecodeFormat;
  currentUserId?: string;
  hasFullAccess?: boolean;
  canComment?: boolean;
  onSeekToTime: (timeMs: number) => void;
  onPreviewDrawing?: (drawing: any) => void;
  onResolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onEditComment: (commentId: string, newBody: string) => Promise<void>;
  onReplyComment: (parentId: string, body: string) => Promise<void>;
  onExportCSV: () => void;
  onSelectVersion: (versionNum: number) => void;
}

export function CommentsPanel({
  itemId,
  comments,
  reviewHistory,
  versions,
  activeVersionNumber,
  reviewStatus,
  fps = 24,
  timecodeFormat = "smpte",
  currentUserId,
  hasFullAccess = false,
  canComment = true,
  onSeekToTime,
  onPreviewDrawing,
  onResolveComment,
  onDeleteComment,
  onEditComment,
  onReplyComment,
  onExportCSV,
  onSelectVersion,
}: CommentsPanelProps) {
  const [activeTab, setActiveTab] = useState<"comments" | "details">("comments");
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const [sort, setSort] = useState<"timecode" | "newest">("timecode");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Filter and sort comments
  const filteredComments = comments
    .filter((c) => {
      // Status filter
      if (filter === "unresolved" && c.resolved_at) return false;
      if (filter === "resolved" && !c.resolved_at) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesBody = c.body.toLowerCase().includes(q);
        const matchesAuthor = c.author_name.toLowerCase().includes(q);
        return matchesBody || matchesAuthor;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "timecode") {
        const timeA = a.timecode_start_ms ?? 999999999;
        const timeB = b.timecode_start_ms ?? 999999999;
        return timeA - timeB;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleSendReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    try {
      await onReplyComment(parentId, replyText.trim());
      setReplyText("");
      setReplyingToId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editText.trim()) return;
    try {
      await onEditComment(commentId, editText.trim());
      setEditingId(null);
      setEditText("");
    } catch (err) {
      console.error(err);
    }
  };

  const unresolvedCount = comments.filter((c) => !c.resolved_at).length;

  return (
    <div className="flex flex-col h-full bg-[#141416] border-l border-[#222226] text-white select-none">
      {/* Panel Top Tabs */}
      <div className="flex items-center justify-between border-b border-[#222226] px-4 bg-[#18181B]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("comments")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "comments"
                ? "border-[#FF5500] text-white"
                : "border-transparent text-[#9A9DA0] hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
            <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-[10px] text-[#A1A1AA]">
              {unresolvedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-[#FF5500] text-white"
                : "border-transparent text-[#9A9DA0] hover:text-white"
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Details</span>
          </button>
        </div>

        {activeTab === "comments" && (
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1 text-[11px] font-medium text-[#9A9DA0] hover:text-white transition-colors"
            title="Export comments to CSV"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {/* COMMENTS TAB CONTENT */}
      {activeTab === "comments" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Filters & Search Header */}
          <div className="p-3 border-b border-[#222226] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 bg-[#1F1F23] p-0.5 rounded-lg border border-[#2B2B30]">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    filter === "all" ? "bg-[#2E2E34] text-white shadow-sm" : "text-[#9A9DA0] hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("unresolved")}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    filter === "unresolved" ? "bg-[#2E2E34] text-white shadow-sm" : "text-[#9A9DA0] hover:text-white"
                  }`}
                >
                  Unresolved
                </button>
                <button
                  onClick={() => setFilter("resolved")}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    filter === "resolved" ? "bg-[#2E2E34] text-white shadow-sm" : "text-[#9A9DA0] hover:text-white"
                  }`}
                >
                  Resolved
                </button>
              </div>

              {/* Sort selector */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-[#1F1F23] border border-[#2B2B30] text-[#9A9DA0] rounded-lg px-2 py-1 text-[11px] outline-none cursor-pointer"
              >
                <option value="timecode">Timecode</option>
                <option value="newest">Newest</option>
              </select>
            </div>

            {/* Quick search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#71717A]" />
              <input
                type="text"
                placeholder="Search comments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#18181B] border border-[#27272A] text-xs text-white pl-8 pr-3 py-1.5 rounded-lg outline-none placeholder-[#71717A] focus:border-[#FF5500]"
              />
            </div>
          </div>

          {/* Threaded Comment List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-[#71717A] text-center">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No comments found</p>
                <p className="text-[10px] text-[#52525B]">Be the first to leave a feedback comment!</p>
              </div>
            ) : (
              filteredComments.map((comment) => {
                const isAuthor = currentUserId && comment.author_user_id === currentUserId;
                const canDelete = isAuthor || hasFullAccess;
                const isTeam = comment.visibility === "team";
                const isResolved = !!comment.resolved_at;
                const initial = (comment.author_name || "U").charAt(0).toUpperCase();

                return (
                  <div
                    key={comment.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      isTeam
                        ? "bg-[#FEF9C3]/5 border-[#EAB308]/30 hover:border-[#EAB308]/50"
                        : isResolved
                        ? "bg-[#18181A]/40 border-[#27272A]/40 opacity-70"
                        : "bg-[#18181A] border-[#27272A] hover:border-[#3F3F46]"
                    }`}
                  >
                    {/* Header: Avatar, Name, Badge, Timecode Chip, Resolve */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {/* Avatar */}
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow ${
                            isTeam ? "bg-[#854D0E]" : "bg-[#FF5500]"
                          }`}
                        >
                          {initial}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white">{comment.author_name}</span>
                            {isTeam ? (
                              <span className="flex items-center gap-0.5 rounded px-1 py-0.2 bg-[#EAB308]/20 text-[#EAB308] text-[9px] font-medium border border-[#EAB308]/30">
                                <Lock className="w-2.5 h-2.5" /> Team only
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-[#71717A]">
                            {new Date(comment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>

                      {/* Right: Timecode chip & Resolve button */}
                      <div className="flex items-center gap-2">
                        {comment.timecode_start_ms !== null && (
                          <button
                            onClick={() => onSeekToTime(comment.timecode_start_ms!)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF5500]/15 text-[#FF5500] hover:bg-[#FF5500] hover:text-white text-[11px] font-mono tabular-nums font-medium transition-colors"
                            title="Jump to timecode"
                          >
                            <Clock className="w-3 h-3" />
                            <span className="tabular-nums">{formatTimecode(comment.timecode_start_ms, timecodeFormat, fps)}</span>
                          </button>
                        )}

                        {/* Resolve Checkbox */}
                        {canComment && (
                          <button
                            onClick={() => onResolveComment(comment.id, !isResolved)}
                            className={`p-1 rounded-full transition-colors ${
                              isResolved ? "text-[#22C55E] hover:text-[#16A34A]" : "text-[#71717A] hover:text-white"
                            }`}
                            title={isResolved ? "Mark unresolved" : "Resolve comment"}
                          >
                            {isResolved ? (
                              <CheckCircle2 className="w-4 h-4 fill-[#22C55E]/20" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Comment Body or Edit Area */}
                    {editingId === comment.id ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-[#121214] text-xs p-2 rounded-lg border border-[#FF5500] text-white outline-none"
                          rows={2}
                        />
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs text-[#9A9DA0] hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(comment.id)}
                            className="px-2.5 py-1 text-xs bg-[#FF5500] rounded text-white font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-xs text-[#D4D4D8] leading-relaxed mb-2 ${isResolved ? "line-through text-[#71717A]" : ""}`}>
                        {comment.body}
                      </p>
                    )}

                    {/* Drawing Link if comment has drawing */}
                    {comment.drawing && onPreviewDrawing && (
                      <button
                        onClick={() => {
                          if (comment.timecode_start_ms !== null) {
                            onSeekToTime(comment.timecode_start_ms);
                          }
                          onPreviewDrawing(comment.drawing);
                        }}
                        className="flex items-center gap-1 text-[11px] text-[#FF5500] hover:underline mb-2 font-medium"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View drawing on frame</span>
                      </button>
                    )}

                    {/* Bottom Actions: Reply, Edit, Delete */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#27272A]/60 text-[10px] text-[#71717A]">
                      <div className="flex items-center gap-3">
                        {canComment && (
                          <button
                            onClick={() => {
                              setReplyingToId(replyingToId === comment.id ? null : comment.id);
                              setReplyText("");
                            }}
                            className="hover:text-white transition-colors"
                          >
                            Reply
                          </button>
                        )}
                        {isAuthor && (
                          <button
                            onClick={() => {
                              setEditingId(comment.id);
                              setEditText(comment.body);
                            }}
                            className="hover:text-white transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {canDelete && (
                        <button
                          onClick={() => onDeleteComment(comment.id)}
                          className="hover:text-[#EF4444] transition-colors"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Threaded Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="mt-2.5 pl-3 border-l-2 border-[#2E2E34] space-y-2">
                        {comment.replies.map((reply) => {
                          const isReplyAuthor = currentUserId && reply.author_user_id === currentUserId;
                          return (
                            <div key={reply.id} className="text-xs space-y-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-white">{reply.author_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[#71717A]">
                                    {new Date(reply.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {(isReplyAuthor || hasFullAccess) && (
                                    <button
                                      onClick={() => onDeleteComment(reply.id)}
                                      className="text-[#71717A] hover:text-[#EF4444]"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <p className="text-[#D4D4D8] text-[11px]">{reply.body}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Inline Reply Input Box */}
                    {replyingToId === comment.id && (
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <CornerDownRight className="w-3.5 h-3.5 text-[#71717A]" />
                        <input
                          type="text"
                          placeholder="Reply to this thread..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendReply(comment.id);
                          }}
                          className="flex-1 bg-[#121214] text-xs p-1.5 rounded-lg border border-[#27272A] text-white outline-none focus:border-[#FF5500]"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSendReply(comment.id)}
                          className="px-2.5 py-1 text-xs bg-[#FF5500] rounded text-white font-medium"
                        >
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* DETAILS TAB CONTENT */}
      {activeTab === "details" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Review Status Banner */}
          <div className="p-4 rounded-xl bg-[#18181A] border border-[#27272A] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9A9DA0]">Status</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  reviewStatus === "approved"
                    ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30"
                    : reviewStatus === "changes_requested"
                    ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30"
                    : "bg-[#EAB308]/15 text-[#EAB308] border border-[#EAB308]/30"
                }`}
              >
                {reviewStatus.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Review Approval History */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-[#9A9DA0] uppercase tracking-wider">
              Review History
            </h4>
            {reviewHistory.length === 0 ? (
              <p className="text-xs text-[#71717A]">No review decisions recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {reviewHistory.map((rev) => (
                  <div key={rev.id} className="p-3 rounded-xl bg-[#18181A] border border-[#27272A] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{rev.author_name}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          rev.decision === "approved"
                            ? "bg-[#22C55E]/20 text-[#22C55E]"
                            : "bg-[#EF4444]/20 text-[#EF4444]"
                        }`}
                      >
                        {rev.decision === "approved" ? "Approved" : "Changes Requested"}
                      </span>
                    </div>
                    {rev.note && <p className="text-xs text-[#D4D4D8] italic">"{rev.note}"</p>}
                    <div className="flex items-center justify-between text-[10px] text-[#71717A] pt-1">
                      <span>Version v{rev.version_number}</span>
                      <span>{new Date(rev.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Versions List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-[#9A9DA0] uppercase tracking-wider">
              Versions ({versions.length})
            </h4>
            <div className="space-y-1.5">
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  onClick={() => onSelectVersion(ver.number)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-colors ${
                    ver.number === activeVersionNumber
                      ? "bg-[#FF5500]/10 border-[#FF5500] text-white"
                      : "bg-[#18181A] border-[#27272A] text-[#9A9DA0] hover:border-[#3F3F46]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs">v{ver.number}</span>
                    <div className="text-[11px]">
                      <div>{new Date(ver.created_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-[#71717A]">
                        {ver.width && ver.height ? `${ver.width}x${ver.height}` : ver.mime}
                      </div>
                    </div>
                  </div>
                  {ver.number === activeVersionNumber && (
                    <span className="text-[10px] bg-[#FF5500] text-white px-1.5 py-0.5 rounded font-medium">
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
