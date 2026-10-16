"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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

export default function HomePage() {
  const router = useRouter();
  const { user, isClient, hasPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);

  // Real review items count
  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-count"],
    queryFn: () => apiRequest<{ items: any[] }>("/reviews").catch(() => ({ items: [] })),
    staleTime: 30_000,
    enabled: !!user,
  });
  const reviewCount = reviewsData?.items?.length || 0;

  // Real Drive folders stats (from /drive/folders when built in Page 2)
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

  const driveFolders = driveFoldersData?.folders || [
    { id: "videos", name: "Videos", category: "videos" as const, file_count: 0, total_bytes: 0 },
    { id: "images", name: "Images", category: "images" as const, file_count: 0, total_bytes: 0 },
    { id: "documents", name: "Documents", category: "documents" as const, file_count: 0, total_bytes: 0 },
    { id: "music", name: "Music", category: "music" as const, file_count: 0, total_bytes: 0 },
  ];

  // Real projects list
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiRequest<{ projects: ProjectItem[] }>("/projects").catch(() => ({ projects: [] })),
    staleTime: 30_000,
    enabled: !!user,
  });
  const projects = projectsData?.projects || [];

  const firstName = user?.name ? user.name.split(" ")[0] : "there";

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      router.push("/my-drive");
    }
  }

  return (
    <div className="max-w-[1208px] mx-auto space-y-8 pb-12 select-none">
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Page Header (P03/P05: 28px bold, 14px text-2) */}
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold text-white tracking-tight">
          {reviewCount > 0
            ? `Good day, ${firstName}`
            : `Welcome to Playhead, ${firstName}`}
        </h1>
        <p className="text-sm text-[#A3A6AD]">
          {reviewCount > 0
            ? `${reviewCount} ${reviewCount === 1 ? "file is" : "files are"} waiting for your review.`
            : "Your private My Drive is ready. Upload something or open a project."}
        </p>
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleUploadClick}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#3B67E0] hover:bg-[#3560D6] px-3.5 text-sm font-semibold text-white transition-colors shadow-sm"
        >
          <Upload size={18} />
          <span>Upload</span>
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

      {/* Drop Zone (Matching P05) */}
      <div
        onClick={handleUploadClick}
        className="flex flex-col items-center justify-center h-[220px] w-full rounded-[12px] border border-dashed border-[#4876F3] bg-[#4876F3]/[0.04] p-6 text-center cursor-pointer transition-colors hover:bg-[#4876F3]/[0.08]"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#2C2D33] text-[#A3A6AD] mb-3">
          <Upload size={32} />
        </div>
        <p className="text-base font-semibold text-white">
          Drop files anywhere to upload
        </p>
        <p className="text-sm text-[#A3A6AD] mt-1 mb-4">
          They go to My Drive. Only you can see them.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleUploadClick();
          }}
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#3B67E0] hover:bg-[#3560D6] px-4 text-sm font-semibold text-white transition-colors shadow-sm"
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
          /* Empty State matching P05 */
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
                When someone adds you to a project or shares files with you, they will appear here.
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
