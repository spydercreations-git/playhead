"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import { DriveFolderCard } from "@/components/cards/drive-folder-card";
import { FolderCard } from "@/components/cards/folder-card";
import { ProjectCard } from "@/components/cards/project-card";
import {
  Upload,
  FolderPlus,
  FileText,
  TableChart,
  FolderOpen,
  VideoFileIcon,
  ImageFileIcon,
  PdfFileIcon,
  AudioFileIcon,
  Folder,
  Loader2,
  CheckCircle2,
  ChatBubble,
  MoreHorizontal,
} from "@/components/ui/icon";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { NewSpreadsheetDialog } from "@/components/spreadsheets/new-spreadsheet-dialog";
import { useUploadStore } from "@/lib/upload-store";

interface DriveFolder {
  id: string;
  name: string;
  category: "videos" | "images" | "documents" | "music" | "custom";
  file_count: number;
  total_bytes: number;
}

interface RecentItem {
  id: string;
  item_id: string;
  item_type: string;
  project_id?: string | null;
  project_name?: string | null;
  item_name: string;
  item_kind: string;
  total_bytes: number;
  category?: string;
  viewed_at: string;
}

interface ProjectItem {
  id: string;
  name: string;
  client_name?: string;
  video_count?: number;
  total_bytes?: number;
  waiting_review_count?: number;
  members?: { id?: string; email?: string; name?: string; color?: string }[];
  thumbnails?: string[];
}

