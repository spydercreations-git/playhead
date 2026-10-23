"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import {
  Search,
  Plus,
  MoreHorizontal,
  ChevronDown,
  LayoutGrid,
  List,
  UserPlus,
  Edit2,
  Copy,
  Trash2,
  X,
  Loader2,
  FileText,
  User,
} from "@/components/ui/icon";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { toast } from "@/lib/toast";

interface DocumentListItem {
  id: string;
  title: string;
  plain_text?: string;
  created_by: string;
  created_by_name?: string;
  created_by_email?: string;
  my_role?: string;
  is_shared?: boolean;
  word_count?: number;
  character_count?: number;
  reading_time_seconds?: number;
  created_at?: string;
  updated_at?: string;
}

interface DocumentShareItem {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: "view" | "edit";
  created_at: string;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
  if (diffSec < 172800) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "#ff8a65", // coral
  "#9575cd", // purple
  "#ffb74d", // amber
  "#4dd6ac", // teal
  "#64b5f6", // blue
  "#f06292", // pink
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function DocumentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"anyone" | "me" | "shared">("anyone");
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [sortOption, setSortOption] = useState<"modified" | "created" | "title">("modified");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  // Document 3-dots dropdown menu state
  const [menuOpenDocId, setMenuOpenDocId] = useState<string | null>(null);

  // Close 3-dots menu on outside click
  useEffect(() => {
    if (!menuOpenDocId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-doc-menu]")) {
        setMenuOpenDocId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenDocId]);

  // Sharing modal state
  const [sharingDoc, setSharingDoc] = useState<DocumentListItem | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"view" | "edit">("view");
  const [isSubmittingShare, setIsSubmittingShare] = useState(false);

