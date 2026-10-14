"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { UploadTray, UploadItem } from "@/components/uploads/upload-tray";
import {
  DownloadTray,
  DownloadSession,
  DownloadFile,
  startBrowserDownload,
} from "@/components/downloads/download-tray";
import { FileViewer, ViewerItem } from "@/components/files/file-viewer";
import { Download, FolderDown, ChevronDown } from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ProjectWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const currentFolderId = searchParams.get("folder") || null;

  const { user } = useAuth();

  // Workspace UI states
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Rename & Move Modal states
  const [renameItem, setRenameItem] = useState<{ id: string; name: string } | null>(null);
  const [moveItem, setMoveItem] = useState<{ id: string; name: string } | null>(null);
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string | null>(null);

  // File Viewer modal state
  const [activeViewerItem, setActiveViewerItem] = useState<ViewerItem | null>(null);

  // Upload Tray & Queue state
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Download Tray & Session state
  const [downloadSession, setDownloadSession] = useState<DownloadSession | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadPausedRef = useRef(false);
  const downloadCancelledRef = useRef(false);

  // Check if browser has File System Access API (Chrome, Edge, Opera)
  const [hasFileSystemAccess, setHasFileSystemAccess] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
      setHasFileSystemAccess(true);
    }
  }, []);

  // Name conflict prompt state (Requirement 5)
  const [conflictPrompt, setConflictPrompt] = useState<{
    file: File;
    existingId: string;
    existingName: string;
  } | null>(null);

  // 1. Fetch Items for current folder / project root
  const { data: workspaceData, isLoading, error } = useQuery({
    queryKey: ["project-items", projectId, currentFolderId, typeFilter, sortBy],
    queryFn: () =>
      apiRequest(
        `/projects/${projectId}/items?parent_id=${currentFolderId || ""}&type=${typeFilter}&sort=${sortBy}`
      ),
    refetchInterval: 5000,
  });

  // 2. Fetch Folder Tree for sidebar & move picker
  const { data: treeData } = useQuery({
    queryKey: ["project-tree", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/folders/tree`),
  });

  // 3. Fetch People
  const { data: peopleData } = useQuery({
    queryKey: ["project-people", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/people`),
    enabled: showPeopleModal,
  });

  // Mutations
  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("/items/folder", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: currentFolderId,
          name: name.trim(),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setShowNewFolderModal(false);
      setNewFolderName("");
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setRenameItem(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, targetParentId }: { id: string; targetParentId: string | null }) =>
      apiRequest(`/items/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ target_parent_id: targetParentId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setMoveItem(null);
      setTargetMoveFolderId(null);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/items/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
    },
  });

  const batchActionMutation = useMutation({
    mutationFn: ({ action, ids, targetParentId }: { action: string; ids: string[]; targetParentId?: string | null }) =>
      apiRequest("/items/batch", {
        method: "POST",
        body: JSON.stringify({
          action,
          item_ids: ids,
          target_parent_id: targetParentId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setSelectedItemIds([]);
    },
  });

  const copyItemMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/items/${id}/copy`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
    },
  });

  const starMutation = useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      apiRequest(`/items/${id}/star`, {
        method: isStarred ? "DELETE" : "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
    },
  });

  // Fast Parallel Resumable Upload Engine (Requirement 4 & Section 7)
  const startFileUpload = async (file: File, targetItemId?: string, customName?: string) => {
    const filename = customName || file.name;
    const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    try {
      // 1. Initiate upload with server
      const initRes = await apiRequest("/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: currentFolderId,
          target_item_id: targetItemId || null,
          filename: filename,
          size_bytes: file.size,
          mime: file.type || "application/octet-stream",
        }),
      });

      const newUpload: UploadItem = {
        id: tempId,
        uploadId: initRes.upload_id,
        itemId: initRes.item_id,
        projectId,
        parentId: currentFolderId,
        file,
        filename,
        sizeBytes: file.size,
        mime: file.type,
        storageKey: initRes.storage_key,
        partSizeBytes: initRes.part_size_bytes,
        totalParts: initRes.total_parts,
        parts: initRes.parts,
        completedParts: [],
        progressPercent: 0,
        speedBytesPerSec: 0,
        status: "uploading",
      };

      setUploads((prev) => [newUpload, ...prev]);

      // Execute upload parts directly to S3/R2 with 6 parts parallel
      await uploadFileParts(newUpload, file);
    } catch (err: any) {
      setUploads((prev) =>
        prev.map((u) =>
          u.id === tempId ? { ...u, status: "error", errorMsg: err.message || "Upload failed" } : u
        )
      );
    }
  };

  // Restore unfinished uploads after browser refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(`playhead_uploads_${projectId}`);
      if (saved) {
        const parsed: UploadItem[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUploads((prev) => {
            const existingIds = new Set(prev.map((u) => u.id));
            const newItems = parsed.filter((u) => !existingIds.has(u.id));
            return [...prev, ...newItems];
          });
        }
      }
    } catch (e) {}
  }, [projectId]);

  // Persist unfinished uploads to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unfinished = uploads.filter((u) => u.status !== "completed" && u.status !== "aborted");
    if (unfinished.length > 0) {
      const toSave = unfinished.map((u) => ({
        id: u.id,
        uploadId: u.uploadId,
        itemId: u.itemId,
        projectId: u.projectId,
        parentId: u.parentId,
        filename: u.filename,
        sizeBytes: u.sizeBytes,
        mime: u.mime,
        storageKey: u.storageKey,
        partSizeBytes: u.partSizeBytes,
        totalParts: u.totalParts,
        parts: u.parts,
        completedParts: u.completedParts,
        progressPercent: u.progressPercent,
        status: "paused",
      }));
      localStorage.setItem(`playhead_uploads_${projectId}`, JSON.stringify(toSave));
    } else {
      localStorage.removeItem(`playhead_uploads_${projectId}`);
    }
  }, [uploads, projectId]);

  // Handle re-attaching file after browser refresh
  const handleAttachFileAndResume = async (id: string, picked: File) => {
    const item = uploads.find((u) => u.id === id);
    if (!item) return;

    try {
      // Query completed parts from server/storage
      const partsRes = await apiRequest(`/uploads/${item.uploadId}/parts`);
      const completedParts: Array<{ part_number: number; etag: string }> = partsRes.parts || [];

      let completedBytes = 0;
      for (const cp of completedParts) {
        const start = (cp.part_number - 1) * item.partSizeBytes;
        const end = Math.min(start + item.partSizeBytes, item.sizeBytes);
        completedBytes += (end - start);
      }
      const percent = Math.min(99, Math.round((completedBytes / item.sizeBytes) * 100));

      const updated: UploadItem = {
        ...item,
        file: picked,
        completedParts,
        progressPercent: percent,
        status: "uploading",
      };

      setUploads((prev) => prev.map((u) => (u.id === id ? updated : u)));

      // Resume uploading only the missing parts
      await uploadFileParts(updated, picked);
    } catch (err: any) {
      alert("Failed to resume upload: " + err.message);
    }
  };

  const uploadFileParts = async (uploadItem: UploadItem, file: File) => {
    const partSize = uploadItem.partSizeBytes;
    const totalParts = uploadItem.totalParts;
    const completedParts: Array<{ part_number: number; etag: string }> = [
      ...(uploadItem.completedParts || []),
    ];

    let uploadedBytes = 0;
    for (const cp of completedParts) {
      const start = (cp.part_number - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      uploadedBytes += (end - start);
    }

    const startTime = Date.now();
    const maxConcurrent = 6;
    let currentPartIndex = 0;

    const uploadNextPart = async (): Promise<void> => {
      // Find next part number that is NOT yet in completedParts
      let partNum = -1;
      while (currentPartIndex < totalParts) {
        const candidate = currentPartIndex + 1;
        currentPartIndex++;
        if (!completedParts.some((cp) => cp.part_number === candidate)) {
          partNum = candidate;
          break;
        }
      }

      if (partNum === -1) return;

      const partInfo = uploadItem.parts.find((p) => p.part_number === partNum);
      if (!partInfo) return;

      const start = (partNum - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);

      try {
        const putRes = await fetch(partInfo.url, {
          method: "PUT",
          body: chunk,
        });

        if (!putRes.ok) {
          throw new Error(`Part ${partNum} upload failed`);
        }

        const etag = putRes.headers.get("ETag") || `part-${partNum}`;
        completedParts.push({ part_number: partNum, etag });

        uploadedBytes += chunk.size;
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? uploadedBytes / elapsedSec : 0;
        const percent = Math.min(99, Math.round((uploadedBytes / file.size) * 100));

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadItem.id
              ? {
                  ...u,
                  progressPercent: percent,
                  speedBytesPerSec: speed,
                  completedParts,
                }
              : u
          )
        );

        return uploadNextPart();
      } catch (err: any) {
        throw err;
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrent, totalParts); i++) {
      workers.push(uploadNextPart());
    }

    await Promise.all(workers);

    completedParts.sort((a, b) => a.part_number - b.part_number);

    await apiRequest(`/uploads/${uploadItem.uploadId}/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: completedParts }),
    });

    setUploads((prev) =>
      prev.map((u) =>
        u.id === uploadItem.id ? { ...u, progressPercent: 100, status: "completed" } : u
      )
    );

    queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
  };

  // Handle files selected via input or drop
  const handleFilesSelected = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check name conflict (Requirement 5)
      try {
        const conflictRes = await apiRequest("/items/check-conflict", {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            parent_id: currentFolderId,
            name: file.name,
          }),
        });

        if (conflictRes.conflict && conflictRes.existing_kind === "file") {
          setConflictPrompt({
            file,
            existingId: conflictRes.existing_id,
            existingName: conflictRes.existing_name,
          });
          return;
        }
      } catch (e) {
        // Continue if check fails
      }

      await startFileUpload(file);
    }
  };

  // Drag & drop handlers
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Copy project link
  const handleCopyProjectLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Browser-direct downloads (Requirement 1: client-zip default, folder in Chrome/Edge)
  const handleStartDownload = async (mode: "zip" | "folder") => {
    if (selectedItemIds.length === 0) return;

    try {
      const res = await apiRequest("/downloads/prepare", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          item_ids: selectedItemIds,
        }),
      });

      const manifest = res as { files: DownloadFile[]; total_bytes: number; file_count: number };
      if (!manifest.files || manifest.files.length === 0) {
        alert("No downloadable files in selected items.");
        return;
      }

      downloadPausedRef.current = false;
      downloadCancelledRef.current = false;

      const newSession: DownloadSession = {
        id: Math.random().toString(36).substring(2),
        name: project?.name || "Download",
        mode,
        totalBytes: manifest.total_bytes,
        downloadedBytes: 0,
        speedBytesPerSec: 0,
        status: "downloading",
        files: manifest.files.map((f) => ({
          id: f.id,
          name: f.name,
          path: f.path,
          sizeBytes: f.size_bytes,
          downloadedBytes: 0,
          status: "pending",
        })),
      };

      setDownloadSession(newSession);

      await startBrowserDownload({
        manifest,
        mode,
        onProgress: (updates) => {
          setDownloadSession((prev) => (prev ? { ...prev, ...updates } : null));
        },
        isPausedRef: downloadPausedRef,
        isCancelledRef: downloadCancelledRef,
      });
    } catch (e: any) {
      alert(e.message || "Download failed");
    }
  };

  const project = workspaceData?.project;
  const access = workspaceData?.access;
  const items = workspaceData?.items || [];
  const breadcrumbs = workspaceData?.breadcrumbs || [];
  const folders = treeData?.folders || [];

  const foldersList = items.filter((it: any) => it.kind === "folder");
  const filesList = items.filter((it: any) => it.kind === "file");

  const canUpload = access?.can_upload;
  const canDownload = access?.can_download;

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-[#2E2F34] animate-pulse rounded-lg" />
        <div className="h-10 w-full bg-[#2E2F34] animate-pulse rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-[#2E2F34] animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Project Not Found</h2>
        <p className="text-sm text-[#9A9DA0]">
          You do not have access to this project or it does not exist.
        </p>
        <Link
          href="/projects"
          className="inline-block px-4 py-2 bg-[#4876F3] text-white rounded-lg text-sm font-semibold hover:bg-[#3b66df]"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex h-[calc(100vh-64px)] overflow-hidden font-sans select-none"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Hidden Inputs for File and Folder upload */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        />
        <input
          type="file"
          ref={folderInputRef}
          // @ts-ignore
          webkitdirectory="true"
          directory="true"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        />

        {/* =========================================================================
            PROJECT SIDEBAR (Folder Tree per PROJECT_WORKSPACE.md & Section 6.7)
            ========================================================================= */}
        <div className="w-64 border-r border-[#424344]/50 bg-[#1a1a1a] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#424344]/50">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9A9DA0]">
              Folders
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-0.5 text-xs">
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                !currentFolderId
                  ? "bg-[#2E2F34] text-white font-semibold"
                  : "text-[#9A9DA0] hover:bg-[#2E2F34]/50 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span>📁</span>
                <span className="truncate">Root</span>
              </div>
              <span className="text-[10px] text-[#747678]">{project.file_count}</span>
            </button>

            {folders.map((f: any) => {
              const isSelected = currentFolderId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => router.push(`/projects/${projectId}?folder=${f.id}`)}
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    isSelected
                      ? "bg-[#2E2F34] text-white font-semibold"
                      : "text-[#9A9DA0] hover:bg-[#2E2F34]/50 hover:text-white"
                  }`}
                  title={`${f.name} (${f.file_count || 0} files · ${formatBytes(f.total_bytes || 0)})`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span>📁</span>
                    <span className="truncate">{f.name}</span>
                  </div>
                  <span className="text-[10px] text-[#747678]">{f.file_count || 0}</span>
                </button>
              );
            })}
          </div>

          {/* Links bottom */}
          <div className="p-3 border-t border-[#424344]/50 space-y-1">
            <Link
              href="/trash"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white transition-colors"
            >
              <span>🗑️</span>
              <span>Recently deleted</span>
            </Link>
          </div>
        </div>

        {/* =========================================================================
            MAIN WORKSPACE AREA
            ========================================================================= */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#181818]">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-8 py-4 border-b border-[#424344]/50 bg-[#1e1e1e]">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#9A9DA0] mb-0.5">
                <Link href="/projects" className="hover:text-white">Projects</Link>
                <span>/</span>
                <span className="text-white font-medium">{project.name}</span>
                {breadcrumbs.map((b: any) => (
                  <React.Fragment key={b.id}>
                    <span>/</span>
                    <Link
                      href={`/projects/${projectId}?folder=${b.id}`}
                      className="hover:text-white"
                    >
                      {b.name}
                    </Link>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {project.name}
                </h1>
                {/* Live Counts Chip (Section 3.1 & 6.7) */}
                <div className="rounded-full bg-[#2E2F34] px-3 py-0.5 text-xs font-mono text-[#9A9DA0] flex items-center gap-2 border border-[#424344]/50">
                  <span>{project.file_count} files</span>
                  <span>•</span>
                  <span>{project.folder_count} folders</span>
                  <span>•</span>
                  <span>{project.video_count} videos</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">{formatBytes(project.total_bytes)}</span>
                </div>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPeopleModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2E2F34] text-xs font-medium text-white hover:bg-[#383a42] transition-colors"
              >
                <span>👥</span>
                <span>People & Access</span>
              </button>

              <button
                onClick={handleCopyProjectLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E2F34] text-xs font-medium text-[#9A9DA0] hover:text-white transition-colors"
              >
                <span>🔗</span>
                <span>{copiedLink ? "Link copied!" : "Copy link"}</span>
              </button>
            </div>
          </div>

          {/* Action Row (Section 6.7) */}
          <div className="flex items-center justify-between px-8 py-3 border-b border-[#424344]/40 bg-[#1b1b1b]">
            <div className="flex items-center gap-2">
              {/* Upload Dropdown */}
              {canUpload && (
                <div className="relative group">
                  <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3b66df] transition-colors shadow">
                    <span>↑ Upload</span>
                    <span className="text-[10px]">▾</span>
                  </button>
                  <div className="absolute left-0 top-8 z-30 hidden group-hover:block rounded-lg border border-[#424344] bg-[#212121] py-1 shadow-2xl w-36">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white hover:bg-[#2E2F34]"
                    >
                      <span>📄</span>
                      <span>Upload Files</span>
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white hover:bg-[#2E2F34]"
                    >
                      <span>📁</span>
                      <span>Upload Folder</span>
                    </button>
                  </div>
                </div>
              )}

              {canUpload && (
                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2E2F34] text-xs font-medium text-white hover:bg-[#383a42] transition-colors"
                >
                  <span>+ New folder</span>
                </button>
              )}

              {/* Type Filter Pills */}
              <div className="flex items-center gap-1 ml-4 bg-[#212121] p-1 rounded-lg border border-[#424344]/50 text-xs">
                {["all", "videos", "audio", "images", "documents", "other"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTypeFilter(filter)}
                    className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                      typeFilter === filter
                        ? "bg-[#4876F3] text-white"
                        : "text-[#9A9DA0] hover:text-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Side Controls: Sort and Grid/List */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-[#212121] p-0.5 rounded-lg border border-[#424344]/50">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded text-xs ${
                    viewMode === "grid" ? "bg-[#2E2F34] text-white" : "text-[#9A9DA0]"
                  }`}
                  title="Grid view"
                >
                  ▦
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded text-xs ${
                    viewMode === "list" ? "bg-[#2E2F34] text-white" : "text-[#9A9DA0]"
                  }`}
                  title="List view"
                >
                  ☰
                </button>
              </div>
            </div>
          </div>

          {/* =========================================================================
              FILE & FOLDER AREA
              ========================================================================= */}
          <div className="flex-1 overflow-y-auto p-8">
            {items.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center border-2 border-dashed border-[#424344]/50 rounded-2xl text-center p-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#2E2F34] flex items-center justify-center text-3xl">
                  📁
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Drop files or folders here</h3>
                  <p className="text-xs text-[#9A9DA0] mt-1 max-w-sm">
                    Drag files anywhere on the page to start fast parallel uploads, or create a folder.
                  </p>
                </div>
                {canUpload && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-[#4876F3] text-white rounded-lg text-xs font-semibold hover:bg-[#3b66df]"
                    >
                      Upload files
                    </button>
                    <button
                      onClick={() => setShowNewFolderModal(true)}
                      className="px-4 py-2 bg-[#2E2F34] text-white rounded-lg text-xs font-semibold hover:bg-[#383a42]"
                    >
                      New folder
                    </button>
                  </div>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <div className="space-y-8">
                {/* Folders Section First (Section 6.7) */}
                {foldersList.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A9DA0] mb-3">
                      Folders
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {foldersList.map((folder: any) => {
                        const isSelected = selectedItemIds.includes(folder.id);
                        return (
                          <div
                            key={folder.id}
                            onDoubleClick={() =>
                              router.push(`/projects/${projectId}?folder=${folder.id}`)
                            }
                            onClick={() => {
                              if (isSelected) {
                                setSelectedItemIds(selectedItemIds.filter((id) => id !== folder.id));
                              } else {
                                setSelectedItemIds([...selectedItemIds, folder.id]);
                              }
                            }}
                            className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#4876F3]/15 border-[#4876F3]"
                                : "bg-[#212121] border-[#424344]/60 hover:bg-[#2E2F34]/80 hover:border-[#424344]"
                            }`}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <span className="text-2xl">📁</span>
                              <div className="truncate">
                                <p className="font-semibold text-xs text-white truncate">
                                  {folder.name}
                                </p>
                                <p className="text-[10px] text-[#9A9DA0]">
                                  {folder.video_count || 0} videos · {folder.file_count || 0} files • {formatBytes(folder.total_bytes || 0)}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameItem({ id: folder.id, name: folder.name });
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#424344] text-[#9A9DA0] hover:text-white"
                              title="Rename"
                            >
                              ✎
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Files Section */}
                {filesList.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A9DA0] mb-3">
                      Files
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {filesList.map((file: any) => {
                        const isSelected = selectedItemIds.includes(file.id);
                        return (
                          <div
                            key={file.id}
                            onDoubleClick={() => setActiveViewerItem(file)}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedItemIds(selectedItemIds.filter((id) => id !== file.id));
                              } else {
                                setSelectedItemIds([...selectedItemIds, file.id]);
                              }
                            }}
                            className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#4876F3]/15 border-[#4876F3]"
                                : "bg-[#212121] border-[#424344]/60 hover:bg-[#2E2F34]/80 hover:border-[#424344]"
                            }`}
                          >
                            {/* Star Toggle Top Right */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                starMutation.mutate({ id: file.id, isStarred: !!file.is_starred });
                              }}
                              className="absolute top-3 right-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {file.is_starred ? "⭐" : "☆"}
                            </button>

                            {/* Thumbnail Preview Area */}
                            <div className="h-28 w-full rounded-lg bg-[#181818] flex items-center justify-center text-4xl mb-3 border border-[#424344]/30">
                              {file.name.endsWith(".mp4") || file.name.endsWith(".mov")
                                ? "🎬"
                                : file.name.endsWith(".mp3") || file.name.endsWith(".wav")
                                ? "🎵"
                                : file.name.endsWith(".pdf")
                                ? "📕"
                                : file.name.endsWith(".png") || file.name.endsWith(".jpg")
                                ? "🖼️"
                                : "📄"}
                            </div>

                            {/* File Name & Meta */}
                            <div>
                              <p className="font-semibold text-xs text-white truncate" title={file.name}>
                                {file.name}
                              </p>
                              <div className="flex items-center justify-between mt-1 text-[10px] text-[#9A9DA0]">
                                <span>{formatBytes(file.size_bytes)}</span>
                                <span className="rounded bg-[#2E2F34] px-1 font-mono">
                                  v{file.version_number || 1}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* List View (TanStack style) */
              <div className="bg-[#212121] border border-[#424344]/60 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#181818] text-[#9A9DA0] border-b border-[#424344]/50">
                    <tr>
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.length > 0 && selectedItemIds.length === items.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIds(items.map((it: any) => it.id));
                            } else {
                              setSelectedItemIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Size</th>
                      <th className="p-3 font-medium">Version</th>
                      <th className="p-3 font-medium">Uploaded by</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#424344]/30 text-white">
                    {items.map((it: any) => {
                      const isSelected = selectedItemIds.includes(it.id);
                      return (
                        <tr
                          key={it.id}
                          onDoubleClick={() => {
                            if (it.kind === "folder") {
                              router.push(`/projects/${projectId}?folder=${it.id}`);
                            } else {
                              setActiveViewerItem(it);
                            }
                          }}
                          className={`hover:bg-[#2E2F34]/50 transition-colors cursor-pointer ${
                            isSelected ? "bg-[#4876F3]/10" : ""
                          }`}
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedItemIds(selectedItemIds.filter((id) => id !== it.id));
                                } else {
                                  setSelectedItemIds([...selectedItemIds, it.id]);
                                }
                              }}
                            />
                          </td>
                          <td className="p-3 font-medium flex items-center gap-2">
                            <span>{it.kind === "folder" ? "📁" : "📄"}</span>
                            <span className="truncate max-w-xs">{it.name}</span>
                          </td>
                          <td className="p-3 text-[#9A9DA0]">{formatBytes(it.size_bytes || it.total_bytes || 0)}</td>
                          <td className="p-3 text-[#9A9DA0]">v{it.version_number || 1}</td>
                          <td className="p-3 text-[#9A9DA0]">{it.created_by_name || "You"}</td>
                          <td className="p-3 text-[#9A9DA0]">
                            {it.created_at ? new Date(it.created_at).toLocaleDateString() : ""}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => setRenameItem({ id: it.id, name: it.name })}
                              className="px-2 py-1 text-xs text-[#9A9DA0] hover:text-white"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => deleteItemMutation.mutate(it.id)}
                              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 ml-1"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* =========================================================================
              FLOATING SELECTION BAR (Section 6.7)
              ========================================================================= */}
          {selectedItemIds.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#212121] border border-[#424344] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-xs font-medium text-white z-40 animate-in fade-in slide-in-from-bottom-4">
              <span>{selectedItemIds.length} selected</span>

              <div className="h-4 w-px bg-[#424344]" />

              {canDownload && (
                <div className="relative inline-flex items-center rounded-lg bg-[#4876F3] text-white font-semibold shadow">
                  <button
                    onClick={() => handleStartDownload("zip")}
                    className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-[#3b66df] transition-colors rounded-l-lg"
                    title="Download all selected items as a single zip archive"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download (Zip)</span>
                  </button>

                  {hasFileSystemAccess && (
                    <div className="relative">
                      <button
                        onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                        className="px-1.5 py-1.5 hover:bg-[#3b66df] border-l border-white/20 transition-colors rounded-r-lg"
                        title="More download options"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>

                      {showDownloadMenu && (
                        <div className="absolute bottom-full right-0 mb-2 w-52 rounded-xl border border-[#424344] bg-[#212121] py-1 shadow-2xl text-xs z-50">
                          <button
                            onClick={() => {
                              setShowDownloadMenu(false);
                              handleStartDownload("zip");
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[#2E2F34] text-white"
                          >
                            <Download className="h-3.5 w-3.5 text-neutral-300" />
                            <div>
                              <p className="font-semibold">Download as Zip</p>
                              <p className="text-[10px] text-[#9A9DA0]">Default streaming zip</p>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setShowDownloadMenu(false);
                              handleStartDownload("folder");
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[#2E2F34] text-white"
                          >
                            <FolderDown className="h-3.5 w-3.5 text-amber-400" />
                            <div>
                              <p className="font-semibold">Download into a folder</p>
                              <p className="text-[10px] text-[#9A9DA0]">Save directly into a folder</p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (confirm(`Move ${selectedItemIds.length} item(s) to Trash?`)) {
                    batchActionMutation.mutate({ action: "delete", ids: selectedItemIds });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E2F34] text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <span>🗑️</span>
                <span>Delete</span>
              </button>

              <button
                onClick={() => setSelectedItemIds([])}
                className="text-[#9A9DA0] hover:text-white px-1 text-base"
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          MODALS: File Viewer, New Folder, Rename, Conflict, People
          ========================================================================= */}

      {/* File Viewer Modal (Section 6.8 & Requirement 11) */}
      {activeViewerItem && (
        <FileViewer
          item={activeViewerItem}
          itemsList={filesList}
          canDownload={!!canDownload}
          onClose={() => setActiveViewerItem(null)}
          onSelectNext={() => {
            const idx = filesList.findIndex((f: any) => f.id === activeViewerItem.id);
            if (idx >= 0 && idx < filesList.length - 1) {
              setActiveViewerItem(filesList[idx + 1]);
            }
          }}
          onSelectPrev={() => {
            const idx = filesList.findIndex((f: any) => f.id === activeViewerItem.id);
            if (idx > 0) {
              setActiveViewerItem(filesList[idx - 1]);
            }
          }}
        />
      )}

      {/* Name Conflict Dialog (Requirement 5) */}
      {conflictPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans">
          <div className="w-full max-w-sm rounded-2xl bg-[#212121] border border-[#424344] p-6 shadow-2xl space-y-4">
            <h3 className="font-semibold text-base text-white">File Name Conflict</h3>
            <p className="text-xs text-[#9A9DA0]">
              A file named <strong>&quot;{conflictPrompt.file.name}&quot;</strong> already exists in this folder.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={async () => {
                  const p = conflictPrompt;
                  setConflictPrompt(null);
                  // Upload as new version
                  await startFileUpload(p.file, p.existingId);
                }}
                className="w-full py-2 bg-[#4876F3] text-white text-xs font-semibold rounded-lg hover:bg-[#3b66df]"
              >
                Upload as new version
              </button>
              <button
                onClick={async () => {
                  const p = conflictPrompt;
                  setConflictPrompt(null);
                  // Keep both -> appends (1)
                  const parts = p.file.name.split(".");
                  const ext = parts.length > 1 ? "." + parts.pop() : "";
                  const base = parts.join(".");
                  const newName = `${base} (1)${ext}`;
                  await startFileUpload(p.file, undefined, newName);
                }}
                className="w-full py-2 bg-[#2E2F34] text-white text-xs font-semibold rounded-lg hover:bg-[#383a42]"
              >
                Keep both (adds &quot; (1)&quot;)
              </button>
              <button
                onClick={() => setConflictPrompt(null)}
                className="w-full py-1.5 text-xs text-[#9A9DA0] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans">
          <div className="w-full max-w-sm rounded-2xl bg-[#212121] border border-[#424344] p-6 shadow-2xl space-y-4">
            <h3 className="font-semibold text-base text-white">Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full rounded-lg bg-[#2E2F34] border border-[#424344] px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-[#9A9DA0] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => createFolderMutation.mutate(newFolderName)}
                disabled={!newFolderName.trim()}
                className="px-4 py-1.5 rounded-lg bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3b66df] disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans">
          <div className="w-full max-w-sm rounded-2xl bg-[#212121] border border-[#424344] p-6 shadow-2xl space-y-4">
            <h3 className="font-semibold text-base text-white">Rename</h3>
            <input
              type="text"
              value={renameItem.name}
              onChange={(e) => setRenameItem({ ...renameItem, name: e.target.value })}
              className="w-full rounded-lg bg-[#2E2F34] border border-[#424344] px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameItem(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs text-[#9A9DA0] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => renameMutation.mutate({ id: renameItem.id, name: renameItem.name })}
                className="px-4 py-1.5 rounded-lg bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3b66df]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Tray Floating Bottom Right */}
      <UploadTray
        uploads={uploads}
        onPause={(id) =>
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, status: "paused" } : u))
          )
        }
        onResume={(id) => {
          const item = uploads.find((u) => u.id === id);
          if (item && item.file) {
            setUploads((prev) =>
              prev.map((u) => (u.id === id ? { ...u, status: "uploading" } : u))
            );
            uploadFileParts(item, item.file);
          }
        }}
        onAttachFile={handleAttachFileAndResume}
        onCancel={(id) => {
          const item = uploads.find((u) => u.id === id);
          if (item && item.uploadId) {
            fetch(`/api/v1/uploads/${item.uploadId}`, { method: "DELETE" }).catch(() => {});
          }
          setUploads((prev) => prev.filter((u) => u.id !== id));
        }}
        onClearCompleted={() =>
          setUploads((prev) => prev.filter((u) => u.status !== "completed"))
        }
      />

      {/* Browser Direct Download Tray */}
      <DownloadTray
        session={downloadSession}
        onPause={() => {
          downloadPausedRef.current = true;
          setDownloadSession((prev) => (prev ? { ...prev, status: "paused" } : null));
        }}
        onResume={() => {
          downloadPausedRef.current = false;
          setDownloadSession((prev) => (prev ? { ...prev, status: "downloading" } : null));
        }}
        onCancel={() => {
          downloadCancelledRef.current = true;
          setDownloadSession((prev) => (prev ? { ...prev, status: "cancelled" } : null));
        }}
        onClose={() => setDownloadSession(null)}
      />
    </>
  );
}
