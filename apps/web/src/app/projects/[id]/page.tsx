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
import { ShareModal } from "@/components/sharing/share-modal";
import {
  Download,
  FolderDown,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Film,
  FileText,
  Music,
  Image as ImageIcon,
  MessageSquare,
  Star,
  Check,
  Copy,
  Share2,
  Bell,
  MoreHorizontal,
  X,
  Upload,
  Plus,
  Lock,
  ArrowRight,
  Shield,
  FileSpreadsheet,
} from "lucide-react";

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

  const { user, role } = useAuth();

  // Workspace UI states
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTargetItem, setShareTargetItem] = useState<{ id: string; name: string; type: "project" | "item" }>({
    id: projectId,
    name: "Project",
    type: "project",
  });
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [copyToast, setCopyToast] = useState(false);

  // Notification Bell state
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [projectNotifPref, setProjectNotifPref] = useState<string>("all");

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

  // Name conflict prompt state
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

  // 3. Fetch Project Notification Preference
  const { data: notifData } = useQuery({
    queryKey: ["project-notification", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/notifications`),
  });

  useEffect(() => {
    if (notifData?.preference) {
      setProjectNotifPref(notifData.preference);
    }
  }, [notifData]);

  const updateNotifMutation = useMutation({
    mutationFn: (pref: string) =>
      apiRequest(`/projects/${projectId}/notifications`, {
        method: "PUT",
        body: JSON.stringify({ preference: pref }),
      }),
    onSuccess: (_, pref) => {
      setProjectNotifPref(pref);
      setShowBellDropdown(false);
      queryClient.invalidateQueries({ queryKey: ["project-notification", projectId] });
    },
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

  const starMutation = useMutation({
    mutationFn: ({ id, isStarred }: { id: string; isStarred: boolean }) =>
      apiRequest(`/items/${id}/star`, {
        method: isStarred ? "DELETE" : "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
    },
  });

  // Fast Parallel Resumable Upload Engine
  const startFileUpload = async (file: File, targetItemId?: string, customName?: string) => {
    const filename = customName || file.name;
    const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    try {
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
        filename,
        sizeBytes: file.size,
        mime: file.type || "application/octet-stream",
        storageKey: initRes.storage_key || "",
        partSizeBytes: initRes.part_size_bytes || 5 * 1024 * 1024,
        totalParts: 1,
        parts: [],
        completedParts: [],
        progressPercent: 0,
        speedBytesPerSec: 0,
        status: "uploading",
        file,
      };

      setUploads((prev) => [newUpload, ...prev]);

      if (initRes.strategy === "single") {
        await executeSingleUpload(newUpload, initRes.upload_url, file);
      } else {
        await executeMultipartUpload(newUpload, initRes.part_size_bytes, initRes.upload_id, file);
      }
    } catch (err: any) {
      if (err.status === 409 && err.data?.existing_item_id) {
        setConflictPrompt({
          file,
          existingId: err.data.existing_item_id,
          existingName: filename,
        });
      } else {
        alert(err.message || "Upload failed to start");
      }
    }
  };

  const executeSingleUpload = async (item: UploadItem, putUrl: string, file: File) => {
    const xhr = new XMLHttpRequest();

    let lastLoaded = 0;
    let lastTime = Date.now();

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const now = Date.now();
        const diffTime = (now - lastTime) / 1000;
        if (diffTime > 0.5) {
          const diffBytes = evt.loaded - lastLoaded;
          const speed = diffBytes / diffTime;
          lastLoaded = evt.loaded;
          lastTime = now;

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? {
                    ...u,
                    uploadedBytes: evt.loaded,
                    progressPercent: Math.round((evt.loaded / evt.total) * 100),
                    speedBytesPerSec: speed,
                  }
                : u
            )
          );
        }
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          await apiRequest("/uploads/complete", {
            method: "POST",
            body: JSON.stringify({
              upload_id: item.uploadId,
              item_id: item.itemId,
            }),
          });

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? { ...u, status: "completed", progressPercent: 100, speedBytesPerSec: 0 }
                : u
            )
          );
          queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
        } catch {
          setUploads((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
          );
        }
      } else {
        setUploads((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
        );
      }
    };

    xhr.onerror = () => {
      setUploads((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
      );
    };

    xhr.open("PUT", putUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  };

  const executeMultipartUpload = async (
    item: UploadItem,
    partSizeBytes: number,
    uploadId: string,
    file: File
  ) => {
    const totalParts = Math.ceil(file.size / partSizeBytes);
    const completedParts: { part_number: number; etag: string }[] = [];
    const concurrency = 3;
    let nextPartIndex = 0;
    let activeWorkers = 0;
    let loadedBytes = 0;

    return new Promise<void>((resolve) => {
      const runWorker = async () => {
        while (nextPartIndex < totalParts) {
          const currentPart = nextPartIndex + 1;
          nextPartIndex++;

          try {
            const presignRes = await apiRequest("/uploads/presign-part", {
              method: "POST",
              body: JSON.stringify({
                upload_id: uploadId,
                part_number: currentPart,
              }),
            });

            const startByte = (currentPart - 1) * partSizeBytes;
            const endByte = Math.min(startByte + partSizeBytes, file.size);
            const chunk = file.slice(startByte, endByte);

            const putRes = await fetch(presignRes.upload_url, {
              method: "PUT",
              body: chunk,
            });

            if (!putRes.ok) throw new Error("Chunk put failed");
            const etag = putRes.headers.get("ETag") || `part-${currentPart}`;

            completedParts.push({
              part_number: currentPart,
              etag: etag.replace(/"/g, ""),
            });

            loadedBytes += chunk.size;
            setUploads((prev) =>
              prev.map((u) =>
                u.id === item.id
                  ? {
                      ...u,
                      uploadedBytes: loadedBytes,
                      progressPercent: Math.round((loadedBytes / file.size) * 100),
                    }
                  : u
              )
            );
          } catch {
            setUploads((prev) =>
              prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
            );
            return;
          }
        }

        activeWorkers--;
        if (activeWorkers === 0) {
          try {
            completedParts.sort((a, b) => a.part_number - b.part_number);
            await apiRequest("/uploads/complete", {
              method: "POST",
              body: JSON.stringify({
                upload_id: uploadId,
                item_id: item.itemId,
                parts: completedParts,
              }),
            });

            setUploads((prev) =>
              prev.map((u) =>
                u.id === item.id
                  ? { ...u, status: "completed", progressPercent: 100, speedBytesPerSec: 0 }
                  : u
              )
            );
            queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
          } catch {
            setUploads((prev) =>
              prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
            );
          }
          resolve();
        }
      };

      for (let w = 0; w < concurrency && w < totalParts; w++) {
        activeWorkers++;
        runWorker();
      }
    });
  };

  const handleStartDownload = async (mode: "zip" | "folder") => {
    if (selectedItemIds.length === 0) return;

    try {
      const manifestRes = await apiRequest("/downloads/manifest", {
        method: "POST",
        body: JSON.stringify({ item_ids: selectedItemIds }),
      });

      if (!manifestRes.files || manifestRes.files.length === 0) {
        alert("No downloadable files found");
        return;
      }

      const files: DownloadFile[] = manifestRes.files.map((f: any) => ({
        id: f.item_id,
        name: f.filename,
        path: f.path || f.filename,
        size_bytes: f.size_bytes,
        mime: f.mime,
        download_url: f.download_url,
      }));

      const progressFiles = files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        sizeBytes: f.size_bytes,
        downloadedBytes: 0,
        status: "pending" as const,
      }));

      const newSession: DownloadSession = {
        id: Math.random().toString(36).substring(2),
        name: manifestRes.suggested_zip_name || "download.zip",
        totalBytes: manifestRes.total_bytes,
        downloadedBytes: 0,
        speedBytesPerSec: 0,
        status: "downloading",
        files: progressFiles,
        mode,
      };

      setDownloadSession(newSession);
      downloadPausedRef.current = false;
      downloadCancelledRef.current = false;

      await startBrowserDownload({
        manifest: { files, total_bytes: manifestRes.total_bytes },
        mode,
        onProgress: (partial) => {
          setDownloadSession((prev) => (prev ? { ...prev, ...partial } : null));
        },
        isPausedRef: downloadPausedRef,
        isCancelledRef: downloadCancelledRef,
      });
    } catch (err: any) {
      alert(err.message || "Failed to initiate download");
    }
  };

  const handleCopyProjectLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard.writeText(url);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 3000);
  };

  if (isLoading && !workspaceData) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0E0E0F]">
        <div className="text-xs text-[#9A9DA0]">Loading project workspace...</div>
      </div>
    );
  }

  if (error || !workspaceData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0E0E0F] text-white">
        <h2 className="text-lg font-bold">Project not found or access denied</h2>
        <Link href="/projects" className="mt-4 px-4 py-2 bg-[#3366FF] text-xs rounded-xl">
          Back to Projects
        </Link>
      </div>
    );
  }

  const { project, user_access = "viewer" } = workspaceData;
  const items = Array.isArray(workspaceData.items) ? workspaceData.items : [];
  const breadcrumbs = Array.isArray(workspaceData.breadcrumbs) ? workspaceData.breadcrumbs : [];
  const access = workspaceData.access || {};
  const userAccessLevel = access.level || user_access;
  const canDownload = access.can_download !== undefined ? Boolean(access.can_download) : true;
  const isReadOnlyOrCommenter =
    userAccessLevel === "viewer" || userAccessLevel === "commenter" || userAccessLevel === "uploader";
  const canUpload = userAccessLevel === "full" || userAccessLevel === "uploader";

  // Filter items
  const foldersList = items.filter((i: any) => i.kind === "folder");
  const filesList = items.filter((i: any) => i.kind !== "folder");

  // Selection calculations
  const selectedItems = items.filter((i: any) => selectedItemIds.includes(i.id));
  const selectedBytes = selectedItems.reduce((acc: number, cur: any) => acc + (cur.total_bytes || cur.latest_size_bytes || 0), 0);

  return (
    <div className="flex h-screen bg-[#0D0D0E] text-[#E1E1E3] font-sans antialiased overflow-hidden select-none">
      {/* Toast Notification */}
      {copyToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#18181A] border border-[#27272A] text-white px-4 py-2 rounded-xl text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Link copied. Only people with access can open it.</span>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach((f) => startFileUpload(f));
          }
        }}
      />
      <input
        type="file"
        ref={folderInputRef}
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach((f) => startFileUpload(f));
          }
        }}
      />

      {/* =========================================================================
          LEFT SECONDARY TREE PANE (Design: 01-project-folder-view.png)
          ========================================================================= */}
      <div className="w-64 border-r border-[#212124] bg-[#121214] flex flex-col justify-between shrink-0">
        <div className="flex flex-col overflow-y-auto">
          {/* Project Dropdown Header */}
          <div className="p-4 border-b border-[#212124] flex items-center justify-between cursor-pointer hover:bg-[#18181A]/50 transition-colors">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-7 h-7 rounded-lg bg-[#3366FF] text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                {project.name.substring(0, 2)}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-white truncate">{project.name}</p>
                <p className="text-[10px] text-[#9A9DA0] truncate">{project.client_name || "Workspace"}</p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-[#9A9DA0] shrink-0" />
          </div>

          {/* Files Tree */}
          <div className="p-3 space-y-1">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
              Files
            </p>

            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors ${
                !currentFolderId ? "bg-[#27272A] text-white font-semibold" : "text-[#9A9DA0] hover:text-white hover:bg-[#18181A]"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Folder className="w-4 h-4 text-[#3366FF]" />
                <span className="truncate">{project.name}</span>
              </div>
              <span className="text-[10px] text-[#71717A]">{project.file_count || 0}</span>
            </button>

            {/* Folder list in tree */}
            {treeData?.folders?.map((f: any) => {
              const isActive = currentFolderId === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => router.push(`/projects/${projectId}?folder=${f.id}`)}
                  className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-xl text-xs transition-colors ${
                    isActive ? "bg-[#27272A] text-white font-semibold" : "text-[#9A9DA0] hover:text-white hover:bg-[#18181A]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className={`w-3.5 h-3.5 ${isActive ? "text-[#3366FF]" : "text-[#71717A]"}`} />
                    <span className="truncate">{f.name}</span>
                  </div>
                  <span className="text-[10px] text-[#71717A]">{f.file_count || 0}</span>
                </button>
              );
            })}
          </div>

          {/* Sheets and Docs section */}
          <div className="p-3 pt-2 space-y-1 border-t border-[#212124]">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
              Sheets and Docs
            </p>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#9A9DA0] hover:bg-[#18181A] hover:text-white cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Project Tracker</span>
            </div>
          </div>
        </div>

        {/* Bottom User / Quick Links */}
        <div className="p-3 border-t border-[#212124] space-y-2">
          <Link
            href="/trash"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-[#9A9DA0] hover:bg-[#18181A] hover:text-white transition-colors"
          >
            <span>Recently deleted</span>
          </Link>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE AREA
          ========================================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0D0D0E]">
        {/* Top Breadcrumb & User Bar */}
        <div className="h-14 border-b border-[#212124] px-8 flex items-center justify-between bg-[#121214]/40 backdrop-blur-md">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-[#9A9DA0]">
            <Link href="/clients" className="hover:text-white">Clients</Link>
            <span>/</span>
            <span className="hover:text-white">{project.client_name || "Workspace"}</span>
            <span>/</span>
            <Link href={`/projects/${projectId}`} className="hover:text-white">{project.name}</Link>
            {breadcrumbs.map((b: any) => (
              <React.Fragment key={b.id}>
                <span>/</span>
                <Link href={`/projects/${projectId}?folder=${b.id}`} className="text-white font-medium">
                  {b.name}
                </Link>
              </React.Fragment>
            ))}
          </div>

          {/* User profile avatar top right */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-xs uppercase">
              {user?.name?.charAt(0) || "H"}
            </div>
          </div>
        </div>

        {/* Page Title & Actions Row */}
        <div className="px-8 py-5 border-b border-[#212124] flex items-center justify-between bg-[#0D0D0E]">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : project.name}
            </h1>
            <p className="text-xs text-[#9A9DA0] mt-1">
              {project.file_count || 0} files · {project.folder_count || 0} folders · {project.video_count || 0} videos · {formatBytes(project.total_bytes || 0)}
            </p>
          </div>

          {/* Right Header Buttons */}
          <div className="flex items-center gap-3">
            {/* Collaborator Avatars (Design: R, K, J, +4) */}
            <div className="flex items-center -space-x-1.5 mr-1">
              <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-[#0D0D0E]">
                R
              </div>
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-[#0D0D0E]">
                K
              </div>
              <div className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-[#0D0D0E]">
                J
              </div>
              <div className="w-7 h-7 rounded-full bg-[#27272A] text-[#9A9DA0] flex items-center justify-center text-[10px] font-medium ring-2 ring-[#0D0D0E]">
                +4
              </div>
            </div>

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowBellDropdown(!showBellDropdown)}
                className={`p-2 rounded-xl border border-[#27272A] transition-colors ${
                  projectNotifPref !== "off" ? "text-white bg-[#18181A]" : "text-[#71717A] bg-[#121214]"
                }`}
                title="Project Notification Settings"
              >
                <Bell className="w-4 h-4" />
              </button>

              {showBellDropdown && (
                <div className="absolute right-0 top-11 z-40 w-56 rounded-xl border border-[#27272A] bg-[#18181A] p-1.5 shadow-2xl text-xs space-y-1">
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                    Project Notifications
                  </p>
                  {[
                    { id: "all", label: "All activity" },
                    { id: "mentions", label: "Only mentions & my files" },
                    { id: "off", label: "Off" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => updateNotifMutation.mutate(opt.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                        projectNotifPref === opt.id ? "bg-[#3366FF] text-white" : "text-[#9A9DA0] hover:bg-[#27272A] hover:text-white"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {projectNotifPref === opt.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Copy Link Button (User Rule 6) */}
            <button
              onClick={handleCopyProjectLink}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#27272A] bg-[#18181A] hover:bg-[#27272A] text-xs font-medium text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy link</span>
            </button>

            {/* Share or Request Access Button (User Rule 2) */}
            {isReadOnlyOrCommenter ? (
              <button
                onClick={() => {
                  setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                  setShowShareModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#27272A] hover:bg-[#323236] text-xs font-semibold text-white transition-all shadow"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Request access</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                  setShowShareModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3366FF] hover:bg-[#2554DB] text-xs font-semibold text-white transition-all shadow"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Row / Filter Pills */}
        <div className="px-8 py-3.5 border-b border-[#212124] flex items-center justify-between bg-[#121214]/30">
          <div className="flex items-center gap-3">
            {canUpload && (
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3366FF] hover:bg-[#2554DB] text-xs font-semibold text-white transition-colors shadow">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                </button>
                <div className="absolute left-0 top-10 z-30 hidden group-hover:block rounded-xl border border-[#27272A] bg-[#18181A] py-1 shadow-2xl w-40">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#27272A]"
                  >
                    <FileText className="w-4 h-4 text-[#3366FF]" />
                    <span>Upload Files</span>
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#27272A]"
                  >
                    <Folder className="w-4 h-4 text-amber-400" />
                    <span>Upload Folder</span>
                  </button>
                </div>
              </div>
            )}

            {canUpload && (
              <button
                onClick={() => setShowNewFolderModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#27272A] bg-[#18181A] hover:bg-[#27272A] text-xs font-medium text-white transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New folder</span>
              </button>
            )}

            {/* Type Filter Pills */}
            <div className="flex items-center gap-1 bg-[#18181A] p-1 rounded-xl border border-[#27272A] text-xs ml-2">
              {["all", "videos", "audio", "images", "documents", "other"].map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-3 py-1 rounded-lg capitalize font-medium transition-colors ${
                    typeFilter === f ? "bg-[#27272A] text-white" : "text-[#71717A] hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Right Side: Sort & View Toggle */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#18181A] border border-[#27272A] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="modified">Modified</option>
              <option value="size">Size</option>
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Folders Section */}
          {foldersList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9A9DA0]">
                <span>{foldersList.length} {foldersList.length === 1 ? "folder" : "folders"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {foldersList.map((folder: any) => {
                  const isSelected = selectedItemIds.includes(folder.id);

                  return (
                    <div
                      key={folder.id}
                      onDoubleClick={() => router.push(`/projects/${projectId}?folder=${folder.id}`)}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedItemIds(selectedItemIds.filter((id) => id !== folder.id));
                        } else {
                          setSelectedItemIds([...selectedItemIds, folder.id]);
                        }
                      }}
                      className={`group relative rounded-2xl border transition-all cursor-pointer p-4 ${
                        isSelected
                          ? "bg-[#3366FF]/10 border-[#3366FF]"
                          : "bg-[#18181A] border-[#27272A] hover:border-[#3F3F46]"
                      }`}
                    >
                      {/* Checkbox Top Left */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="absolute top-4 left-4 rounded border-[#3F3F46] text-[#3366FF] focus:ring-0 z-10"
                      />

                      {/* Folder tab silhouette & previews */}
                      <div className="h-28 w-full rounded-xl bg-[#121214] border border-[#27272A] flex overflow-hidden mb-3">
                        <div className="w-2/3 h-full border-r border-[#27272A] flex items-center justify-center bg-[#151518]">
                          <Folder className="w-10 h-10 text-[#3366FF] opacity-80" />
                        </div>
                        <div className="w-1/3 h-full flex flex-col">
                          <div className="h-1/2 border-b border-[#27272A] flex items-center justify-center bg-[#18181C]">
                            <Folder className="w-5 h-5 text-[#52525B]" />
                          </div>
                          <div className="h-1/2 flex items-center justify-center bg-[#18181C]">
                            <Folder className="w-5 h-5 text-[#52525B]" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="truncate pr-2">
                          <h3 className="text-xs font-semibold text-white truncate" title={folder.name}>
                            {folder.name}
                          </h3>
                          <p className="text-[10px] text-[#9A9DA0] mt-0.5">
                            {folder.file_count || 0} items · {formatBytes(folder.total_bytes || 0)}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameItem({ id: folder.id, name: folder.name });
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#27272A] text-[#9A9DA0] hover:text-white transition-opacity"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Files Section */}
          {filesList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9A9DA0]">
                <span>{filesList.length} {filesList.length === 1 ? "file" : "files"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filesList.map((file: any) => {
                  const isSelected = selectedItemIds.includes(file.id);
                  const isVideo = file.name.endsWith(".mp4") || file.name.endsWith(".mov");
                  const isAudio = file.name.endsWith(".mp3") || file.name.endsWith(".wav");
                  const isSheet = file.name.endsWith(".xlsx") || file.name.endsWith(".csv");

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
                      className={`group relative rounded-2xl border transition-all cursor-pointer p-4 flex flex-col justify-between ${
                        isSelected
                          ? "bg-[#3366FF]/10 border-[#3366FF]"
                          : "bg-[#18181A] border-[#27272A] hover:border-[#3F3F46]"
                      }`}
                    >
                      {/* Checkbox Top Left */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="absolute top-4 left-4 rounded border-[#3F3F46] text-[#3366FF] focus:ring-0 z-10"
                      />

                      {/* Card Preview Area */}
                      <div className="relative h-32 w-full rounded-xl bg-[#121214] border border-[#27272A] flex items-center justify-center overflow-hidden mb-3">
                        {isVideo ? (
                          <>
                            <div className="w-full h-full bg-gradient-to-tr from-[#16161D] to-[#201D2B] flex items-center justify-center">
                              <Film className="w-10 h-10 text-violet-400" />
                            </div>
                            {/* Version Tag */}
                            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#3366FF] text-[10px] font-bold text-white uppercase">
                              v{file.latest_version_number || 1}
                            </span>
                            {/* Duration Pill */}
                            <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] font-mono text-white">
                              01:15
                            </span>
                            {/* Comment Counter (Lucide MessageSquare SVG icon - NO EMOJI!) */}
                            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] text-white flex items-center gap-1.5 font-medium">
                              <MessageSquare className="w-3 h-3 text-zinc-300" />
                              <span>5</span>
                            </div>
                          </>
                        ) : isSheet ? (
                          <div className="w-full h-full bg-[#131E18] flex flex-col justify-between p-3">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">SHEET</span>
                            <div className="space-y-1">
                              <div className="h-1.5 w-full bg-emerald-500/20 rounded" />
                              <div className="h-1.5 w-2/3 bg-emerald-500/10 rounded" />
                            </div>
                            <span className="text-[9px] text-emerald-400 font-mono">Tracker | Summary</span>
                          </div>
                        ) : (
                          <div className="w-full h-full bg-[#141722] flex flex-col justify-between p-3">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">DOC</span>
                            <div className="space-y-1.5">
                              <div className="h-1.5 w-full bg-blue-500/20 rounded" />
                              <div className="h-1.5 w-4/5 bg-blue-500/10 rounded" />
                              <div className="h-1.5 w-1/2 bg-blue-500/10 rounded" />
                            </div>
                            <span className="text-[9px] text-[#71717A]">PDF Preview</span>
                          </div>
                        )}
                      </div>

                      {/* File Details */}
                      <div>
                        <h3 className="text-xs font-semibold text-white truncate" title={file.name}>
                          {file.name}
                        </h3>
                        <p className="text-[10px] text-[#9A9DA0] mt-0.5">
                          {file.created_by_name || "Editor"} · Oct 14
                        </p>

                        {/* Status Tag Pill */}
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Approved</span>
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameItem({ id: file.id, name: file.name });
                            }}
                            className="p-1 rounded-lg hover:bg-[#27272A] text-[#9A9DA0] hover:text-white"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {foldersList.length === 0 && filesList.length === 0 && (
            <div className="py-20 text-center border border-dashed border-[#27272A] rounded-2xl">
              <Folder className="w-10 h-10 text-[#52525B] mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-white">This folder is empty</h3>
              <p className="text-xs text-[#9A9DA0] mt-1">
                Upload files or create subfolders using the buttons above.
              </p>
            </div>
          )}
        </div>

        {/* =========================================================================
            BOTTOM FLOATING SELECTION BAR (Design: 01-project-folder-view.png)
            ========================================================================= */}
        {selectedItemIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#18181A] border border-[#27272A] px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-5 text-xs font-medium text-white z-40 animate-in fade-in slide-in-from-bottom-3">
            <span className="font-semibold text-zinc-300">
              {selectedItemIds.length} selected · {formatBytes(selectedBytes)}
            </span>

            <div className="h-4 w-px bg-[#27272A]" />

            {/* Share */}
            <button
              onClick={() => {
                if (selectedItemIds.length === 1) {
                  const it = items.find((x: any) => x.id === selectedItemIds[0]);
                  setShareTargetItem({ id: it.id, name: it.name, type: "item" });
                } else {
                  setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                }
                setShowShareModal(true);
              }}
              className="flex items-center gap-1.5 text-[#9A9DA0] hover:text-white transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            {/* Copy Link */}
            <button
              onClick={handleCopyProjectLink}
              className="flex items-center gap-1.5 text-[#9A9DA0] hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy link</span>
            </button>

            {/* Download */}
            {canDownload && (
              <div className="relative">
                <button
                  onClick={() => handleStartDownload("zip")}
                  className="flex items-center gap-1.5 text-[#9A9DA0] hover:text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            )}

            {/* Move to */}
            <button
              onClick={() => {
                const it = items.find((x: any) => x.id === selectedItemIds[0]);
                if (it) setMoveItem({ id: it.id, name: it.name });
              }}
              className="flex items-center gap-1.5 text-[#9A9DA0] hover:text-white transition-colors"
            >
              <Folder className="w-3.5 h-3.5" />
              <span>Move to</span>
            </button>

            <div className="h-4 w-px bg-[#27272A]" />

            {/* Close / Deselect */}
            <button
              onClick={() => setSelectedItemIds([])}
              className="text-[#9A9DA0] hover:text-white transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Upload Tray */}
      <UploadTray
        uploads={uploads}
        onPause={(id) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, status: "paused" } : u))
          );
        }}
        onResume={(id) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, status: "uploading" } : u))
          );
        }}
        onCancel={(id) => {
          setUploads((prev) => prev.filter((u) => u.id !== id));
        }}
        onClearCompleted={() => {
          setUploads((prev) => prev.filter((u) => u.status !== "completed"));
        }}
      />

      {/* Download Tray */}
      {downloadSession && (
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
      )}

      {/* File Viewer Modal */}
      {activeViewerItem && (
        <FileViewer
          item={activeViewerItem}
          itemsList={filesList.map((f: any) => ({
            id: f.id,
            name: f.name,
            kind: f.kind,
            mime: f.latest_mime || "application/octet-stream",
            size_bytes: f.latest_size_bytes || 0,
            version_number: f.latest_version_number || 1,
            created_at: f.created_at,
            created_by_name: f.created_by_name,
            storage_key: f.latest_storage_key,
            is_video: f.name.endsWith(".mp4") || f.name.endsWith(".mov"),
          }))}
          canDownload={canDownload}
          onClose={() => setActiveViewerItem(null)}
          onSelectNext={() => {}}
          onSelectPrev={() => {}}
        />
      )}

      {/* Share Modal (People + Public Link tabs) */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        targetType={shareTargetItem.type}
        targetId={shareTargetItem.id}
        targetName={shareTargetItem.name}
        userAccessLevel={user_access}
        canCreatePublicLinks={!isReadOnlyOrCommenter}
      />

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName.trim()) createFolderMutation.mutate(newFolderName);
            }}
            className="w-full max-w-sm bg-[#18181A] border border-[#27272A] rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-semibold text-white">Create New Folder</h3>
            <input
              type="text"
              required
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              className="w-full bg-[#121214] border border-[#27272A] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#3366FF]"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3 py-2 bg-transparent hover:bg-[#27272A] text-xs text-[#9A9DA0] hover:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createFolderMutation.isPending || !newFolderName.trim()}
                className="px-4 py-2 bg-[#3366FF] hover:bg-[#2554DB] text-white text-xs font-medium rounded-xl"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renameItem.name.trim()) renameMutation.mutate(renameItem);
            }}
            className="w-full max-w-sm bg-[#18181A] border border-[#27272A] rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-semibold text-white">Rename</h3>
            <input
              type="text"
              required
              value={renameItem.name}
              onChange={(e) => setRenameItem({ ...renameItem, name: e.target.value })}
              autoFocus
              className="w-full bg-[#121214] border border-[#27272A] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#3366FF]"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameItem(null)}
                className="px-3 py-2 bg-transparent hover:bg-[#27272A] text-xs text-[#9A9DA0] hover:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renameMutation.isPending || !renameItem.name.trim()}
                className="px-4 py-2 bg-[#3366FF] hover:bg-[#2554DB] text-white text-xs font-medium rounded-xl"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
