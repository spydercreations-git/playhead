"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import { DriveFolderCard } from "@/components/cards/drive-folder-card";
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
} from "@/components/ui/icon";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { NewSpreadsheetDialog } from "@/components/spreadsheets/new-spreadsheet-dialog";

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
  is_restricted?: boolean;
  waiting_review_count?: number;
  members?: { id?: string; email?: string; name?: string; color?: string }[];
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
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
      return { color: "#A3A6AD", bg: "rgba(163, 166, 173, 0.16)" };
  }
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isClient, hasPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
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
    enabled: !!user,
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

  // Real Upload Handler into My Drive
  async function handleUploadFile(file: File) {
    if (!file) return;

    setIsUploading(true);
    setUploadFileName(file.name);
    setUploadSuccessMessage(null);

    try {
      // 1. Initiate upload into My Drive
      const initData = await apiRequest<{
        upload_id: string;
        parts: Array<{ part_number: number; url: string }>;
      }>("/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({
          project_id: "drive",
          filename: file.name,
          size_bytes: file.size,
          mime: file.type || "application/octet-stream",
        }),
      });

      const { upload_id, parts } = initData;

      // 2. Upload part directly to storage presigned URL
      const completedParts = [];
      for (const p of parts) {
        const partRes = await fetch(p.url, {
          method: "PUT",
          body: file,
        });
        const etag = partRes.headers.get("ETag") || `"part-${p.part_number}"`;
        completedParts.push({ part_number: p.part_number, etag });
      }

      // 3. Complete upload
      await apiRequest(`/uploads/${upload_id}/complete`, {
        method: "POST",
        body: JSON.stringify({ parts: completedParts }),
      });

      // 4. Invalidate relevant queries to update UI in real time
      await queryClient.invalidateQueries({ queryKey: ["drive-folders"] });
      await queryClient.invalidateQueries({ queryKey: ["drive-recent"] });
      await queryClient.invalidateQueries({ queryKey: ["storage-usage"] });

      setUploadSuccessMessage(`Uploaded "${file.name}" to My Drive`);
      setTimeout(() => setUploadSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error("Home upload failed:", err);
      setUploadSuccessMessage(err.message || "Upload failed");
      setTimeout(() => setUploadSuccessMessage(null), 5000);
    } finally {
      setIsUploading(false);
      setUploadFileName("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  }

  return (
    <div className="max-w-[1208px] mx-auto space-y-8 pb-12 select-none">
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
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
        <p className="text-sm text-[#A3A6AD]">
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
          disabled={isUploading}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#3B67E0] hover:bg-[#3560D6] px-3.5 text-sm font-semibold text-white transition-colors shadow-sm disabled:opacity-50"
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          <span>{isUploading ? "Uploading..." : "Upload"}</span>
        </button>

        <button
          onClick={() => router.push("/my-drive")}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#2A2B30] hover:bg-[#2C2D33] border border-[#2E2F34] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <FolderPlus size={18} />
          <span>New folder</span>
        </button>

        <button
          onClick={() => setShowNewDoc(true)}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#2A2B30] hover:bg-[#2C2D33] border border-[#2E2F34] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <FileText size={18} />
          <span>New document</span>
        </button>

        <button
          onClick={() => setShowNewSheet(true)}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#2A2B30] hover:bg-[#2C2D33] border border-[#2E2F34] px-3.5 text-sm font-semibold text-white transition-colors"
        >
          <TableChart size={18} />
          <span>New spreadsheet</span>
        </button>

        {!isClient && hasPermission("projects.create") && (
          <button
            onClick={() => setShowNewProject(true)}
            className="flex h-9 items-center gap-2 rounded-[8px] bg-[#2A2B30] hover:bg-[#2C2D33] border border-[#2E2F34] px-3.5 text-sm font-semibold text-white transition-colors"
          >
            <FolderOpen size={18} />
            <span>New project</span>
          </button>
        )}
      </div>

      {/* Upload Notification Toast Banner */}
      {uploadSuccessMessage && (
        <div className="flex items-center gap-3 rounded-[10px] bg-[#212121] border border-[#3FCF8E]/40 px-4 py-3 text-sm text-white shadow-lg animate-in fade-in">
          <CheckCircle2 size={18} className="text-[#3FCF8E] shrink-0" />
          <span className="flex-1">{uploadSuccessMessage}</span>
          <button
            onClick={() => router.push("/my-drive")}
            className="text-xs font-semibold text-[#4876F3] hover:underline"
          >
            Open My Drive
          </button>
        </div>
      )}

      {/* Upload in Progress Card */}
      {isUploading && (
        <div className="flex items-center gap-3.5 rounded-[12px] bg-[#212121] border border-[#4876F3] p-4 text-white shadow-lg animate-pulse">
          <Loader2 size={22} className="text-[#4876F3] animate-spin shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">Uploading {uploadFileName}...</p>
            <p className="text-xs text-[#7C7F87] mt-0.5">Saving directly into your private My Drive</p>
          </div>
        </div>
      )}

      {/* Section: My Drive (4 Default Folders) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">My Drive</h2>
          <Link
            href="/my-drive"
            className="text-[13px] font-medium text-[#A3A6AD] hover:text-white transition-colors"
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

      {/* Section: Recent folders / Recent items (P03) */}
      {recentItems.length > 0 && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Recent folders</h2>
            <Link
              href="/my-drive"
              className="text-[13px] font-medium text-[#A3A6AD] hover:text-white transition-colors"
            >
              View all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {recentItems.slice(0, 4).map((item) => {
              const IconComp = getRecentItemIcon(item.item_kind, item.category);
              const style = getRecentItemCategoryStyle(item.item_kind, item.category);
              const location = item.project_name || "My Drive";
              const detail =
                item.item_kind === "folder"
                  ? `${location}`
                  : `${location}  ·  ${formatBytes(item.total_bytes)}`;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.project_id) {
                      router.push(`/projects/${item.project_id}`);
                    } else {
                      router.push("/my-drive");
                    }
                  }}
                  className="group flex items-center justify-between h-[88px] w-full rounded-[12px] bg-[#212121] border border-[#2E2F34] hover:border-[#424344] p-4 select-none cursor-pointer transition-all duration-150 hover:scale-[1.015] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className="flex items-center justify-center h-10 w-10 rounded-[10px] shrink-0"
                      style={{ backgroundColor: style.bg, color: style.color }}
                    >
                      <IconComp size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{item.item_name}</p>
                      <p className="text-xs text-[#7C7F87] truncate mt-0.5">{detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drop Zone (Matching P05) */}
      <div
        onClick={handleUploadClick}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center h-[220px] w-full rounded-[12px] border border-dashed transition-all p-6 text-center cursor-pointer ${
          isDragging
            ? "border-[#4876F3] bg-[#4876F3]/[0.12] scale-[1.01]"
            : "border-[#4876F3] bg-[#4876F3]/[0.04] hover:bg-[#4876F3]/[0.08]"
        }`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#2C2D33] text-[#A3A6AD] mb-3">
          <Upload size={32} />
        </div>
        <p className="text-base font-semibold text-white">Drop files anywhere to upload</p>
        <p className="text-sm text-[#A3A6AD] mt-1 mb-4">They go to My Drive. Only you can see them.</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleUploadClick();
          }}
          disabled={isUploading}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#3B67E0] hover:bg-[#3560D6] px-4 text-sm font-semibold text-white transition-colors shadow-sm disabled:opacity-50"
        >
          <Upload size={18} />
          <span>Choose files</span>
        </button>
      </div>

      {/* Section: My Projects (Real projects or P05 empty state) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">My projects</h2>
          {projects.length > 0 && (
            <Link
              href="/projects"
              className="text-[13px] font-medium text-[#A3A6AD] hover:text-white transition-colors"
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
                isRestricted={proj.is_restricted}
                waitingReviewCount={proj.waiting_review_count}
                members={proj.members}
              />
            ))}
          </div>
        ) : (
          /* Empty State matching P05: You haven't been added to a project yet. When an Admin adds you, it shows up here. */
          <div className="flex items-center gap-4 rounded-[12px] bg-[#212121] border border-[#2E2F34] p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#2A2B30] text-[#7C7F87] shrink-0">
              <FolderOpen size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                {loadingProjects
                  ? "Loading your projects..."
                  : "You haven't been added to a project yet."}
              </p>
              <p className="text-[13px] text-[#7C7F87] mt-0.5">
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
