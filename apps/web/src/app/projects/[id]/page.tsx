"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { useContextMenu, MenuGroup } from "@/components/ui/menu";
import { UploadTray, UploadItem } from "@/components/uploads/upload-tray";
import {
  DownloadTray,
  DownloadSession,
  DownloadFile,
  startBrowserDownload,
} from "@/components/downloads/download-tray";
import { FileViewer, ViewerItem } from "@/components/files/file-viewer";
import { ShareModal } from "@/components/sharing/share-modal";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { NewSpreadsheetDialog } from "@/components/spreadsheets/new-spreadsheet-dialog";
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
  Trash2,
  Edit3,
  Move,
  ExternalLink,
  Loader2,
  PanelLeft,
  ChevronsUpDown,
  LayoutGrid,
  List,
  ArrowUpDown,
  Search,
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

  const { user, role, hasPermission } = useAuth();
  const { openContextMenu } = useContextMenu();
  const shouldReduceMotion = useReducedMotion();

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

  // Phase 2 Workspace Layout States
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(true);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [projectSwitcherQuery, setProjectSwitcherQuery] = useState("");
  const [cardSize, setCardSize] = useState<"compact" | "normal" | "large">("normal");
  const [searchInProject, setSearchInProject] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [shareLinksSort, setShareLinksSort] = useState<"newest" | "name">("newest");
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [showNewSheetModal, setShowNewSheetModal] = useState(false);

  // Inline folder creation state (per Part C spec: "New folder: appears in place with the name in edit mode; Enter saves, Escape cancels.")
  const [isCreatingInlineFolder, setIsCreatingInlineFolder] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState("New Folder");
  const inlineFolderInputRef = useRef<HTMLInputElement>(null);

  // Inline rename state
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [inlineRenameName, setInlineRenameName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Optimistic deleted items (for smooth slide-out and Undo toast)
  const [hiddenItemIds, setHiddenItemIds] = useState<string[]>([]);

  // Notification Bell state
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [projectNotifPref, setProjectNotifPref] = useState<string>("all");

  // Move Modal state
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
  const downloadPausedRef = useRef(false);
  const downloadCancelledRef = useRef(false);

  // Touch long-press ref
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // 4. Fetch Client Projects for switcher
  const { data: clientProjectsData } = useQuery({
    queryKey: ["client-projects", workspaceData?.project?.client_id],
    queryFn: () => apiRequest(`/projects?client_id=${workspaceData?.project?.client_id}`),
    enabled: !!workspaceData?.project?.client_id,
  });

  // 5. Fetch Project Members/Grants for member avatars button
  const { data: grantsData } = useQuery({
    queryKey: ["project-grants", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/grants`),
  });

  // 6. Fetch Spreadsheets (Tracker first)
  const { data: spreadsheetsData } = useQuery({
    queryKey: ["project-spreadsheets", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/spreadsheets`),
  });

  // 7. Fetch Documents for this project
  const { data: documentsData } = useQuery({
    queryKey: ["project-docs", projectId],
    queryFn: () => apiRequest(`/documents?project_id=${projectId}`),
  });

  // 8. Fetch Share Links for this project
  const { data: shareLinksData } = useQuery({
    queryKey: ["project-share-links", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/share-links`),
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
      toast.success("Notification preferences updated");
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
      setIsCreatingInlineFolder(false);
      toast.success("Folder created");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to create folder");
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
      setRenamingItemId(null);
      toast.success("Renamed successfully");
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
      toast.success("Item moved");
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
      toast.success(vars.isStarred ? "Removed from starred" : "Added to starred");
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
      toast.error(err.message || "Upload failed to start");
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
        if (diffTime > 0.4) {
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
          toast.success(`Uploaded "${item.filename}"`);
        } catch {
          setUploads((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, status: "error" } : u))
          );
          toast.error(`Failed to complete "${item.filename}"`);
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
            toast.success(`Uploaded "${item.filename}"`);
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
        toast.error("No downloadable files found");
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
      toast.error(err.message || "Failed to initiate download");
    }
  };

  const handleCopyProjectLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard.writeText(url);
    toast.success("Link copied. Only people with access can open it.");
  };

  // Inline folder creation trigger
  const triggerInlineNewFolder = () => {
    setInlineFolderName("New Folder");
    setIsCreatingInlineFolder(true);
    setTimeout(() => {
      inlineFolderInputRef.current?.focus();
      inlineFolderInputRef.current?.select();
    }, 50);
  };

  // Inline rename trigger
  const triggerInlineRename = (item: any) => {
    setRenamingItemId(item.id);
    setInlineRenameName(item.name);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 50);
  };

  // Delete with reverse animation & Undo toast per Part C spec
  const handleDeleteWithUndo = (item: any) => {
    setHiddenItemIds((prev) => [...prev, item.id]);
    let undone = false;

    toast.success(`"${item.name}" moved to trash`, {
      undoLabel: "Undo",
      duration: 5000,
      undo: () => {
        undone = true;
        setHiddenItemIds((prev) => prev.filter((id) => id !== item.id));
      },
    });

    setTimeout(() => {
      if (!undone) {
        deleteItemMutation.mutate(item.id);
      }
    }, 5200);
  };

  const handleBatchDeleteWithUndo = () => {
    const idsToDelete = [...selectedItemIds];
    setHiddenItemIds((prev) => [...prev, ...idsToDelete]);
    setSelectedItemIds([]);
    let undone = false;

    toast.success(`${idsToDelete.length} items moved to trash`, {
      undoLabel: "Undo",
      duration: 5000,
      undo: () => {
        undone = true;
        setHiddenItemIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      },
    });

    setTimeout(() => {
      if (!undone) {
        batchActionMutation.mutate({ action: "delete", ids: idsToDelete });
      }
    }, 5200);
  };

  // Context Menu Handlers
  const handleEmptyWorkspaceContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const groups: MenuGroup[] = [
      {
        items: [
          {
            label: "New folder",
            icon: <FolderPlus className="w-4 h-4 text-amber-400" />,
            onClick: triggerInlineNewFolder,
          },
          {
            label: "Upload files",
            icon: <Upload className="w-4 h-4 text-[#4876F3]" />,
            onClick: () => fileInputRef.current?.click(),
          },
          {
            label: "Upload folder",
            icon: <Folder className="w-4 h-4 text-amber-400" />,
            onClick: () => folderInputRef.current?.click(),
          },
        ],
      },
      {
        items: [
          {
            label: "New document",
            icon: <FileText className="w-4 h-4 text-blue-400" />,
            onClick: () => router.push("/documents"),
          },
          {
            label: "New spreadsheet",
            icon: <FileSpreadsheet className="w-4 h-4 text-emerald-400" />,
            onClick: () => router.push("/spreadsheets"),
          },
        ],
      },
    ];

    openContextMenu(e, groups);
  };

  const handleItemContextMenu = (
    e: React.MouseEvent | { clientX: number; clientY: number },
    item: any
  ) => {
    if ("preventDefault" in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const isFolder = item.kind === "folder";

    const groups: MenuGroup[] = [
      {
        items: [
          {
            label: "Open",
            icon: <ArrowRight className="w-4 h-4" />,
            onClick: () => {
              if (isFolder) {
                router.push(`/projects/${projectId}?folder=${item.id}`);
              } else {
                setActiveViewerItem(item);
              }
            },
          },
          {
            label: "Open in new tab",
            icon: <ExternalLink className="w-4 h-4" />,
            onClick: () => {
              if (isFolder) {
                window.open(`/projects/${projectId}?folder=${item.id}`, "_blank");
              } else {
                window.open(`/projects/${projectId}?item=${item.id}`, "_blank");
              }
            },
          },
        ],
      },
      {
        items: [
          {
            label: "Share",
            icon: <Share2 className="w-4 h-4 text-[#4876F3]" />,
            onClick: () => {
              setShareTargetItem({ id: item.id, name: item.name, type: "item" });
              setShowShareModal(true);
            },
          },
          {
            label: "Copy link",
            icon: <Copy className="w-4 h-4" />,
            onClick: () => {
              const url = `${window.location.origin}/projects/${projectId}?item=${item.id}`;
              navigator.clipboard.writeText(url);
              toast.success("Link copied to clipboard");
            },
          },
          ...(!isFolder && canDownload
            ? [
                {
                  label: "Download",
                  icon: <Download className="w-4 h-4" />,
                  onClick: () => {
                    setSelectedItemIds([item.id]);
                    handleStartDownload("zip");
                  },
                },
              ]
            : []),
        ],
      },
      {
        items: [
          {
            label: "Rename",
            icon: <Edit3 className="w-4 h-4" />,
            onClick: () => triggerInlineRename(item),
          },
          {
            label: "Move to",
            icon: <Move className="w-4 h-4" />,
            onClick: () => setMoveItem({ id: item.id, name: item.name }),
          },
          {
            label: item.is_starred ? "Unstar" : "Star",
            icon: <Star className="w-4 h-4 text-amber-400" />,
            onClick: () =>
              starMutation.mutate({ id: item.id, isStarred: Boolean(item.is_starred) }),
          },
        ],
      },
      {
        items: [
          {
            label: "Delete",
            icon: <Trash2 className="w-4 h-4" />,
            danger: true,
            onClick: () => handleDeleteWithUndo(item),
          },
        ],
      },
    ];

    openContextMenu(e, groups);
  };

  const handleSelectionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (selectedItemIds.length <= 1) return;

    const groups: MenuGroup[] = [
      {
        items: [
          {
            label: `Share (${selectedItemIds.length} items)`,
            icon: <Share2 className="w-4 h-4 text-[#4876F3]" />,
            onClick: () => {
              setShareTargetItem({ id: projectId, name: project.name, type: "project" });
              setShowShareModal(true);
            },
          },
          {
            label: "Copy link",
            icon: <Copy className="w-4 h-4" />,
            onClick: handleCopyProjectLink,
          },
          ...(canDownload
            ? [
                {
                  label: `Download (${selectedItemIds.length} items)`,
                  icon: <Download className="w-4 h-4" />,
                  onClick: () => handleStartDownload("zip"),
                },
              ]
            : []),
        ],
      },
      {
        items: [
          {
            label: "Move to",
            icon: <Move className="w-4 h-4" />,
            onClick: () => {
              const it = items.find((x: any) => x.id === selectedItemIds[0]);
              if (it) setMoveItem({ id: it.id, name: it.name });
            },
          },
        ],
      },
      {
        items: [
          {
            label: `Delete (${selectedItemIds.length} items)`,
            icon: <Trash2 className="w-4 h-4" />,
            danger: true,
            onClick: handleBatchDeleteWithUndo,
          },
        ],
      },
    ];

    openContextMenu(e, groups);
  };

  if (isLoading && !workspaceData) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0D0D0E]">
        <div className="flex items-center gap-2 text-xs text-[#9A9DA0]">
          <Loader2 className="w-4 h-4 animate-spin text-[#4876F3]" />
          <span>Loading project workspace...</span>
        </div>
      </div>
    );
  }

  if (error || !workspaceData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0D0D0E] text-white">
        <h2 className="text-lg font-bold">Project not found or access denied</h2>
        <Link href="/projects" className="mt-4 px-4 py-2 bg-[#4876F3] text-xs font-semibold rounded-xl">
          Back to Projects
        </Link>
      </div>
    );
  }

  const { project, user_access = "viewer" } = workspaceData;
  const rawItems = Array.isArray(workspaceData.items) ? workspaceData.items : [];
  const breadcrumbs = Array.isArray(workspaceData.breadcrumbs) ? workspaceData.breadcrumbs : [];
  const access = workspaceData.access || {};
  const userAccessLevel = access.level || user_access;
  const canDownload = access.can_download !== undefined ? Boolean(access.can_download) : true;
  const isReadOnlyOrCommenter =
    userAccessLevel === "viewer" || userAccessLevel === "commenter" || userAccessLevel === "uploader";
  const canUpload = userAccessLevel === "full" || userAccessLevel === "uploader";

  // Derived collections for Phase 2 project panel & switcher
  const membersList = Array.isArray(grantsData) ? grantsData : [];
  const spreadsheetsList = Array.isArray(spreadsheetsData?.spreadsheets)
    ? spreadsheetsData.spreadsheets
    : Array.isArray(spreadsheetsData)
    ? spreadsheetsData
    : [];
  const documentsList = Array.isArray(documentsData?.documents)
    ? documentsData.documents
    : Array.isArray(documentsData)
    ? documentsData
    : [];
  const shareLinksList = Array.isArray(shareLinksData?.links)
    ? shareLinksData.links
    : Array.isArray(shareLinksData)
    ? shareLinksData
    : [];

  const sortedShareLinks = [...shareLinksList].sort((a, b) => {
    if (shareLinksSort === "name") {
      return (a.name || "").localeCompare(b.name || "");
    }
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const trackerSheet =
    spreadsheetsList.find((s: any) => s.is_tracker || s.title?.toLowerCase() === "tracker") ||
    spreadsheetsList[0];
  const otherSpreadsheets = spreadsheetsList.filter((s: any) => s.id !== trackerSheet?.id);

  const clientProjects = (clientProjectsData?.projects || []).filter((p: any) => {
    if (!projectSwitcherQuery.trim()) return true;
    return p.name.toLowerCase().includes(projectSwitcherQuery.toLowerCase().trim());
  });

  // Filter items omitting optimistically deleted items and search query
  const items = rawItems
    .filter((i: any) => !hiddenItemIds.includes(i.id))
    .filter((i: any) => {
      if (!searchInProject.trim()) return true;
      return i.name.toLowerCase().includes(searchInProject.toLowerCase().trim());
    });
  const foldersList = items.filter((i: any) => i.kind === "folder");
  const filesList = items.filter((i: any) => i.kind !== "folder");

  // Selection calculations
  const selectedItems = items.filter((i: any) => selectedItemIds.includes(i.id));
  const selectedBytes = selectedItems.reduce((acc: number, cur: any) => acc + (cur.total_bytes || cur.latest_size_bytes || 0), 0);

  // Active uploads in this folder
  const activeUploadsHere = uploads.filter(
    (u) => (u.parentId || null) === currentFolderId && u.status === "uploading"
  );

  return (
    <div
      onContextMenu={handleEmptyWorkspaceContextMenu}
      className="flex flex-col h-screen w-full bg-[#181818] text-[#E1E1E3] font-sans antialiased overflow-hidden select-none"
    >
      {/* Hidden File & Folder Inputs */}
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
          TOP BAR (Height: 48px, Panel Toggle, Breadcrumbs, Right Search)
          ========================================================================= */}
      <div className="h-12 border-b border-[#2E2F34] bg-[#181818] px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center min-w-0">
          <button
            onClick={() => setIsProjectPanelOpen(!isProjectPanelOpen)}
            title={isProjectPanelOpen ? "Collapse project panel" : "Expand project panel"}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#9A9DA0] hover:bg-[#2A2B30] hover:text-white transition-colors mr-2 shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-[#2E2F34] mr-3 shrink-0" />

          {/* Breadcrumbs: All projects / {Client} / {Project} [/ {Folder}] */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs truncate">
            <Link
              href="/projects"
              className="text-[#9A9DA0] hover:text-white transition-colors shrink-0"
            >
              All projects
            </Link>
            <span className="text-[#7C7F87] shrink-0">/</span>
            {project.client_id ? (
              <Link
                href={`/clients/${project.client_id}`}
                className="text-[#9A9DA0] hover:text-white transition-colors truncate max-w-[140px]"
              >
                {project.client_name || "Client"}
              </Link>
            ) : (
              <span className="text-[#9A9DA0] truncate max-w-[140px]">
                {project.client_name || "Workspace"}
              </span>
            )}
            <span className="text-[#7C7F87] shrink-0">/</span>
            <Link
              href={`/projects/${projectId}`}
              className={`transition-colors truncate max-w-[160px] ${
                !currentFolderId && breadcrumbs.length === 0
                  ? "text-white font-semibold"
                  : "text-[#9A9DA0] hover:text-white"
              }`}
            >
              {project.name}
            </Link>
            {breadcrumbs.map((b: any, idx: number) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={b.id}>
                  <span className="text-[#7C7F87] shrink-0">/</span>
                  <Link
                    href={`/projects/${projectId}?folder=${b.id}`}
                    className={`truncate max-w-[140px] transition-colors ${
                      isLast ? "text-white font-semibold" : "text-[#9A9DA0] hover:text-white"
                    }`}
                  >
                    {b.name}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Search on the right */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] text-xs text-[#7C7F87] focus-within:border-[#4876F3] transition-colors w-44 sm:w-60">
            <Search className="w-3.5 h-3.5 text-[#7C7F87] shrink-0" />
            <input
              type="text"
              placeholder="Search in project..."
              value={searchInProject}
              onChange={(e) => setSearchInProject(e.target.value)}
              className="w-full bg-transparent text-white placeholder-[#7C7F87] focus:outline-none text-xs"
            />
            {searchInProject && (
              <button onClick={() => setSearchInProject("")} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* =========================================================================
            PROJECT PANEL (280px, Collapsible)
            ========================================================================= */}
        {isProjectPanelOpen && (
          <aside className="w-[280px] min-w-[280px] max-w-[280px] h-full border-r border-[#2E2F34] bg-[#212121] flex flex-col justify-between shrink-0 overflow-hidden select-none z-10">
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Project Switcher */}
              <div className="relative border-b border-[#2E2F34]">
                <button
                  type="button"
                  onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-[#2A2B30] transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-[8px] bg-[#4876F3]/20 text-[#4876F3] font-bold text-xs flex items-center justify-center shrink-0 uppercase border border-[#4876F3]/30">
                      {(project.client_name || project.name || "P").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate leading-tight">
                        {project.name}
                      </p>
                      <p className="text-[10px] text-[#9A9DA0] truncate leading-tight mt-0.5">
                        {project.client_name || "Workspace"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="rounded-full bg-[#2A2B30] border border-[#2E2F34] px-1.5 py-0.5 text-[10px] font-medium text-[#9A9DA0]">
                      {membersList.length || 1}
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-[#7C7F87]" />
                  </div>
                </button>

                {/* Project Switcher Dropdown */}
                {projectSwitcherOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setProjectSwitcherOpen(false)}
                    />
                    <div className="absolute left-2 right-2 top-14 z-40 rounded-xl border border-[#2E2F34] bg-[#212121] p-2 shadow-2xl space-y-2">
                      <div className="px-2 pt-1 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7C7F87]">
                          {project.client_name ? `${project.client_name}'s Projects` : "Client Projects"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 h-8 px-2 rounded-lg bg-[#2A2B30] border border-[#2E2F34] text-xs text-[#7C7F87]">
                        <Search className="w-3.5 h-3.5 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search projects..."
                          value={projectSwitcherQuery}
                          onChange={(e) => setProjectSwitcherQuery(e.target.value)}
                          className="w-full bg-transparent text-white placeholder-[#7C7F87] focus:outline-none text-xs"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5 pt-1">
                        {clientProjects.length === 0 ? (
                          <p className="text-xs text-[#7C7F87] px-2 py-2">No projects found</p>
                        ) : (
                          clientProjects.map((p: any) => {
                            const isCurrent = p.id === projectId;
                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setProjectSwitcherOpen(false);
                                  router.push(`/projects/${p.id}`);
                                }}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                  isCurrent
                                    ? "bg-[#4876F3] text-white font-semibold"
                                    : "text-[#9A9DA0] hover:bg-[#2A2B30] hover:text-white"
                                }`}
                              >
                                <span className="truncate">{p.name}</span>
                                {isCurrent && <Check className="w-3.5 h-3.5 shrink-0 ml-1.5" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Files Root & Folder Tree */}
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                  <span>Files</span>
                  {canUpload && (
                    <button
                      onClick={triggerInlineNewFolder}
                      title="New folder at root"
                      className="text-[#7C7F87] hover:text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Project Root (Files) */}
                <button
                  onClick={() => router.push(`/projects/${projectId}`)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs transition-colors ${
                    !currentFolderId
                      ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                      : "text-[#9A9DA0] hover:text-white hover:bg-[#2A2B30]/60"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Folder className="w-4 h-4 text-[#4876F3]" />
                    <span className="truncate">Files</span>
                  </div>
                  <span className="text-[10px] text-[#7C7F87] tabular-nums font-mono">
                    {project.file_count || 0}
                  </span>
                </button>

                {/* Folder tree */}
                {treeData?.folders?.map((f: any) => {
                  const isActive = currentFolderId === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => router.push(`/projects/${projectId}?folder=${f.id}`)}
                      className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-[10px] text-xs transition-colors ${
                        isActive
                          ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                          : "text-[#9A9DA0] hover:text-white hover:bg-[#2A2B30]/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder className={`w-3.5 h-3.5 ${isActive ? "text-[#4876F3]" : "text-[#7C7F87]"}`} />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <span className="text-[10px] text-[#7C7F87] tabular-nums font-mono">
                        {f.file_count || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Sheets and Docs (Tracker first) */}
              <div className="p-3 pt-2 space-y-1 border-t border-[#2E2F34]">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                  <span>Sheets and docs</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowNewSheetModal(true)}
                      title="New spreadsheet"
                      className="text-[#7C7F87] hover:text-emerald-400 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowNewDocModal(true)}
                      title="New document"
                      className="text-[#7C7F87] hover:text-blue-400 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tracker first */}
                {trackerSheet ? (
                  <button
                    onClick={() => router.push(`/spreadsheets/${trackerSheet.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#9A9DA0] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate font-medium">{trackerSheet.title || "Tracker"}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold uppercase">
                      Tracker
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowNewSheetModal(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] text-xs text-[#7C7F87] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">+ Create Tracker</span>
                  </button>
                )}

                {/* Other Spreadsheets */}
                {otherSpreadsheets.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/spreadsheets/${s.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#9A9DA0] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400/80 shrink-0" />
                      <span className="truncate">{s.title || "Untitled sheet"}</span>
                    </div>
                  </button>
                ))}

                {/* Project Documents */}
                {documentsList.map((d: any) => (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/documents/${d.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#9A9DA0] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="truncate">{d.title || "Untitled document"}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Share links section */}
              <div className="p-3 pt-2 space-y-1 border-t border-[#2E2F34]">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                  <span>Share links</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setShareLinksSort(shareLinksSort === "newest" ? "name" : "newest")
                      }
                      title={`Sort: ${shareLinksSort}`}
                      className="text-[#7C7F87] hover:text-white transition-colors"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                        setShowShareModal(true);
                      }}
                      title="New share link"
                      className="text-[#7C7F87] hover:text-[#4876F3] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="px-2 text-[10px] text-[#7C7F87]">
                  All share links ({sortedShareLinks.length})
                </p>

                <div className="space-y-0.5 pt-1">
                  {sortedShareLinks.length === 0 ? (
                    <p className="text-[11px] text-[#7C7F87] px-2 py-1 italic">No share links yet</p>
                  ) : (
                    sortedShareLinks.map((link: any) => (
                      <button
                        key={link.id}
                        onClick={() => {
                          setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                          setShowShareModal(true);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#9A9DA0] hover:bg-[#2A2B30]/60 hover:text-white transition-colors group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-4 h-4 rounded bg-[#2A2B30] border border-[#2E2F34] flex items-center justify-center shrink-0">
                            <Share2 className="w-2.5 h-2.5 text-[#4876F3]" />
                          </div>
                          <span className="truncate">{link.name || "Share link"}</span>
                        </div>
                        <span className="text-[10px] text-[#7C7F87] group-hover:text-white tabular-nums">
                          {link.view_count || 0} views
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Bottom: Recently deleted */}
            <div className="p-3 border-t border-[#2E2F34]">
              <Link
                href="/trash"
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-xs font-medium text-[#9A9DA0] hover:bg-[#2A2B30] hover:text-white transition-colors"
              >
                <Trash2 className="w-4 h-4 text-[#7C7F87]" />
                <span>Recently deleted</span>
              </Link>
            </div>
          </aside>
        )}

        {/* =========================================================================
            MAIN WORKSPACE AREA
            ========================================================================= */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#181818]">
          {/* Main Toolbar */}
          <div className="h-12 border-b border-[#2E2F34] bg-[#181818] px-6 flex items-center justify-between shrink-0 select-none">
            {/* Left Toolbar Controls */}
            <div className="flex items-center gap-3">
              {/* View Toggle (Grid / List) */}
              <div className="flex items-center rounded-[8px] bg-[#212121] border border-[#2E2F34] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  className={`p-1.5 rounded-[6px] transition-colors ${
                    viewMode === "grid" ? "bg-[#2A2B30] text-white" : "text-[#7C7F87] hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  title="List view"
                  className={`p-1.5 rounded-[6px] transition-colors ${
                    viewMode === "list" ? "bg-[#2A2B30] text-white" : "text-[#7C7F87] hover:text-white"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Card size selector */}
              {viewMode === "grid" && (
                <div className="hidden sm:flex items-center rounded-[8px] bg-[#212121] border border-[#2E2F34] p-0.5 text-[10px] font-bold">
                  {(["compact", "normal", "large"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCardSize(s)}
                      className={`px-2 py-1 rounded-[6px] transition-colors uppercase ${
                        cardSize === s ? "bg-[#2A2B30] text-white" : "text-[#7C7F87] hover:text-white"
                      }`}
                    >
                      {s === "compact" ? "S" : s === "normal" ? "M" : "L"}
                    </button>
                  ))}
                </div>
              )}

              <div className="h-4 w-[1px] bg-[#2E2F34]" />

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 text-xs text-[#9A9DA0]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#7C7F87]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-[#212121] border border-[#2E2F34] rounded-[8px] px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                >
                  <option value="name">Name</option>
                  <option value="modified">Date modified</option>
                  <option value="size">Size</option>
                </select>
              </div>

              <div className="h-4 w-[1px] bg-[#2E2F34]" />

              {/* + Menu Button */}
              {canUpload && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#4876F3] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${plusMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {plusMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setPlusMenuOpen(false)}
                      />
                      <div className="absolute left-0 top-9 z-40 w-48 rounded-xl border border-[#2E2F34] bg-[#212121] py-1 shadow-2xl">
                        <button
                          onClick={() => {
                            setPlusMenuOpen(false);
                            triggerInlineNewFolder();
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                        >
                          <FolderPlus className="w-4 h-4 text-amber-400" />
                          <span>New folder</span>
                        </button>
                        <button
                          onClick={() => {
                            setPlusMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                        >
                          <Upload className="w-4 h-4 text-[#4876F3]" />
                          <span>Upload files</span>
                        </button>
                        <button
                          onClick={() => {
                            setPlusMenuOpen(false);
                            folderInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                        >
                          <Folder className="w-4 h-4 text-amber-400" />
                          <span>Upload folder</span>
                        </button>
                        <div className="my-1 border-t border-[#2E2F34]" />
                        <button
                          onClick={() => {
                            setPlusMenuOpen(false);
                            setShowNewDocModal(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                        >
                          <FileText className="w-4 h-4 text-blue-400" />
                          <span>New document</span>
                        </button>
                        <button
                          onClick={() => {
                            setPlusMenuOpen(false);
                            setShowNewSheetModal(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span>New spreadsheet</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right Toolbar Controls */}
            <div className="flex items-center gap-3">
              {/* Member avatars button (opens Manage Access / Share modal) */}
              <button
                type="button"
                onClick={() => {
                  setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                  setShowShareModal(true);
                }}
                title="Manage project access"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#212121] hover:bg-[#2A2B30] border border-[#2E2F34] transition-colors"
              >
                <div className="flex -space-x-1.5 overflow-hidden">
                  {membersList.slice(0, 3).map((m: any, idx: number) => (
                    <div
                      key={m.id || idx}
                      className="inline-block h-5 w-5 rounded-full ring-2 ring-[#212121] bg-[#4876F3] text-[9px] font-bold text-white flex items-center justify-center uppercase shrink-0"
                    >
                      {(m.email || "U").slice(0, 1).toUpperCase()}
                    </div>
                  ))}
                </div>
                <span className="text-[11px] font-semibold text-[#9A9DA0]">
                  {membersList.length > 0 ? membersList.length : 1}
                </span>
              </button>

              {/* Share Button (#3B67E0) */}
              <button
                type="button"
                onClick={() => {
                  setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                  setShowShareModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-[#3B67E0] hover:bg-[#325AC8] text-xs font-semibold text-white transition-colors shadow"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>
          </div>

        {/* Main Content Area */}
        <div
          onContextMenu={selectedItemIds.length > 1 ? handleSelectionContextMenu : undefined}
          className="flex-1 overflow-y-auto p-8 space-y-8"
        >
          {/* Folders Section with 30ms Stagger per Part C */}
          {(foldersList.length > 0 || isCreatingInlineFolder) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9A9DA0]">
                <span>{foldersList.length + (isCreatingInlineFolder ? 1 : 0)} folders</span>
              </div>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={
                  shouldReduceMotion
                    ? {}
                    : {
                        hidden: { opacity: 0 },
                        visible: {
                          opacity: 1,
                          transition: { staggerChildren: 0.03 },
                        },
                      }
                }
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                <AnimatePresence mode="popLayout">
                  {/* Inline New Folder Input Card per Part C */}
                  {isCreatingInlineFolder && (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="rounded-2xl border border-[#4876F3] bg-[#4876F3]/10 p-4 shadow-lg flex flex-col justify-between"
                    >
                      <div className="h-28 w-full rounded-xl bg-[#121214] border border-[#27272A] flex items-center justify-center mb-3">
                        <Folder className="w-10 h-10 text-[#4876F3]" />
                      </div>

                      <div className="space-y-2">
                        <input
                          ref={inlineFolderInputRef}
                          type="text"
                          value={inlineFolderName}
                          onChange={(e) => setInlineFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (inlineFolderName.trim()) {
                                createFolderMutation.mutate(inlineFolderName.trim());
                              }
                            } else if (e.key === "Escape") {
                              setIsCreatingInlineFolder(false);
                            }
                          }}
                          onBlur={() => {
                            if (inlineFolderName.trim() && inlineFolderName !== "New Folder") {
                              createFolderMutation.mutate(inlineFolderName.trim());
                            } else {
                              setIsCreatingInlineFolder(false);
                            }
                          }}
                          className="w-full h-8 rounded-lg bg-[#2A2B30] border border-[#4876F3] px-2.5 text-xs text-white focus:outline-none"
                        />
                        <p className="text-[10px] text-[#9A9DA0]">
                          Press Enter to save · Esc to cancel
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Folder Cards */}
                  {foldersList.map((folder: any) => {
                    const isSelected = selectedItemIds.includes(folder.id);
                    const isRenaming = renamingItemId === folder.id;

                    return (
                      <motion.div
                        layout
                        key={folder.id}
                        variants={
                          shouldReduceMotion
                            ? {}
                            : {
                                hidden: { opacity: 0, scale: 0.98, y: 6 },
                                visible: {
                                  opacity: 1,
                                  scale: 1,
                                  y: 0,
                                  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                                },
                              }
                        }
                        exit={{
                          opacity: 0,
                          scale: 0.95,
                          y: -6,
                          transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                        }}
                        onDoubleClick={() => router.push(`/projects/${projectId}?folder=${folder.id}`)}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedItemIds(selectedItemIds.filter((id) => id !== folder.id));
                          } else {
                            setSelectedItemIds([...selectedItemIds, folder.id]);
                          }
                        }}
                        onContextMenu={(e) => handleItemContextMenu(e, folder)}
                        onTouchStart={(e) => {
                          const touch = e.touches[0];
                          touchTimerRef.current = setTimeout(() => {
                            handleItemContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, folder);
                          }, 500);
                        }}
                        onTouchEnd={() => {
                          if (touchTimerRef.current) {
                            clearTimeout(touchTimerRef.current);
                            touchTimerRef.current = null;
                          }
                        }}
                        className={`group relative rounded-2xl border transition-all cursor-pointer p-4 ${
                          isSelected
                            ? "bg-[#4876F3]/15 border-[#4876F3] shadow-md"
                            : "bg-[#18181A] border-[#27272A] hover:border-[#3F3F46]"
                        }`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="absolute top-4 left-4 rounded border-[#3F3F46] text-[#4876F3] focus:ring-0 z-10"
                        />

                        {/* Folder Silhouette */}
                        <div className="h-28 w-full rounded-xl bg-[#121214] border border-[#27272A] flex overflow-hidden mb-3">
                          <div className="w-2/3 h-full border-r border-[#27272A] flex items-center justify-center bg-[#151518]">
                            <Folder className="w-10 h-10 text-[#4876F3] opacity-80" />
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

                        {/* Folder Details & Inline Rename */}
                        <div className="flex items-center justify-between">
                          <div className="truncate pr-2 flex-1">
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={inlineRenameName}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setInlineRenameName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (inlineRenameName.trim()) {
                                      renameMutation.mutate({ id: folder.id, name: inlineRenameName.trim() });
                                    }
                                  } else if (e.key === "Escape") {
                                    setRenamingItemId(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (inlineRenameName.trim()) {
                                    renameMutation.mutate({ id: folder.id, name: inlineRenameName.trim() });
                                  } else {
                                    setRenamingItemId(null);
                                  }
                                }}
                                className="w-full h-7 rounded bg-[#2A2B30] border border-[#4876F3] px-2 text-xs text-white focus:outline-none"
                              />
                            ) : (
                              <>
                                <h3 className="text-xs font-semibold text-white truncate" title={folder.name}>
                                  {folder.name}
                                </h3>
                                <p className="text-[10px] text-[#9A9DA0] mt-0.5">
                                  {folder.file_count || 0} items · {formatBytes(folder.total_bytes || 0)}
                                </p>
                              </>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleItemContextMenu(e, folder);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#27272A] text-[#9A9DA0] hover:text-white transition-opacity shrink-0"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {/* Files & Active Uploads Section */}
          {(filesList.length > 0 || activeUploadsHere.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9A9DA0]">
                <span>{filesList.length} files</span>
              </div>

              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                <AnimatePresence mode="popLayout">
                  {/* Active Uploads in Grid with Progress Bar per Part C */}
                  {activeUploadsHere.map((upload) => (
                    <motion.div
                      layout
                      key={upload.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="rounded-2xl border border-[#4876F3]/50 bg-[#212121] p-4 flex flex-col justify-between shadow-lg relative overflow-hidden"
                    >
                      <div className="h-32 w-full rounded-xl bg-[#18181A] flex flex-col items-center justify-center gap-2 mb-3">
                        <Upload className="w-8 h-8 text-[#4876F3] animate-bounce" />
                        <span className="text-[11px] font-semibold text-[#4876F3]">
                          {upload.progressPercent}%
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="text-xs font-medium text-white truncate">
                          {upload.filename}
                        </h4>
                        <div className="w-full bg-[#2E2F34] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#4876F3] h-full transition-all duration-200"
                            style={{ width: `${upload.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {/* Completed Files */}
                  {filesList.map((file: any) => {
                    const isSelected = selectedItemIds.includes(file.id);
                    const isRenaming = renamingItemId === file.id;
                    const isVideo = file.name.endsWith(".mp4") || file.name.endsWith(".mov");
                    const isAudio = file.name.endsWith(".mp3") || file.name.endsWith(".wav");
                    const isSheet = file.name.endsWith(".xlsx") || file.name.endsWith(".csv");

                    return (
                      <motion.div
                        layout
                        key={file.id}
                        initial={{ opacity: 0, scale: 0.98, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          scale: 0.95,
                          y: -6,
                          transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                        }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onDoubleClick={() => setActiveViewerItem(file)}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedItemIds(selectedItemIds.filter((id) => id !== file.id));
                          } else {
                            setSelectedItemIds([...selectedItemIds, file.id]);
                          }
                        }}
                        onContextMenu={(e) => handleItemContextMenu(e, file)}
                        onTouchStart={(e) => {
                          const touch = e.touches[0];
                          touchTimerRef.current = setTimeout(() => {
                            handleItemContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, file);
                          }, 500);
                        }}
                        onTouchEnd={() => {
                          if (touchTimerRef.current) {
                            clearTimeout(touchTimerRef.current);
                            touchTimerRef.current = null;
                          }
                        }}
                        className={`group relative rounded-2xl border transition-all cursor-pointer p-4 flex flex-col justify-between ${
                          isSelected
                            ? "bg-[#4876F3]/15 border-[#4876F3] shadow-md"
                            : "bg-[#18181A] border-[#27272A] hover:border-[#3F3F46]"
                        }`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="absolute top-4 left-4 rounded border-[#3F3F46] text-[#4876F3] focus:ring-0 z-10"
                        />

                        {/* Preview Area */}
                        <div className="relative h-32 w-full rounded-xl bg-[#121214] border border-[#27272A] flex items-center justify-center overflow-hidden mb-3">
                          {isVideo ? (
                            <>
                              <div className="w-full h-full bg-gradient-to-tr from-[#16161D] to-[#201D2B] flex items-center justify-center">
                                <Film className="w-10 h-10 text-violet-400" />
                              </div>
                              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#4876F3] text-[10px] font-bold text-white uppercase">
                                v{file.latest_version_number || 1}
                              </span>
                              <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-mono text-white">
                                01:15
                              </span>
                              <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 text-[10px] text-white flex items-center gap-1.5 font-medium">
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
                              </div>
                              <span className="text-[9px] text-[#71717A]">PDF Preview</span>
                            </div>
                          )}
                        </div>

                        {/* File Details */}
                        <div>
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              type="text"
                              value={inlineRenameName}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setInlineRenameName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (inlineRenameName.trim()) {
                                    renameMutation.mutate({ id: file.id, name: inlineRenameName.trim() });
                                  }
                                } else if (e.key === "Escape") {
                                  setRenamingItemId(null);
                                }
                              }}
                              onBlur={() => {
                                if (inlineRenameName.trim()) {
                                  renameMutation.mutate({ id: file.id, name: inlineRenameName.trim() });
                                } else {
                                  setRenamingItemId(null);
                                }
                              }}
                              className="w-full h-7 rounded bg-[#2A2B30] border border-[#4876F3] px-2 text-xs text-white focus:outline-none"
                            />
                          ) : (
                            <>
                              <h3 className="text-xs font-semibold text-white truncate" title={file.name}>
                                {file.name}
                              </h3>
                              <p className="text-[10px] text-[#9A9DA0] mt-0.5">
                                {file.created_by_name || "Editor"} · Oct 14
                              </p>
                            </>
                          )}

                          <div className="mt-2.5 flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>Approved</span>
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleItemContextMenu(e, file);
                              }}
                              className="p-1 rounded-lg hover:bg-[#27272A] text-[#9A9DA0] hover:text-white"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {foldersList.length === 0 && filesList.length === 0 && !isCreatingInlineFolder && (
            <div className="py-20 text-center border border-dashed border-[#27272A] rounded-2xl">
              <Folder className="w-10 h-10 text-[#52525B] mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-white">This folder is empty</h3>
              <p className="text-xs text-[#9A9DA0] mt-1">
                Right-click anywhere to upload files or create subfolders.
              </p>
            </div>
          )}
        </div>

        {/* =========================================================================
            BOTTOM FLOATING SELECTION BAR
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
              <button
                onClick={() => handleStartDownload("zip")}
                className="flex items-center gap-1.5 text-[#9A9DA0] hover:text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
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

            {/* Delete */}
            <button
              onClick={handleBatchDeleteWithUndo}
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <div className="h-4 w-px bg-[#27272A]" />

            {/* Deselect */}
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

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        targetType={shareTargetItem.type}
        targetId={shareTargetItem.id}
        targetName={shareTargetItem.name}
        userAccessLevel={user_access}
        canCreatePublicLinks={!isReadOnlyOrCommenter}
      />

      {/* New Document Dialog inside this project */}
      <NewDocumentDialog
        isOpen={showNewDocModal}
        onClose={() => setShowNewDocModal(false)}
        defaultProjectId={projectId}
        onDocumentCreated={(newDoc) => {
          queryClient.invalidateQueries({ queryKey: ["project-docs", projectId] });
          if (newDoc?.id) router.push(`/documents/${newDoc.id}`);
        }}
      />

      {/* New Spreadsheet Dialog inside this project */}
      <NewSpreadsheetDialog
        isOpen={showNewSheetModal}
        onClose={() => setShowNewSheetModal(false)}
        defaultProjectId={projectId}
      />
    </div>
  );
}
