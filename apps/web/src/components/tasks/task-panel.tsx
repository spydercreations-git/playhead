"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { TaskBriefEditor } from "./task-brief-editor";
import { SelectLibraryFileDialog } from "./select-library-file-dialog";
import { ManageTaskAccessDialog } from "./manage-task-access-dialog";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import {
  X,
  Check,
  MoreHorizontal,
  Calendar,
  Globe,
  FileText,
  Plus,
  Trash2,
  Lock,
  MessageSquare,
  CornerDownRight,
  Paperclip,
  Smile,
  AtSign,
  ArrowUp,
  ExternalLink,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Building2,
  FolderGit2,
} from "@/components/ui/icon";
import Link from "next/link";

interface TaskDetail {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  project_id?: string;
  project_name?: string;
  status: string;
  deadline?: string;
  deadline_label?: string;
  deadline_formatted?: string;
  is_overdue?: boolean;
  description_title: string;
  description_html: string;
  description_json: any;
  position: any;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    role: string;
  }[];
  links?: {
    id: string;
    title: string;
    url?: string;
    library_item_id?: string;
  }[];
  can_manage_access: boolean;
  can_change_status: boolean;
  can_delete: boolean;
}

interface CommentAttachment {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  formatted_size: string;
  download_url: string;
}

interface TaskComment {
  id: string;
  task_id: string;
  tab: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar_url?: string;
  user_role: string;
  body: string;
  reply_to_comment_id?: string;
  reply_body?: string;
  reply_user_name?: string;
  is_history: boolean;
  is_deleted: boolean;
  attachments?: CommentAttachment[];
  created_at: string;
  formatted_created: string;
  can_edit: boolean;
  can_delete: boolean;
}

interface TaskPanelProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onTaskUpdated?: () => void;
  onTaskDeleted?: () => void;
}