interface ReviewFeedItem {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  review_status: string;
  duration_ms: number;
  unresolved_comment_count: number;
  latest_version_number: number;
  latest_preview_status?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hour${Math.floor(diffSec / 3600) > 1 ? "s" : ""} ago`;
  if (diffSec < 172800) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getRecentItemIcon(kind: string, category?: string) {
  if (kind === "folder") return Folder;
  switch (category) {
    case "videos":
      return VideoFileIcon;
    case "images":
      return ImageFileIcon;
    case "documents":
      return PdfFileIcon;
    case "music":
      return AudioFileIcon;
    default:
      return FileText;
  }
}

function getRecentItemCategoryStyle(kind: string, category?: string) {
  if (kind === "folder") {
    return { color: "#3FCF8E", bg: "rgba(63, 207, 142, 0.16)" };
  }
  switch (category) {
    case "videos":
      return { color: "#FFBB56", bg: "rgba(255, 187, 86, 0.16)" };
    case "images":
      return { color: "#FA457B", bg: "rgba(250, 69, 123, 0.16)" };
    case "documents":
      return { color: "#4876F3", bg: "rgba(72, 118, 243, 0.16)" };
    case "music":
      return { color: "#9787FF", bg: "rgba(151, 135, 255, 0.16)" };
    default:
      return { color: "var(--text-2)", bg: "rgba(163, 166, 173, 0.16)" };
  }
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isClient, hasPermission, isDriveAccessible } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);

  const [isDragging, setIsDragging] = useState(false);

  // Real review items count
  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-count"],
    queryFn: () => apiRequest<{ items: any[] }>("/reviews").catch(() => ({ items: [] })),
    staleTime: 30_000,
    enabled: !!user,
  });
  const reviewCount = reviewsData?.items?.length || 0;

  // Real Drive folders stats (Videos, Images, Documents, Music)
  const { data: driveFoldersData } = useQuery({
    queryKey: ["drive-folders"],
    queryFn: () =>
      apiRequest<{ folders: DriveFolder[] }>("/drive/folders").catch(() => ({
        folders: [
          { id: "videos", name: "Videos", category: "videos" as const, file_count: 0, total_bytes: 0 },
          { id: "images", name: "Images", category: "images" as const, file_count: 0, total_bytes: 0 },
          { id: "documents", name: "Documents", category: "documents" as const, file_count: 0, total_bytes: 0 },
          { id: "music", name: "Music", category: "music" as const, file_count: 0, total_bytes: 0 },
        ],
      })),
    staleTime: 30_000,
    enabled: !!user && isDriveAccessible,
  });

  const driveFolders = driveFoldersData?.folders?.filter((f) =>
    ["videos", "images", "documents", "music"].includes(f.category)
  ) || [
    { id: "videos", name: "Videos", category: "videos" as const, file_count: 0, total_bytes: 0 },
    { id: "images", name: "Images", category: "images" as const, file_count: 0, total_bytes: 0 },
    { id: "documents", name: "Documents", category: "documents" as const, file_count: 0, total_bytes: 0 },
    { id: "music", name: "Music", category: "music" as const, file_count: 0, total_bytes: 0 },
  ];

  const totalDriveFiles = driveFolders.reduce((acc, f) => acc + (f.file_count || 0), 0);

  // Real Recent items from /drive/recent
  const { data: recentItemsData } = useQuery({
    queryKey: ["drive-recent"],
    queryFn: () => apiRequest<{ items: RecentItem[] }>("/drive/recent").catch(() => ({ items: [] })),
    staleTime: 15_000,
    enabled: !!user,
  });
  const recentItems = recentItemsData?.items || [];

  // Real projects list
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiRequest<{ projects: ProjectItem[] }>("/projects").catch(() => ({ projects: [] })),
    staleTime: 30_000,
    enabled: !!user,
  });
  const projects = projectsData?.projects || [];

  const firstName = user?.name ? user.name.split(" ")[0] : "there";
  const isFirstTime = totalDriveFiles === 0 && projects.length === 0;

  const { addUploads } = useUploadStore();

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      addUploads(files, { projectId: "drive", targetPath: "My Drive" });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) {
      addUploads(files, { projectId: "drive", targetPath: "My Drive" });
    }
  }

  // Deduplicate recent items newest first, separated by folders and files
  const seenFolderIds = new Set<string>();
  const recentFolders: RecentItem[] = [];
  const seenFileIds = new Set<string>();
  const recentFiles: RecentItem[] = [];

  for (const item of recentItems) {
    if (item.item_kind === "folder") {
      if (!seenFolderIds.has(item.item_id)) {
        seenFolderIds.add(item.item_id);
        recentFolders.push(item);
      }
    } else {
      if (!seenFileIds.has(item.item_id)) {
        seenFileIds.add(item.item_id);
        recentFiles.push(item);
      }
    }
  }

  const reviewItems = (reviewsData?.items as ReviewFeedItem[]) || [];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className="relative max-w-[1208px] mx-auto space-y-8 pb-12 select-none"
    >
      {/* Global Drag Overlay on Home for all users */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-[var(--panel)] border-2 border-dashed border-[var(--accent)] p-12 text-center shadow-xl">
            <Upload size={48} className="text-[var(--accent)] animate-bounce mb-4" />
            <p className="text-xl font-bold text-white">Drop files anywhere to upload</p>
            <p className="text-sm text-[var(--text-2)] mt-1">They go to My Drive. Only you can see them.</p>
          </div>
        </div>
      )}

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Page Header (P03: Good morning, Harsh / P05: Welcome to Playhead, Kushal) */}
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold text-white tracking-tight">
          {isFirstTime
            ? `Welcome to Playhead, ${firstName}`
            : `${getTimeOfDayGreeting()}, ${firstName}`}
        </h1>
        <p className="text-sm text-[var(--text-2)]">
          {isFirstTime
            ? "Your private My Drive is ready. Upload something or open a project."
            : reviewCount > 0
            ? `${reviewCount} ${reviewCount === 1 ? "file is" : "files are"} waiting for your review.`
            : "All caught up. Your private My Drive and workspace are ready."}
        </p>
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleUploadClick}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] px-3.5 text-sm font-semibold text-[var(--button-text)] transition-colors shadow-sm"
        >
          <Upload size={18} className="text-[var(--button-text)]" />
          <span>Upload</span>
        </button>

        <button
          onClick={() => router.push("/my-drive")}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <FolderPlus size={18} />
          <span>New folder</span>
        </button>

        <button
          onClick={() => setShowNewDoc(true)}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <FileText size={18} />
          <span>New document</span>
        </button>

        <button
          onClick={() => setShowNewSheet(true)}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <TableChart size={18} />
          <span>New spreadsheet</span>
        </button>

        {!isClient && hasPermission("projects.create") && (
          <button
            onClick={() => setShowNewProject(true)}
            className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] px-3.5 text-sm font-semibold text-white transition-colors"
          >
            <FolderOpen size={18} />
            <span>New project</span>
          </button>
        )}
      </div>

      {/* Section: My Drive (4 Default Folders) */}
      {isDriveAccessible && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">My Drive</h2>
            <Link
              href="/my-drive"
              className="text-[13px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              Open My Drive
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {driveFolders.map((folder) => (
              <DriveFolderCard
                key={folder.id}
                id={folder.id}
                name={folder.name}
                category={folder.category}
                fileCount={folder.file_count === 0 ? "Empty" : folder.file_count}
                totalSize={folder.file_count === 0 ? "" : formatBytes(folder.total_bytes)}
                onOpen={() => router.push(`/my-drive?folder=${folder.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section: Recent folders (P03: Folders only, deduplicated, newest first) */}
      {recentFolders.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Recent folders</h2>
            <Link
              href="/my-drive"
              className="text-[13px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {recentFolders.slice(0, 4).map((folder) => (
              <FolderCard
                key={folder.id}
                id={folder.item_id}
                name={folder.item_name}
                itemCount={0}
                totalBytes={folder.total_bytes || 0}
                thumbnails={[]}
                isSelected={false}
                onToggleSelect={() => {}}
                onOpen={() => {
                  if (folder.project_id) {
                    router.push(`/projects/${folder.project_id}`);
                  } else {
                    router.push(`/my-drive?folder=${folder.item_id}`);
                  }
                }}
                onContextMenu={(e) => {
                  if (e && "preventDefault" in e && typeof e.preventDefault === "function") {
                    e.preventDefault();
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section: Recent files (P03: List table, deduplicated, newest first) */}
      {recentFiles.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Recent files</h2>
            <Link
              href="/my-drive"
              className="text-[13px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="rounded-[12px] bg-[var(--panel)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            {recentFiles.slice(0, 6).map((item) => {
              const IconComp = getRecentItemIcon(item.item_kind, item.category);
              const style = getRecentItemCategoryStyle(item.item_kind, item.category);
              const location = item.project_name || "My Drive";

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.project_id) {
                      router.push(`/projects/${item.project_id}?item=${item.item_id}`);
                    } else {
                      router.push("/my-drive");
                    }
                  }}
                  className="flex items-center justify-between h-14 px-4 hover:bg-[var(--hover)] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="flex items-center justify-center h-9 w-9 rounded-[8px] shrink-0"
                      style={{ backgroundColor: style.bg, color: style.color }}
                    >
                      <IconComp size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.item_name}</p>
                      <p className="text-xs text-[var(--text-3)] truncate">
                        {location}
                        {item.total_bytes > 0 && `  ·  ${formatBytes(item.total_bytes)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-[var(--text-3)]">
                      {formatRelativeTime(item.viewed_at)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Waiting for review (Real data from /reviews, hide when empty) */}
      {reviewItems.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Waiting for review</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--input)] text-[var(--text-2)]">
                {reviewItems.length}
              </span>
            </div>
            <Link
              href="/reviews"
              className="text-[13px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              Open Reviews
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {reviewItems.slice(0, 4).map((rev) => {
              const status = rev.review_status || "needs_review";
              const isApproved = status === "approved";
              const isChangesRequested = status === "changes_requested";
              const chipColor = isApproved ? "#3FCF8E" : isChangesRequested ? "#F0506E" : "#FFBB56";
              const chipText = isApproved
                ? "Approved"
                : isChangesRequested
                ? "Changes requested"
                : "Needs review";

              return (
                <div
                  key={rev.id}
                  onClick={() => {
                    if (rev.project_id) {
                      router.push(`/projects/${rev.project_id}?item=${rev.id}`);
                    }
                  }}
                  className="group relative flex flex-col justify-between h-[224px] rounded-[12px] bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--border-strong)] p-2.5 cursor-pointer transition-all duration-150 hover:scale-[1.015] active:scale-[0.98]"
                >
                  {/* Thumbnail slot */}
                  <div className="relative h-[136px] w-full rounded-[8px] bg-black overflow-hidden flex items-center justify-center">
                    <div className="w-full h-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-3)]">
                      <VideoFileIcon size={32} className="text-[var(--text-3)]" />
                    </div>

                    {/* Version chip (bottom-left) */}
                    <div className="absolute bottom-2 left-2 rounded-[5px] bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-xs font-semibold text-white">
                      v{rev.latest_version_number || 1}
                    </div>

                    {/* Duration chip (bottom-right) */}
                    {rev.duration_ms > 0 && (
                      <div className="absolute bottom-2 right-2 rounded-[5px] bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                        {formatDuration(rev.duration_ms)}
                      </div>
                    )}

                    {/* Unresolved Comments chip (top-right) */}
                    {rev.unresolved_comment_count > 0 && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-[6px] bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-xs font-medium text-white">
                        <ChatBubble size={12} />
                        <span>{rev.unresolved_comment_count}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Content Footer */}
                  <div className="pt-2 px-1 flex flex-col justify-between flex-1">
                    <div>
                      <p className="text-sm font-semibold text-white truncate group-hover:text-[var(--accent)] transition-colors">
                        {rev.name}
                      </p>
                      <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
                        {rev.project_name || "Project"}
                        {rev.unresolved_comment_count > 0 &&
                          ` · ${rev.unresolved_comment_count} new comment${
                            rev.unresolved_comment_count > 1 ? "s" : ""
                          }`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${chipColor}26`,
                          color: chipColor,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: chipColor }}
                        />
                        <span>{chipText}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drop Zone (Matching P05: only shows for a first-time user with no files) */}
      {isFirstTime && (
        <div
          onClick={handleUploadClick}
          className="flex flex-col items-center justify-center h-[220px] w-full rounded-[12px] border border-dashed border-[var(--accent)] bg-[var(--accent)]/[0.04] hover:bg-[var(--accent)]/[0.08] hover:border-[var(--accent)] transition-all p-6 text-center cursor-pointer group"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-[var(--hover)] text-white group-hover:text-[var(--accent)] transition-colors mb-3">
            <Upload size={32} />
          </div>
          <p className="text-base font-semibold text-white">Drop files anywhere to upload</p>
          <p className="text-sm text-[var(--text-2)] mt-1 mb-4">They go to My Drive. Only you can see them.</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleUploadClick();
            }}
            className="flex h-9 items-center gap-2 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] px-4 text-sm font-semibold text-[var(--button-text)] transition-colors shadow-sm"
          >
            <Upload size={18} className="text-[var(--button-text)]" />
            <span>Choose files</span>
          </button>
        </div>
      )}