  // Rename modal state
  const [renameDoc, setRenameDoc] = useState<DocumentListItem | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  // Fetch documents list
  const { data: docsData, isLoading } = useQuery<{ documents: DocumentListItem[] }>({
    queryKey: ["documents-list", searchQuery, ownerFilter, sortOption],
    queryFn: () => {
      let url = `/documents?sort_by=${sortOption}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      if (ownerFilter === "me" && user?.id) {
        url += `&owner_id=${user.id}`;
      }
      return apiRequest<{ documents: DocumentListItem[] }>(url);
    },
    enabled: !!user,
  });

  const documents = docsData?.documents || [];

  // Filter for "shared" on client if chosen
  const filteredDocuments = useMemo(() => {
    if (ownerFilter === "shared") {
      return documents.filter((d) => d.is_shared || d.my_role !== "owner");
    }
    return documents;
  }, [documents, ownerFilter]);

  // Fetch shares for active share modal
  const { data: sharesData, refetch: refetchShares } = useQuery<{ shares: DocumentShareItem[] }>({
    queryKey: ["document-shares", sharingDoc?.id],
    queryFn: () => apiRequest<{ shares: DocumentShareItem[] }>(`/documents/${sharingDoc?.id}/shares`),
    enabled: !!sharingDoc,
  });

  const sharesList = sharesData?.shares || [];

  // Handle Share Submit
  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingDoc || !shareEmail.trim()) return;

    setIsSubmittingShare(true);
    try {
      await apiRequest(`/documents/${sharingDoc.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          email: shareEmail.trim(),
          role: shareRole,
        }),
      });
      toast.success("Document shared successfully");
      setShareEmail("");
      refetchShares();
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to share document");
    } finally {
      setIsSubmittingShare(false);
    }
  };

  // Remove Share
  const handleRemoveShare = async (shareId: string) => {
    if (!sharingDoc) return;
    try {
      await apiRequest(`/documents/${sharingDoc.id}/shares/${shareId}`, {
        method: "DELETE",
      });
      toast.success("Access removed");
      refetchShares();
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove access");
    }
  };

  // Handle Rename Submit
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameDoc || !renameTitle.trim()) return;

    try {
      await apiRequest(`/items/${renameDoc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameTitle.trim() }),
      });
      toast.success("Document renamed");
      setRenameDoc(null);
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to rename document");
    }
  };

  // Handle Make a Copy
  const handleDuplicate = async (doc: DocumentListItem) => {
    try {
      const res = await apiRequest<{ id: string }>(`/documents/${doc.id}/duplicate`, {
        method: "POST",
      });
      toast.success("Copy created");
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
      if (res?.id) {
        router.push(`/documents/${res.id}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to copy document");
    }
  };

  // Handle Delete
  const handleDelete = async (doc: DocumentListItem) => {
    if (!confirm(`Are you sure you want to move "${doc.title}" to trash?`)) return;
    try {
      await apiRequest(`/items/${doc.id}`, { method: "DELETE" });
      toast.success("Document moved to trash");
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete document");
    }
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[var(--bg)] text-white p-6 md:p-8 space-y-6 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Documents</h1>
          <p className="text-xs text-[var(--text-3)] mt-1">
            Write and share documents with your team.
          </p>
        </div>

        <button
          onClick={() => setShowNewDocDialog(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>New document</span>
        </button>
      </div>

      {/* Control Bar: Search, Owner Filter, Sort, View Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents"
            className="w-full h-9 pl-9 pr-3 rounded-[8px] bg-[var(--input)] border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none transition-colors"
          />
        </div>

        {/* Right filters */}
        <div className="flex items-center gap-3">
          {/* Owner Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setOwnerDropdownOpen(!ownerDropdownOpen);
                setSortDropdownOpen(false);
              }}
              className="flex items-center gap-2 h-9 px-3 rounded-[8px] bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--border-strong)] text-xs text-[var(--text-2)] hover:text-white transition-colors"
            >
              <span>
                Owner:{" "}
                <span className="text-white font-medium capitalize">
                  {ownerFilter === "anyone"
                    ? "Anyone"
                    : ownerFilter === "me"
                    ? "Created by me"
                    : "Shared with me"}
                </span>
              </span>
              <ChevronDown size={16} className="text-[var(--text-3)]" />
            </button>

            {ownerDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setOwnerDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] py-1 shadow-xl z-40 animate-in fade-in duration-100">
                  <button
                    onClick={() => {
                      setOwnerFilter("anyone");
                      setOwnerDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      ownerFilter === "anyone"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Anyone
                  </button>
                  <button
                    onClick={() => {
                      setOwnerFilter("me");
                      setOwnerDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      ownerFilter === "me"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Created by me
                  </button>
                  <button
                    onClick={() => {
                      setOwnerFilter("shared");
                      setOwnerDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      ownerFilter === "shared"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Shared with me
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setSortDropdownOpen(!sortDropdownOpen);
                setOwnerDropdownOpen(false);
              }}
              className="flex items-center gap-2 h-9 px-3 rounded-[8px] bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--border-strong)] text-xs text-[var(--text-2)] hover:text-white transition-colors"
            >
              <span>
                {sortOption === "modified"
                  ? "Date modified"
                  : sortOption === "created"
                  ? "Date created"
                  : "Title"}
              </span>
              <ChevronDown size={16} className="text-[var(--text-3)]" />
            </button>

            {sortDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setSortDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-40 rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] py-1 shadow-xl z-40 animate-in fade-in duration-100">
                  <button
                    onClick={() => {
                      setSortOption("modified");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      sortOption === "modified"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Date modified
                  </button>
                  <button
                    onClick={() => {
                      setSortOption("created");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      sortOption === "created"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Date created
                  </button>
                  <button
                    onClick={() => {
                      setSortOption("title");
                      setSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      sortOption === "title"
                        ? "text-[#4876F3] font-semibold bg-[var(--hover)]"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    Title
                  </button>
                </div>
              </>
            )}
          </div>

          {/* View Toggle */}
          <div className="h-9 p-[3px] rounded-[10px] bg-[var(--input)] border border-[var(--border)] inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              aria-label="Grid view"
              className={`w-[30px] h-[30px] rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                viewMode === "grid"
                  ? "bg-[var(--hover)] text-white shadow-sm"
                  : "text-[var(--text-3)] hover:text-white"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              aria-label="List view"
              className={`w-[30px] h-[30px] rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                viewMode === "list"
                  ? "bg-[var(--hover)] text-white shadow-sm"
                  : "text-[var(--text-3)] hover:text-white"
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Documents List / Grid */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-[var(--text-3)] gap-2">
          <Loader2 size={24} className="animate-spin text-[#4876F3]" />
          <span className="text-xs">Loading documents...</span>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-12 text-center">
          <FileText size={32} className="mx-auto text-[var(--text-3)] mb-3" />
          <h3 className="text-sm font-semibold text-white">No documents found</h3>
          <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No documents matching "${searchQuery}"`
              : "Create your first document to collaborate with your team."}
          </p>
          <button
            onClick={() => setShowNewDocDialog(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors"
          >
            Create document
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDocuments.map((doc) => {
            const authorName = doc.created_by_name || "Harsh";
            const initial = authorName.charAt(0).toUpperCase();
            const avatarColor = getAvatarColor(authorName);
            const isMenuOpen = menuOpenDocId === doc.id;

            return (
              <div
                key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className={`group relative rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 cursor-pointer hover:border-[var(--border-strong)] transition-colors ${
                  isMenuOpen ? "z-30" : "z-0"
                }`}
              >
                {/* Document Preview Box (Dark card with title & simulated text lines matching D1 mockup) */}
                <div className="aspect-[16/10] rounded-lg bg-[var(--input)] p-3.5 mb-3 flex flex-col justify-between overflow-hidden border border-[var(--border)] transition-colors">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-2)] truncate block">
                      {doc.title}
                    </span>
                    <div className="w-4/5 h-1 rounded-full bg-[var(--border-strong)]/60" />
                    <div className="w-full h-1 rounded-full bg-[var(--border)]" />
                    <div className="w-3/4 h-1 rounded-full bg-[var(--border)]" />
                  </div>
                  <div className="w-2/5 h-1 rounded-full bg-[var(--border)]/40" />
                </div>

                {/* Card Title & 3-Dots Button */}
                <div className="flex items-center justify-between gap-1.5">
                  <h3 className="text-xs font-semibold text-white truncate group-hover:text-[#4876F3] transition-colors">
                    {doc.title}
                  </h3>

                  <div className="relative" data-doc-menu>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenDocId(isMenuOpen ? null : doc.id);
                      }}
                      className="text-[var(--text-3)] hover:text-white p-1 rounded-md hover:bg-[var(--hover)] transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {/* D1 3-Dots Dropdown Menu */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] py-1 shadow-xl z-50 text-xs animate-in fade-in duration-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenDocId(null);
                              setSharingDoc(doc);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-white hover:bg-[var(--hover)] transition-colors"
                          >
                            <UserPlus size={16} className="text-[var(--text-2)]" />
                            <span>Share</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenDocId(null);
                              setRenameDoc(doc);
                              setRenameTitle(doc.title);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-white hover:bg-[var(--hover)] transition-colors"
                          >
                            <Edit2 size={16} className="text-[var(--text-2)]" />
                            <span>Rename</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenDocId(null);
                              handleDuplicate(doc);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-white hover:bg-[var(--hover)] transition-colors"
                          >
                            <Copy size={16} className="text-[var(--text-2)]" />
                            <span>Make a copy</span>
                          </button>

                          <div className="my-1 border-t border-[var(--border)]" />

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenDocId(null);
                              handleDelete(doc);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-[#F0506E] hover:bg-[var(--hover)] transition-colors"
                          >
                            <Trash2 size={16} className="text-[#F0506E]" />
                            <span>Delete</span>
                          </button>
                        </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Avatar Initial + Time / Shared pill */}
                <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--text-2)] truncate">
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {initial}
                  </span>
                  <span className="truncate">
                    Edited {formatRelativeTime(doc.updated_at || doc.created_at)}
                    {doc.is_shared && " · Shared"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] divide-y divide-[var(--border)]">
          {filteredDocuments.map((doc) => {
            const authorName = doc.created_by_name || "Harsh";
            const initial = authorName.charAt(0).toUpperCase();
            const avatarColor = getAvatarColor(authorName);

            return (
              <div
                key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--hover)] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={20} className="text-[#4876F3] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{doc.title}</p>
                    <p className="text-xs text-[var(--text-3)] truncate">
                      by {authorName} · Edited {formatRelativeTime(doc.updated_at || doc.created_at)}
                      {doc.is_shared && " · Shared"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {initial}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSharingDoc(doc);
                    }}
                    className="p-1 rounded text-[var(--text-3)] hover:text-white"
                  >
                    <UserPlus size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc);
                    }}
                    className="p-1 rounded text-[var(--text-3)] hover:text-[#F0506E]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Document Dialog */}
      <NewDocumentDialog
        isOpen={showNewDocDialog}
        onClose={() => setShowNewDocDialog(false)}
        onDocumentCreated={(newDoc) => {
          queryClient.invalidateQueries({ queryKey: ["documents-list"] });
          router.push(`/documents/${newDoc.id}`);
        }}
      />

      {/* Share Document Modal */}
      {sharingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            className="fixed inset-0"
            onClick={() => setSharingDoc(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="text-base font-semibold text-white">Share document</h2>
                <p className="text-xs text-[var(--text-2)] mt-0.5 truncate max-w-xs">
                  {sharingDoc.title}
                </p>
              </div>
              <button
                onClick={() => setSharingDoc(null)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Add person form */}
            <form onSubmit={handleAddShare} className="p-5 border-b border-[var(--border)] space-y-3">
              <label className="block text-xs font-medium text-[var(--text-2)]">
                Share with team member
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 h-9 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                  required
                />
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value as "view" | "edit")}
                  className="h-9 px-2 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-white focus:outline-none"
                >
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button
                  type="submit"
                  disabled={isSubmittingShare}
                  className="h-9 px-3 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors disabled:opacity-50 shrink-0"
                >
                  {isSubmittingShare ? <Loader2 size={16} className="animate-spin" /> : "Share"}
                </button>
              </div>
            </form>

            {/* Existing shares */}
            <div className="p-5 max-h-56 overflow-y-auto space-y-3">
              <span className="text-xs font-semibold text-[var(--text-3)] tracking-wider">
                People with access
              </span>

              {/* Owner item */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[#4876F3] flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {sharingDoc.created_by_name?.charAt(0).toUpperCase() || "O"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white truncate font-medium">
                      {sharingDoc.created_by_name || "Creator"}
                    </p>
                    <p className="text-xs text-[var(--text-3)] truncate">
                      {sharingDoc.created_by_email || ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[var(--text-3)]">Owner</span>
              </div>

              {/* Shared users */}
              {sharesList.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: getAvatarColor(s.name || s.email) }}
                    >
                      {(s.name || s.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white truncate font-medium">{s.name || s.email}</p>
                      {s.name && <p className="text-xs text-[var(--text-3)] truncate">{s.email}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-2)] capitalize">{s.role}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveShare(s.id)}
                      className="text-[var(--text-3)] hover:text-[#F0506E] p-1 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)] flex justify-end">
              <button
                onClick={() => setSharingDoc(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Document Modal */}
      {renameDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            className="fixed inset-0"
            onClick={() => setRenameDoc(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-white">Rename document</h2>
              <button
                onClick={() => setRenameDoc(null)}
                className="p-1 rounded-lg text-[var(--text-2)] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit} className="p-5 space-y-4">
              <input
                type="text"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-white focus:outline-none focus:border-[var(--accent)]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameDoc(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