export function TaskPanel({
  taskId,
  open,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
}: TaskPanelProps) {
  const { user, isClient, isStaff } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"client" | "internal">("client");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Editable task fields
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingBriefTitle, setEditingBriefTitle] = useState(false);
  const [briefTitleValue, setBriefTitleValue] = useState("Brief");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Link Dialogs
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Manage Access Dialog
  const [showManageAccess, setShowManageAccess] = useState(false);

  // Comments & Composer
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<TaskComment | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    { storage_key: string; filename: string; mime: string; size_bytes: number }[]
  >([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [mentionListOpen, setMentionListOpen] = useState(false);
  const [mentionables, setMentionables] = useState<
    { id: string; name: string; email: string; role: string }[]
  >([]);

  // Blinking comment reference
  const [blinkingCommentId, setBlinkingCommentId] = useState<string | null>(null);
  const commentRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Task Details
  const fetchTask = async () => {
    if (!taskId) return;
    try {
      const res = await apiRequest<{ task: TaskDetail }>(`/tasks/${taskId}`);
      setTask(res.task);
      setTitleValue(res.task.name);
      setBriefTitleValue(res.task.description_title || "Brief");
    } catch (err) {
      console.error("Failed to load task", err);
    }
  };

  // 2. Fetch Comments for Active Tab
  const fetchComments = async (tab: "client" | "internal") => {
    if (!taskId) return;
    setCommentsLoading(true);
    try {
      const res = await apiRequest<{ comments: TaskComment[] }>(
        `/tasks/${taskId}/comments?tab=${tab}`
      );
      setComments(res.comments || []);
    } catch (err) {
      console.error("Failed to load comments", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (open && taskId) {
      setLoading(true);
      fetchTask().finally(() => setLoading(false));
      fetchComments(activeTab);
    }
  }, [open, taskId]);

  useEffect(() => {
    if (open && taskId) {
      fetchComments(activeTab);
    }
  }, [activeTab]);

  // 3. Real-Time SSE Stream with Auto-Reconnect (Rule 2 & 9)
  useEffect(() => {
    if (!open || !taskId) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      // Rule 2: SSE stream is strictly scoped to authorized tab on server
      eventSource = new EventSource(
        `/api/v1/tasks/${taskId}/comments/stream?tab=${activeTab}`,
        { withCredentials: true }
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_comment" && data.comment) {
            setComments((prev) => {
              if (prev.some((c) => c.id === data.comment.id)) return prev;
              return [...prev, data.comment];
            });
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
          } else if (data.type === "comment_deleted") {
            setComments((prev) =>
              prev.map((c) =>
                c.id === data.comment_id
                  ? { ...c, is_deleted: true, body: "Message deleted" }
                  : c
              )
            );
          } else if (data.type === "comment_updated") {
            setComments((prev) =>
              prev.map((c) =>
                c.id === data.comment.id ? { ...c, body: data.comment.body } : c
              )
            );
          }
        } catch {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
        }
        // Auto-reconnect after 3 seconds and reload missed messages (Rule 9)
        reconnectTimeout = setTimeout(() => {
          fetchComments(activeTab);
          connectSSE();
        }, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [open, taskId, activeTab]);

  // 4. Mentionables loader
  useEffect(() => {
    if (mentionListOpen && taskId) {
      apiRequest<{ users: any[] }>(
        `/tasks/${taskId}/mentionable?tab=${activeTab}`
      )
        .then((res) => setMentionables(res.users || []))
        .catch(() => setMentionables([]));
    }
  }, [mentionListOpen, taskId, activeTab]);

  if (!open) return null;

  // Actions
  async function handleUpdateTitle() {
    if (!titleValue.trim() || titleValue === task?.name) {
      setEditingTitle(false);
      return;
    }
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: titleValue.trim() }),
      });
      setTask((prev) => (prev ? { ...prev, name: titleValue.trim() } : prev));
      setEditingTitle(false);
      onTaskUpdated?.();
    } catch (err: any) {
      alert(err.message || "Failed to update task name");
    }
  }

  async function handleUpdateBriefTitle() {
    if (!briefTitleValue.trim()) {
      setEditingBriefTitle(false);
      return;
    }
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ description_title: briefTitleValue.trim() }),
      });
      setTask((prev) =>
        prev ? { ...prev, description_title: briefTitleValue.trim() } : prev
      );
      setEditingBriefTitle(false);
      onTaskUpdated?.();
    } catch {}
  }

  async function handleUpdateBriefContent(html: string, json: any) {
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          description_html: html,
          description_json: json,
        }),
      });
      setTask((prev) =>
        prev
          ? { ...prev, description_html: html, description_json: json }
          : prev
      );
    } catch {}
  }

  async function handleSetStatus(newStatus: string) {
    if (!task?.can_change_status) return;
    setStatusMenuOpen(false);
    try {
      const res = await apiRequest<{ task: TaskDetail }>(`/tasks/${taskId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setTask(res.task);
      fetchComments(activeTab);
      onTaskUpdated?.();
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  }

  async function handleToggleCompleted() {
    if (!task) return;
    const nextStatus = task.status === "Completed" ? "In progress" : "Completed";
    handleSetStatus(nextStatus);
  }

  async function handleUpdateDeadline(newDeadlineIso: string) {
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ deadline: newDeadlineIso || null }),
      });
      setTask((prev) => (prev ? { ...prev, deadline: newDeadlineIso } : prev));
      onTaskUpdated?.();
      fetchTask();
    } catch (err: any) {
      alert(err.message || "Failed to update deadline");
    }
  }

  async function handleDeleteTask() {
    if (!task?.can_delete) return;
    if (!confirm("Are you sure you want to move this task to Trash?")) return;
    try {
      await apiRequest(`/tasks/${taskId}`, { method: "DELETE" });
      onTaskDeleted?.();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to delete task");
    }
  }

  async function handleAddLink() {
    if (!newLinkUrl.trim()) return;
    const trimmed = newLinkUrl.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      alert("Only HTTP and HTTPS links are allowed.");
      return;
    }
    try {
      await apiRequest(`/tasks/${taskId}/links`, {
        method: "POST",
        body: JSON.stringify({
          title: newLinkTitle.trim() || trimmed,
          url: trimmed,
        }),
      });
      setShowAddLink(false);
      setNewLinkTitle("");
      setNewLinkUrl("");
      fetchTask();
    } catch (err: any) {
      alert(err.message || "Failed to add link");
    }
  }

  async function handleAddLibraryFile(item: { id: string; name: string }) {
    try {
      await apiRequest(`/tasks/${taskId}/links`, {
        method: "POST",
        body: JSON.stringify({
          title: item.name,
          library_item_id: item.id,
        }),
      });
      fetchTask();
    } catch (err: any) {
      alert(err.message || "Failed to add library link");
    }
  }

  async function handleDeleteLink(linkId: string) {
    try {
      await apiRequest(`/tasks/${taskId}/links/${linkId}`, {
        method: "DELETE",
      });
      fetchTask();
    } catch {}
  }

  // File Attachment Upload (Rule 7: checked on server, max 30 MB)
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert("Attachment exceeds 30 MB limit.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingAttachment(true);
    try {
      // Presign on server
      const presignRes = await apiRequest<{
        upload_url: string;
        storage_key: string;
      }>(`/tasks/${taskId}/comments/attachments/presign`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size_bytes: file.size,
        }),
      });

      // Upload file bytes directly to storage with presigned URL (zero server byte transit)
      await fetch(presignRes.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      setPendingAttachments((prev) => [
        ...prev,
        {
          storage_key: presignRes.storage_key,
          filename: file.name,
          mime: file.type || "application/octet-stream",
          size_bytes: file.size,
        },
      ]);
    } catch (err: any) {
      alert(err.message || "Failed to upload attachment");
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSendComment() {
    if (!commentText.trim() && pendingAttachments.length === 0) return;

    setSendingComment(true);
    try {
      const payload: any = {
        tab: activeTab,
        body: commentText.trim(),
        reply_to_comment_id: replyingTo ? replyingTo.id : undefined,
        attachments: pendingAttachments,
      };

      const res = await apiRequest<{ comment: TaskComment }>(
        `/tasks/${taskId}/comments`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      setComments((prev) => [...prev, res.comment]);
      setCommentText("");
      setReplyingTo(null);
      setPendingAttachments([]);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      onTaskUpdated?.();
    } catch (err: any) {
      alert(err.message || "Failed to send message");
    } finally {
      setSendingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await apiRequest(`/tasks/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, is_deleted: true, body: "Message deleted" } : c
        )
      );
    } catch {}
  }

  // Scroll to original comment and blink (Rule 8)
  function handleScrollAndBlink(commentId: string) {
    const el = commentRefs.current[commentId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setBlinkingCommentId(commentId);
      setTimeout(() => {
        setBlinkingCommentId(null);
      }, 1800);
    }
  }

  const linksCount = task?.links?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--panel)] border-l border-[var(--border)] shadow-overlay flex flex-col h-full animate-in slide-in-from-right duration-250">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleCompleted}
              disabled={!task?.can_change_status}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-colors ${
                task?.status === "Completed"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                  : "bg-[var(--input)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--hover)] hover:text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {task?.status === "Completed" ? "Completed" : "Mark completed"}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {task?.can_delete && (
              <div className="relative">
                <button
                  type="button"
                  title="More actions"
                  onClick={() => setMoreMenuOpen((prev) => !prev)}
                  className="p-1.5 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-40 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl py-1 z-50">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        handleDeleteTask();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/15 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete task
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              title="Close panel"
              onClick={onClose}
              className="p-1.5 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Main Task Card / Details (T2) */}
          <div className="px-6 py-5 border-b border-[var(--border)] space-y-5">
            {/* Task Title */}
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    autoFocus
                    className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-[8px] px-3 py-1.5 text-xl font-bold text-white focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateTitle}
                    className="px-3 py-1.5 bg-[var(--primary)] text-white text-xs font-medium rounded-[8px]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <h1
                  onClick={() => !isClient && setEditingTitle(true)}
                  className={`text-xl font-bold text-white ${
                    !isClient ? "cursor-pointer hover:text-[var(--text-2)]" : ""
                  } transition-colors`}
                  title={!isClient ? "Click to edit title" : undefined}
                >
                  {task?.name || "Untitled task"}
                </h1>
              )}
            </div>

            {/* Metadata Rows */}
            <div className="grid grid-cols-[120px_1fr] gap-y-3.5 text-xs items-center">
              {/* Client */}
              <span className="text-[var(--text-3)] font-medium">Client</span>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-[3px] bg-teal-500 shrink-0" />
                <span className="font-medium text-white">{task?.client_name}</span>
              </div>

              {/* Status */}
              <span className="text-[var(--text-3)] font-medium">Status</span>
              <div className="relative">
                {task?.can_change_status ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setStatusMenuOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-medium bg-[var(--input)] hover:bg-[var(--hover)] text-white border border-[var(--border)] transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          task.status === "Completed"
                            ? "bg-emerald-400"
                            : task.status === "In progress"
                            ? "bg-blue-400"
                            : "bg-[var(--text-3)]"
                        }`}
                      />
                      <span>{task.status}</span>
                      <ChevronDown className="w-3 h-3 text-[var(--text-3)]" />
                    </button>

                    {statusMenuOpen && (
                      <div className="absolute top-full left-0 mt-1 w-36 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl py-1 z-50">
                        {["Not started", "In progress", "Completed", "Not needed"].map(
                          (st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleSetStatus(st)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  st === "Completed"
                                    ? "bg-emerald-400"
                                    : st === "In progress"
                                    ? "bg-blue-400"
                                    : "bg-[var(--text-3)]"
                                }`}
                              />
                              {st}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-medium bg-[var(--input)] text-[var(--text-2)] border border-[var(--border)] opacity-80 cursor-not-allowed">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)]" />
                    {task?.status}
                  </span>
                )}
              </div>

              {/* Deadline */}
              <span className="text-[var(--text-3)] font-medium">Deadline</span>
              {!isClient ? (
                <div className="w-full">
                  <CustomDatePicker
                    value={task?.deadline || ""}
                    onChange={handleUpdateDeadline}
                    placeholder="No deadline set"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-[var(--text-3)]" />
                  {task?.deadline_label ? (
                    <span
                      className={
                        task.is_overdue
                          ? "text-red-400 font-semibold"
                          : task.deadline_label === "Today" ||
                            task.deadline_label === "Tomorrow"
                          ? "text-amber-400 font-medium"
                          : "text-[var(--text)]"
                      }
                    >
                      {task.deadline_label}{" "}
                      <span className="text-[var(--text-3)] font-normal ml-1">
                        {task.deadline_formatted}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--text-3)]">No deadline set</span>
                  )}
                </div>
              )}

              {/* Assigned (Rule 3: staff & editor only; CLIENTS NEVER SEE ASSIGNED OR MANAGE ACCESS!) */}
              {!isClient && (
                <>
                  <span className="text-[var(--text-3)] font-medium">Assigned</span>
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {task?.assigned && task.assigned.length > 0 ? (
                          <div className="flex items-center -space-x-1.5">
                            {task.assigned.map((a) => (
                              <div
                                key={a.id}
                                title={`${a.name} (${a.role})`}
                                className="w-6 h-6 rounded-full bg-[var(--primary)] text-white text-[12px] font-semibold flex items-center justify-center border-2 border-[var(--panel)] shrink-0"
                              >
                                {a.name ? a.name.charAt(0).toUpperCase() : "U"}
                              </div>
                            ))}
                            <span className="text-xs text-white font-medium pl-3">
                              {task.assigned.map((a) => a.name).join(", ")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-3)]">Unassigned</span>
                        )}
                      </div>

                      {task?.can_manage_access && (
                        <button
                          type="button"
                          onClick={() => setShowManageAccess(true)}
                          className="text-xs font-medium text-[var(--primary)] hover:underline"
                        >
                          Manage access
                        </button>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-3)] mt-1">
                      Clients never see who is assigned.
                    </p>
                  </div>
                </>
              )}

              {/* Linked project */}
              <span className="text-[var(--text-3)] font-medium">Linked project</span>
              <div>
                {task?.project_name ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-white font-medium hover:text-[var(--primary)] cursor-pointer">
                    <FolderGit2 className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    {task.project_name}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-3)]">None</span>
                )}
              </div>
            </div>

            {/* Links Section (Rule 5) */}
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  Links <span className="text-[12px] font-normal text-[var(--text-3)]">{linksCount} of 15</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {task?.links?.map((link) => (
                  <div
                    key={link.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs bg-[var(--panel-raised)] border border-[var(--border)] text-[var(--text)] group hover:border-[var(--border-strong)] transition-colors"
                  >
                    {link.library_item_id ? (
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    )}

                    {link.url ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:underline flex items-center gap-1 truncate max-w-[180px]"
                      >
                        <span className="truncate">{link.title}</span>
                        <ExternalLink className="w-3 h-3 text-[var(--text-3)] shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate max-w-[180px] font-medium text-white">
                        {link.title}
                      </span>
                    )}

                    {!isClient && (
                      <button
                        type="button"
                        onClick={() => handleDeleteLink(link.id)}
                        className="p-0.5 rounded text-[var(--text-3)] hover:text-red-400 transition-colors ml-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {linksCount < 15 && !isClient && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddLink(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs text-[var(--text-2)] hover:text-white bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add link
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFilePicker(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs text-[var(--text-2)] hover:text-white bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      Select file from Playhead
                    </button>
                  </div>
                )}
              </div>

              {/* Add Link Popover */}
              {showAddLink && (
                <div className="mt-2 p-3 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] space-y-2">
                  <input
                    type="text"
                    placeholder="Link title (e.g. Reference ad)"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1 text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      className="flex-1 min-w-0 bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1 text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="shrink-0 px-3 py-1 bg-[var(--primary)] text-white text-xs font-medium rounded-[6px] cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddLink(false)}
                      className="shrink-0 px-2 py-1 text-xs text-[var(--text-3)] hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Brief Section (Rule 6: renamable title + rich text toolbar) */}
            <div className="pt-3 border-t border-[var(--border)] space-y-2">
              <div className="flex items-center gap-2">
                {editingBriefTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={briefTitleValue}
                      onChange={(e) => setBriefTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateBriefTitle();
                        if (e.key === "Escape") setEditingBriefTitle(false);
                      }}
                      autoFocus
                      className="bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2 py-0.5 text-xs font-semibold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleUpdateBriefTitle}
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">
                      {task?.description_title || "Brief"}
                    </span>
                    {!isClient && (
                      <button
                        type="button"
                        onClick={() => setEditingBriefTitle(true)}
                        className="text-[var(--text-3)] hover:text-white transition-colors"
                        title="Rename title"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    <span className="text-[12px] text-[var(--text-3)]">
                      (rename this title)
                    </span>
                  </div>
                )}
              </div>

              <TaskBriefEditor
                initialContent={task?.description_html}
                readOnly={isClient}
                onChange={handleUpdateBriefContent}
              />
            </div>
          </div>

          {/* Comments Section (T3 & Rule 2) */}
          <div className="px-6 py-5 space-y-4">
            {/* Tabs Header */}
            <div>
              <div className="flex items-center gap-2 p-1 bg-[var(--input)] rounded-[8px] w-fit border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("client")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors ${
                    activeTab === "client"
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--text-2)] hover:text-white"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Client chat</span>
                  {comments.length > 0 && activeTab === "client" && (
                    <span className="px-1.5 py-0.2 rounded-full text-[12px] bg-white/20 text-white font-semibold">
                      {comments.length}
                    </span>
                  )}
                </button>

                {/* Rule 2 & 3: Internal tab NEVER visible to clients */}
                {!isClient && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("internal")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-colors ${
                      activeTab === "internal"
                        ? "bg-[var(--primary)] text-white shadow-sm"
                        : "text-[var(--text-2)] hover:text-white"
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Internal</span>
                  </button>
                )}
              </div>

              <p className="text-[12px] text-[var(--text-3)] mt-2">
                {activeTab === "client"
                  ? `Visible to ${task?.client_name || "client"} and Idyll staff.`
                  : "Visible only to Idyll staff and assigned editors."}
              </p>
            </div>

            {/* Message Thread */}
            <div className="space-y-3.5 pt-2">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-8 text-xs text-[var(--text-3)] gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                  Loading messages...
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-3)]">
                  No messages in this channel yet.
                </div>
              ) : (
                comments.map((c) => {
                  if (c.is_history) {
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-xs text-[var(--text-3)] py-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          {c.body} · {c.formatted_created}
                        </span>
                      </div>
                    );
                  }

                  const isBlinking = blinkingCommentId === c.id;

                  return (
                    <div
                      key={c.id}
                      ref={(el) => {
                        commentRefs.current[c.id] = el;
                      }}
                      className={`p-3.5 rounded-[10px] bg-[var(--panel-raised)] border transition-all duration-300 ${
                        isBlinking
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 ring-2 ring-[var(--primary)]/30"
                          : "border-[var(--border)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      {/* Author Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
                            {c.user_name ? c.user_name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <span className="text-xs font-semibold text-white">
                            {c.user_name}
                          </span>
                          <span className="text-[12px] text-[var(--text-3)]">
                            {c.formatted_created}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {!c.is_deleted && (
                            <button
                              type="button"
                              onClick={() => setReplyingTo(c)}
                              title="Reply directly"
                              className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
                            >
                              <CornerDownRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {c.can_delete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(c.id)}
                              title="Delete message"
                              className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quoted Reply Snippet (Rule 8: connecting line & click to blink) */}
                      {c.reply_to_comment_id && (
                        <div
                          onClick={() => handleScrollAndBlink(c.reply_to_comment_id!)}
                          className="mb-2.5 pl-3 py-1 border-l-2 border-[var(--primary)] bg-[var(--input)]/50 rounded-r-[6px] text-xs cursor-pointer hover:bg-[var(--input)] transition-colors group"
                        >
                          <div className="font-semibold text-white text-[12px] flex items-center gap-1">
                            <span>{c.reply_user_name || "Author"}</span>
                          </div>
                          <p className="text-[var(--text-2)] truncate text-xs mt-0.5">
                            {c.reply_body || "Original message"}
                          </p>
                        </div>
                      )}

                      {/* Comment Body */}
                      <p
                        className={`text-xs leading-relaxed whitespace-pre-wrap ${
                          c.is_deleted
                            ? "italic text-[var(--text-3)]"
                            : "text-[var(--text)]"
                        }`}
                      >
                        {c.body}
                      </p>

                      {/* Attachments Cards (Rule 7: private signed download) */}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          {c.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`/api/v1/tasks/comments/attachments/${att.id}/download?redirect=true`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[var(--input)] border border-[var(--border)] hover:border-[var(--primary)] text-xs text-white transition-colors group"
                            >
                              <FileText className="w-4 h-4 text-blue-400" />
                              <div className="min-w-0">
                                <span className="font-medium truncate block max-w-[200px]">
                                  {att.filename}
                                </span>
                                <span className="text-[12px] text-[var(--text-3)]">
                                  {att.formatted_size}
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Bottom Composer (T3) */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--panel)] shrink-0 space-y-2">
          {/* Replying Banner (Rule 8) */}
          {replyingTo && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-[6px] bg-[var(--input)] border border-[var(--border)] text-xs text-[var(--text-2)]">
              <div className="flex items-center gap-1.5 truncate">
                <CornerDownRight className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                <span className="font-semibold text-white">{replyingTo.user_name}:</span>
                <span className="truncate">{replyingTo.body}</span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="p-0.5 rounded text-[var(--text-3)] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Pending Attachments List */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((att, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[var(--input)] border border-[var(--border)] text-xs text-white"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span className="truncate max-w-[150px]">{att.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-[var(--text-3)] hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Composer Input Box */}
          <div className="rounded-[10px] bg-[var(--panel-raised)] border border-[var(--border)] p-2.5 focus-within:border-[var(--primary)] transition-colors">
            <textarea
              rows={2}
              placeholder="Write a message or @mention a teammate"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
              className="w-full bg-transparent resize-none text-xs text-white placeholder-[var(--text-3)] focus:outline-none leading-relaxed"
            />

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  title="Attach file (up to 30 MB)"
                  disabled={uploadingAttachment}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
                >
                  {uploadingAttachment ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  title="Emoji"
                  onClick={() => setCommentText((prev) => prev + " 👍")}
                  className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
                >
                  <Smile className="w-4 h-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    title="@mention teammate"
                    onClick={() => setMentionListOpen((prev) => !prev)}
                    className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <AtSign className="w-4 h-4" />
                  </button>

                  {mentionListOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-52 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl p-1 z-50">
                      <div className="px-2 py-1 text-[12px] font-semibold text-[var(--text-3)]">
                        Mention teammate
                      </div>
                      {mentionables.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setCommentText((prev) => prev + `@${u.name} `);
                            setMentionListOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white rounded-[6px] transition-colors"
                        >
                          <span className="truncate">{u.name}</span>
                          <span className="text-[12px] text-[var(--text-3)]">
                            {u.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="text-[12px] text-[var(--text-3)] select-none pl-1">
                  Files up to 30 MB
                </span>
              </div>

              <button
                type="button"
                onClick={handleSendComment}
                disabled={sendingComment || (!commentText.trim() && pendingAttachments.length === 0)}
                className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:bg-[var(--primary)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {sendingComment ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Select file from Playhead modal */}
      <SelectLibraryFileDialog
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAddLibraryFile}
      />

      {/* Manage access modal (Staff only) */}
      <ManageTaskAccessDialog
        taskId={taskId}
        open={showManageAccess}
        onClose={() => setShowManageAccess(false)}
        onUpdated={fetchTask}
      />
    </div>
  );
}