      {/* Section: My Projects (Real projects or P05 empty state) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">My projects</h2>
          {projects.length > 0 && (
            <Link
              href="/projects"
              className="text-[13px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              View all
            </Link>
          )}
        </div>

        {projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((proj) => (
              <ProjectCard
                key={proj.id}
                id={proj.id}
                name={proj.name}
                clientName={proj.client_name}
                videoCount={proj.video_count || 0}
                totalBytes={proj.total_bytes || 0}
                waitingReviewCount={proj.waiting_review_count}
                members={proj.members}
                thumbnails={proj.thumbnails || []}
              />
            ))}
          </div>
        ) : (
          /* Empty State matching P05: You haven't been added to a project yet. When an Admin adds you, it shows up here. */
          <div className="flex items-center gap-4 rounded-[12px] bg-[var(--panel)] border border-[var(--border)] p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[var(--input)] text-[var(--text-3)] shrink-0">
              <FolderOpen size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {loadingProjects
                  ? "Loading your projects..."
                  : "You haven't been added to a project yet."}
              </p>
              <p className="text-[13px] text-[var(--text-3)] mt-0.5">
                When an Admin adds you, it shows up here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewProject && (
        <NewProjectDialog
          isOpen={showNewProject}
          onClose={() => setShowNewProject(false)}
        />
      )}
      {showNewDoc && (
        <NewDocumentDialog
          isOpen={showNewDoc}
          onClose={() => setShowNewDoc(false)}
        />
      )}
      {showNewSheet && (
        <NewSpreadsheetDialog
          isOpen={showNewSheet}
          onClose={() => setShowNewSheet(false)}
        />
      )}
    </div>
  );
}
