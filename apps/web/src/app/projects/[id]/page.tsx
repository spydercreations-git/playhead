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
import { FolderCard } from "@/components/cards/folder-card";
import { SectionHeader } from "@/components/layout/section-header";
import { SelectionBar } from "@/components/layout/selection-bar";
import { DeleteDialog } from "@/components/dialogs/delete-dialog";
import { MoveCopyPanel } from "@/components/panels/move-copy-panel";
import { ManageAccessDialog } from "@/components/access/manage-access-dialog";
import { buildUnifiedItemMenuGroups } from "@/components/items/unified-item-menu";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  DraggableItem,
  DroppableTarget,
  WorkspaceDragGhost,
  WorkspaceDragData,
  WorkspaceDropData,
} from "@/components/dnd/workspace-dnd";
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
} from "@/components/ui/icon";

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

  // Inline folder creation state (per spec: "New folder: appears instantly as 'untitled folder' with the name selected inside a #4876F3 outlined input")
  const [isCreatingInlineFolder, setIsCreatingInlineFolder] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState("untitled folder");
  const inlineFolderInputRef = useRef<HTMLInputElement>(null);

  // Group section collapse states
  const [isFoldersCollapsed, setIsFoldersCollapsed] = useState(false);
  const [isFilesCollapsed, setIsFilesCollapsed] = useState(false);

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

  // Delete Dialog state
  const [deleteDialogState, setDeleteDialogState] = useState<{
    isOpen: boolean;
    itemName?: string;
    itemCount?: number;
    isPermanent?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Move / Copy slide-up panel state
  const [moveCopyPanelState, setMoveCopyPanelState] = useState<{
    isOpen: boolean;
    mode: "move" | "copy";
    itemIds: string[];
    itemName?: string;
  } | null>(null);

  // Manage Access dialog state
  const [manageAccessDialogState, setManageAccessDialogState] = useState<{
    isOpen: boolean;
    targetName: string;
    itemId?: string;
  } | null>(null);

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

  // Phase 5: Drag and Drop States & Sensors
  const [activeDragItem, setActiveDragItem] = useState<WorkspaceDragData | null>(null);
  const [overDropTargetId, setOverDropTargetId] = useState<string | null>(null);
  const [isDraggingFilesFromComputer, setIsDraggingFilesFromComputer] = useState(false);
  const [computerHoverFolderId, setComputerHoverFolderId] = useState<string | null>(null);
  const computerDragCounter = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    })
  );

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
    onError: (err: any) => {
      toast.error(err?.message || "Failed to rename item");
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
    onError: (err: any) => {
      toast.error(err?.message || "Failed to move item");
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
    onError: (err: any, deletedId: string) => {
      setHiddenItemIds((prev) => prev.filter((id) => id !== deletedId));
      toast.error(err?.message || "Failed to delete item");
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
    onError: (err: any, vars) => {
      if (vars.action === "delete") {
        setHiddenItemIds((prev) => prev.filter((id) => !vars.ids.includes(id)));
      }
      toast.error(err?.message || `Failed to ${vars.action} items`);
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
  const startFileUpload = async (
    file: File,
    targetItemId?: string,
    customName?: string,
    customParentId?: string
  ) => {
    const filename = customName || file.name;
    const targetParent = customParentId !== undefined ? customParentId : currentFolderId;
    const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    try {
      const initRes = await apiRequest("/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: targetParent,
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
        parentId: targetParent,
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
    setInlineFolderName("untitled folder");
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

    const groups = buildUnifiedItemMenuGroups({
      kind: item.kind === "folder" ? "folder" : "file",
      canDownload: canDownload,
      canUploadVersion: true,
      onManageAccess: () => {
        setManageAccessDialogState({
          isOpen: true,
          targetName: item.name,
          itemId: item.id,
        });
      },
      onCreateShareLink: () => {
        setShareTargetItem({ id: item.id, name: item.name, type: "item" });
        setShowShareModal(true);
      },
      onDownload: () => {
        setSelectedItemIds([item.id]);
        handleStartDownload("zip");
      },
      onUploadNewVersion: () => {
        fileInputRef.current?.click();
      },
      onCopyTo: () => {
        setMoveCopyPanelState({
          isOpen: true,
          mode: "copy",
          itemIds: [item.id],
          itemName: item.name,
        });
      },
      onMoveTo: () => {
        setMoveCopyPanelState({
          isOpen: true,
          mode: "move",
          itemIds: [item.id],
          itemName: item.name,
        });
      },
      onDuplicate: () => {
        toast.info("Duplicate not supported for this item type yet");
      },
      onRename: () => triggerInlineRename(item),
      onDelete: () => {
        setDeleteDialogState({
          isOpen: true,
          itemName: item.name,
          itemCount: 1,
          onConfirm: () => {
            setDeleteDialogState(null);
            handleDeleteWithUndo(item);
          },
        });
      },
    });

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
      <div className="flex h-screen items-center justify-center bg-[#181818]">
        <div className="flex items-center gap-2 text-xs text-[#A3A6AD]">
          <Loader2 className="w-4 h-4 animate-spin text-[#4876F3]" />
          <span>Loading project workspace...</span>
        </div>
      </div>
    );
  }

  if (error || !workspaceData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#181818] text-white">
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
  const selectedBytes = selectedItems.reduce(
    (acc: number, cur: any) => acc + (cur.total_bytes || cur.latest_size_bytes || cur.size_bytes || 0),
    0
  );
  const selectedFolderCount = foldersList.filter((f: any) => selectedItemIds.includes(f.id)).length;
  const selectedFileCount = filesList.filter((f: any) => selectedItemIds.includes(f.id)).length;
  const totalFolderBytes = foldersList.reduce((acc: number, f: any) => acc + (f.total_bytes || 0), 0);
  const totalFileBytes = filesList.reduce((acc: number, f: any) => acc + (f.size_bytes || f.latest_size_bytes || 0), 0);

  const toggleSelectAllFolders = () => {
    const folderIds = foldersList.map((f: any) => f.id);
    const allSelected = folderIds.length > 0 && folderIds.every((id: string) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds(selectedItemIds.filter((id) => !folderIds.includes(id)));
    } else {
      setSelectedItemIds(Array.from(new Set([...selectedItemIds, ...folderIds])));
    }
  };

  const toggleSelectAllFiles = () => {
    const fileIds = filesList.map((f: any) => f.id);
    const allSelected = fileIds.length > 0 && fileIds.every((id: string) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds(selectedItemIds.filter((id) => !fileIds.includes(id)));
    } else {
      setSelectedItemIds(Array.from(new Set([...selectedItemIds, ...fileIds])));
    }
  };

  // Active uploads in this folder
  const activeUploadsHere = uploads.filter(
    (u) => (u.parentId || null) === currentFolderId && u.status === "uploading"
  );

  // Active drag descendants (folders that cannot be dropped into)
  const activeDragDescendants = (() => {
    if (!activeDragItem || activeDragItem.type !== "folder") return [];
    const descendants: string[] = [];
    const queue = [activeDragItem.id];
    const allFolders = treeData?.folders || [];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const f of allFolders) {
        if (f.parent_id === parentId) {
          descendants.push(f.id);
          queue.push(f.id);
        }
      }
    }
    return descendants;
  })();

  // Current folder name for dropzone
  const currentFolderName = (() => {
    if (!currentFolderId) return project.name || "project";
    const found = (treeData?.folders || []).find((f: any) => f.id === currentFolderId);
    return found?.name || "folder";
  })();

  // dnd-kit handlers
  const handleDragStart = (event: DragStartEvent) => {
    const itemData = event.active.data.current as WorkspaceDragData;
    setActiveDragItem(itemData);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverDropTargetId(event.over ? (event.over.id as string) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragItem(null);
    setOverDropTargetId(null);

    const { active, over } = event;
    if (!over || !over.data.current) return;

    const target = over.data.current as WorkspaceDropData;
    const activeId = active.id as string;

    // Do not drop on itself
    if (target.id === activeId) return;

    // Do not drop on descendant
    if (target.id && activeDragDescendants.includes(target.id)) {
      toast.error("Cannot move a folder into itself or its subfolder");
      return;
    }

    const idsToMove = selectedItemIds.includes(activeId)
      ? selectedItemIds
      : [activeId];

    if (idsToMove.length === 1) {
      moveMutation.mutate({
        id: idsToMove[0],
        targetParentId: target.id,
      });
    } else {
      batchActionMutation.mutate({
        action: "move",
        ids: idsToMove,
        targetParentId: target.id,
      });
    }

    toast.success(`Moved ${idsToMove.length} item${idsToMove.length > 1 ? "s" : ""} to ${target.name}`);
    setSelectedItemIds([]);
  };

  const handleDragCancel = () => {
    setActiveDragItem(null);
    setOverDropTargetId(null);
  };

  // Computer File Drag Handlers
  const handleWindowDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      computerDragCounter.current++;
      setIsDraggingFilesFromComputer(true);
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      computerDragCounter.current--;
      if (computerDragCounter.current <= 0) {
        setIsDraggingFilesFromComputer(false);
        computerDragCounter.current = 0;
      }
    }
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      computerDragCounter.current = 0;
      setIsDraggingFilesFromComputer(false);
      setComputerHoverFolderId(null);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach((f) => startFileUpload(f));
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        onContextMenu={handleEmptyWorkspaceContextMenu}
        onDragEnter={handleWindowDragEnter}
        onDragOver={handleWindowDragOver}
        onDragLeave={handleWindowDragLeave}
        onDrop={handleWindowDrop}
        className="flex flex-col h-screen w-full bg-[#181818] text-[#FFFFFF] font-sans antialiased overflow-hidden select-none relative"
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
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white transition-colors mr-2 shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-[#2E2F34] mr-3 shrink-0" />

          {/* Breadcrumbs: All projects / {Client} / {Project} [/ {Folder}] */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs truncate">
            <Link
              href="/projects"
              className="text-[#A3A6AD] hover:text-white transition-colors shrink-0"
            >
              All projects
            </Link>
            <span className="text-[#7C7F87] shrink-0">/</span>
            {project.client_id ? (
              <Link
                href={`/clients/${project.client_id}`}
                className="text-[#A3A6AD] hover:text-white transition-colors truncate max-w-[140px]"
              >
                {project.client_name || "Client"}
              </Link>
            ) : (
              <span className="text-[#A3A6AD] truncate max-w-[140px]">
                {project.client_name || "Workspace"}
              </span>
            )}
            <span className="text-[#7C7F87] shrink-0">/</span>
            <DroppableTarget
              id="crumb-root"
              data={{ type: "root", id: null, name: project.name || "Files" }}
              activeDragId={activeDragItem?.id || null}
            >
              <Link
                href={`/projects/${projectId}`}
                className={`transition-colors truncate max-w-[160px] px-1.5 py-0.5 rounded-[6px] ${
                  overDropTargetId === "crumb-root"
                    ? "bg-[#4876F3]/20 ring-1 ring-[#4876F3] text-white"
                    : !currentFolderId && breadcrumbs.length === 0
                    ? "text-white font-semibold"
                    : "text-[#A3A6AD] hover:text-white"
                }`}
              >
                {project.name}
              </Link>
            </DroppableTarget>
            {breadcrumbs.map((b: any, idx: number) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={b.id}>
                  <span className="text-[#7C7F87] shrink-0">/</span>
                  <DroppableTarget
                    id={`crumb-${b.id}`}
                    data={{ type: "folder", id: b.id, name: b.name }}
                    activeDragId={activeDragItem?.id || null}
                    draggedDescendants={activeDragDescendants}
                  >
                    <Link
                      href={`/projects/${projectId}?folder=${b.id}`}
                      className={`truncate max-w-[140px] px-1.5 py-0.5 rounded-[6px] transition-colors ${
                        overDropTargetId === `crumb-${b.id}`
                          ? "bg-[#4876F3]/20 ring-1 ring-[#4876F3] text-white"
                          : isLast
                          ? "text-white font-semibold"
                          : "text-[#A3A6AD] hover:text-white"
                      }`}
                    >
                      {b.name}
                    </Link>
                  </DroppableTarget>
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
          <aside className="w-[280px] min-w-[280px] max-w-[280px] h-full border-r border-[#2E2F34] bg-[#212121] flex flex-col justify-between shrink-0 overflow-hidden select-none z-10 relative">
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Project Switcher */}
              <div className="relative border-b border-[#2E2F34]">
                <button
                  type="button"
                  onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-[#2A2B30] transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-[8px] bg-[#4876F3]/20 text-[#4876F3] font-bold text-xs flex items-center justify-center shrink-0  border border-[#4876F3]/30">
                      {(project.client_name || project.name || "P").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate leading-tight">
                        {project.name}
                      </p>
                      <p className="text-xs text-[#A3A6AD] truncate leading-tight mt-0.5">
                        {project.client_name || "Workspace"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="rounded-full bg-[#2A2B30] border border-[#2E2F34] px-1.5 py-0.5 text-xs font-medium text-[#A3A6AD]">
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
                    <div className="absolute left-2 right-2 top-14 z-40 rounded-xl border border-[#2E2F34] bg-[#212121] p-2 shadow-overlay space-y-2">
                      <div className="px-2 pt-1 pb-1">
                        <p className="text-xs font-bold  text-[#7C7F87]">
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
                                    : "text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white"
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
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold  text-[#A3A6AD]">
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
                <DroppableTarget
                  id="tree-root"
                  data={{ type: "root", id: null, name: "Files" }}
                  activeDragId={activeDragItem?.id || null}
                  className="w-full"
                >
                  <button
                    onClick={() => router.push(`/projects/${projectId}`)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs transition-colors ${
                      overDropTargetId === "tree-root"
                        ? "bg-[#4876F3]/20 ring-1 ring-[#4876F3] text-white font-semibold"
                        : !currentFolderId
                        ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                        : "text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30]/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder className="w-4 h-4 text-[#4876F3]" />
                      <span className="truncate">Files</span>
                    </div>
                    <span className="text-xs text-[#7C7F87] tabular-nums font-mono">
                      {overDropTargetId === "tree-root" ? "Move here" : (project.file_count || 0)}
                    </span>
                  </button>
                </DroppableTarget>

                {/* Folder tree */}
                {treeData?.folders?.map((f: any) => {
                  const isActive = currentFolderId === f.id;
                  const isOver = overDropTargetId === `tree-folder-${f.id}`;
                  return (
                    <DroppableTarget
                      key={f.id}
                      id={`tree-folder-${f.id}`}
                      data={{ type: "folder", id: f.id, name: f.name }}
                      activeDragId={activeDragItem?.id || null}
                      draggedDescendants={activeDragDescendants}
                      className="w-full"
                    >
                      <button
                        onClick={() => router.push(`/projects/${projectId}?folder=${f.id}`)}
                        className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1.5 rounded-[10px] text-xs transition-colors ${
                          isOver
                            ? "bg-[#4876F3]/20 ring-1 ring-[#4876F3] text-white font-semibold"
                            : isActive
                            ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                            : "text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30]/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Folder className={`w-3.5 h-3.5 ${isActive || isOver ? "text-[#4876F3]" : "text-[#7C7F87]"}`} />
                          <span className="truncate">{f.name}</span>
                          {f.is_restricted && (
                            <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-xs text-[#7C7F87] tabular-nums font-mono">
                          {isOver ? "Move here" : (f.file_count || 0)}
                        </span>
                      </button>
                    </DroppableTarget>
                  );
                })}
              </div>

              {/* Sheets and Docs (Tracker first) */}
              <div className="p-3 pt-2 space-y-1 border-t border-[#2E2F34]">
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold  text-[#A3A6AD]">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate font-medium">{trackerSheet.title || "Tracker"}</span>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#3FCF8E]/10 text-[#3FCF8E] font-semibold ">
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
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
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white transition-colors"
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
                <div className="flex items-center justify-between px-2 py-1 text-xs font-bold  text-[#A3A6AD]">
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

                <p className="px-2 text-xs text-[#7C7F87]">
                  All share links ({sortedShareLinks.length})
                </p>

                <div className="space-y-0.5 pt-1">
                  {sortedShareLinks.length === 0 ? (
                    <p className="text-xs text-[#7C7F87] px-2 py-1 italic">No share links yet</p>
                  ) : (
                    sortedShareLinks.map((link: any) => (
                      <button
                        key={link.id}
                        onClick={() => {
                          setShareTargetItem({ id: projectId, name: project.name, type: "project" });
                          setShowShareModal(true);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[10px] text-xs text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white transition-colors group"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <div className="w-4 h-4 rounded bg-[#2A2B30] border border-[#2E2F34] flex items-center justify-center shrink-0">
                            <Share2 className="w-2.5 h-2.5 text-[#4876F3]" />
                          </div>
                          <span className="truncate">{link.name || "Share link"}</span>
                        </div>
                        <span className="text-xs text-[#7C7F87] group-hover:text-white tabular-nums">
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
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-xs font-medium text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white transition-colors"
              >
                <Trash2 className="w-4 h-4 text-[#7C7F87]" />
                <span>Recently deleted</span>
              </Link>
            </div>

            {/* Slide-up Move to / Copy to panel over lower part of project panel */}
            <AnimatePresence>
              {moveCopyPanelState?.isOpen && (
                <MoveCopyPanel
                  isOpen={moveCopyPanelState.isOpen}
                  mode={moveCopyPanelState.mode}
                  itemCount={moveCopyPanelState.itemIds.length}
                  clientName={project.client_name || "Client"}
                  projectName={project.name || "Project"}
                  folders={treeData?.folders || []}
                  onClose={() => setMoveCopyPanelState(null)}
                  onConfirm={(targetFolderId) => {
                    const ids = moveCopyPanelState.itemIds;
                    if (ids.length === 1) {
                      moveMutation.mutate({
                        id: ids[0],
                        targetParentId: targetFolderId,
                      });
                    } else {
                      batchActionMutation.mutate({
                        action: "move",
                        ids,
                        targetParentId: targetFolderId,
                      });
                    }
                    setMoveCopyPanelState(null);
                  }}
                />
              )}
            </AnimatePresence>
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
                <div className="hidden sm:flex items-center rounded-[8px] bg-[#212121] border border-[#2E2F34] p-0.5 text-xs font-bold">
                  {(["compact", "normal", "large"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCardSize(s)}
                      className={`px-2 py-1 rounded-[6px] transition-colors  ${
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
              <div className="flex items-center gap-1.5 text-xs text-[#A3A6AD]">
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
                      <div className="absolute left-0 top-9 z-40 w-48 rounded-xl border border-[#2E2F34] bg-[#212121] py-1 shadow-overlay">
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
                      className="inline-block h-5 w-5 rounded-full ring-2 ring-[#212121] bg-[#4876F3] text-xs font-bold text-white flex items-center justify-center  shrink-0"
                    >
                      {(m.email || "U").slice(0, 1).toUpperCase()}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold text-[#A3A6AD]">
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-[#3B67E0] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors shadow"
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
          {/* Folders Section with 30ms Stagger */}
          {(foldersList.length > 0 || isCreatingInlineFolder) && (
            <div className="space-y-3">
              <SectionHeader
                count={foldersList.length + (isCreatingInlineFolder ? 1 : 0)}
                totalBytes={totalFolderBytes}
                unitSingular="folder"
                unitPlural="folders"
                selectedCount={selectedFolderCount}
                isCollapsed={isFoldersCollapsed}
                onToggleCollapse={() => setIsFoldersCollapsed(!isFoldersCollapsed)}
                onToggleSelectAll={toggleSelectAllFolders}
              />

              {!isFoldersCollapsed && (
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
                    {/* Inline New Folder Input Card per Phase 3 spec */}
                    {isCreatingInlineFolder && (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <FolderCard
                          id="inline-new-folder"
                          name={inlineFolderName}
                          itemCount={0}
                          totalBytes={0}
                          isSelected={false}
                          onToggleSelect={() => {}}
                          onOpen={() => {}}
                          onContextMenu={() => {}}
                          isRenaming={true}
                          renameValue={inlineFolderName}
                          onRenameChange={(val) => setInlineFolderName(val)}
                          onRenameSubmit={() => {
                            if (inlineFolderName.trim()) {
                              createFolderMutation.mutate(inlineFolderName.trim());
                            } else {
                              setIsCreatingInlineFolder(false);
                            }
                          }}
                          onRenameCancel={() => setIsCreatingInlineFolder(false)}
                        />
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
                        >
                          <DroppableTarget
                            id={`canvas-folder-${folder.id}`}
                            data={{ type: "folder", id: folder.id, name: folder.name }}
                            activeDragId={activeDragItem?.id || null}
                            draggedDescendants={activeDragDescendants}
                          >
                            <div
                              onDragOver={(e) => {
                                if (e.dataTransfer?.types?.includes("Files")) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setComputerHoverFolderId(folder.id);
                                }
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setComputerHoverFolderId(null);
                              }}
                              onDrop={(e) => {
                                if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setComputerHoverFolderId(null);
                                  Array.from(e.dataTransfer.files).forEach((f) =>
                                    startFileUpload(f, undefined, undefined, folder.id)
                                  );
                                }
                              }}
                            >
                              <DraggableItem
                                id={folder.id}
                                data={{
                                  type: "folder",
                                  id: folder.id,
                                  name: folder.name,
                                  itemCount: (folder.file_count || 0) + (folder.folder_count || 0),
                                  totalBytes: folder.total_bytes || 0,
                                }}
                              >
                                <FolderCard
                                  id={folder.id}
                                  name={folder.name}
                                  itemCount={(folder.file_count || 0) + (folder.folder_count || 0)}
                                  totalBytes={folder.total_bytes || 0}
                                  isRestricted={Boolean(folder.is_restricted)}
                                  thumbnails={folder.thumbnails || []}
                                  isSelected={isSelected}
                                  isDropTarget={
                                    overDropTargetId === `canvas-folder-${folder.id}` ||
                                    computerHoverFolderId === folder.id
                                  }
                                  dropLabel={
                                    computerHoverFolderId === folder.id
                                      ? "Upload to folder"
                                      : "Move to folder"
                                  }
                                  onToggleSelect={() => {
                                    if (isSelected) {
                                      setSelectedItemIds(selectedItemIds.filter((id) => id !== folder.id));
                                    } else {
                                      setSelectedItemIds([...selectedItemIds, folder.id]);
                                    }
                                  }}
                                  onOpen={() => router.push(`/projects/${projectId}?folder=${folder.id}`)}
                                  onContextMenu={(e) => handleItemContextMenu(e, folder)}
                                  isRenaming={isRenaming}
                                  renameValue={inlineRenameName}
                                  onRenameChange={(val) => setInlineRenameName(val)}
                                  onRenameSubmit={() => {
                                    if (inlineRenameName.trim()) {
                                      renameMutation.mutate({ id: folder.id, name: inlineRenameName.trim() });
                                    } else {
                                      setRenamingItemId(null);
                                    }
                                  }}
                                  onRenameCancel={() => setRenamingItemId(null)}
                                />
                              </DraggableItem>
                            </div>
                          </DroppableTarget>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {/* Files & Active Uploads Section */}
          {(filesList.length > 0 || activeUploadsHere.length > 0) && (
            <div className="space-y-3">
              <SectionHeader
                count={filesList.length}
                totalBytes={totalFileBytes}
                unitSingular="file"
                unitPlural="files"
                selectedCount={selectedFileCount}
                isCollapsed={isFilesCollapsed}
                onToggleCollapse={() => setIsFilesCollapsed(!isFilesCollapsed)}
                onToggleSelectAll={toggleSelectAllFiles}
              />

              {!isFilesCollapsed && (
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
                        className="rounded-xl border border-[#4876F3]/50 bg-[#212121] p-4 flex flex-col justify-between shadow-lg relative overflow-hidden"
                      >
                        <div className="h-32 w-full rounded-xl bg-[#181818] flex flex-col items-center justify-center gap-2 mb-3">
                          <Upload className="w-8 h-8 text-[#4876F3] animate-bounce" />
                          <span className="text-xs font-semibold text-[#4876F3]">
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
                        <DraggableItem
                          key={file.id}
                          id={file.id}
                          data={{
                            type: "file",
                            id: file.id,
                            name: file.name,
                            totalBytes: file.size_bytes || file.latest_size_bytes || 0,
                          }}
                        >
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
                          className={`group relative rounded-xl border transition-all cursor-pointer p-4 flex flex-col justify-between ${
                            isSelected
                              ? "bg-[#4876F3]/15 border-[#4876F3] shadow-md"
                              : "bg-[#181818] border-[#212121] hover:border-[#424344]"
                          }`}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="absolute top-4 left-4 rounded border-[#424344] text-[#4876F3] focus:ring-0 z-10"
                          />

                          {/* Preview Area */}
                          <div className="relative h-32 w-full rounded-xl bg-[#181818] border border-[#212121] flex items-center justify-center overflow-hidden mb-3">
                            {isVideo ? (
                              <>
                                <div className="w-full h-full bg-[#181818] flex items-center justify-center">
                                  <Film className="w-10 h-10 text-violet-400" />
                                </div>
                                <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#4876F3] text-xs font-bold text-white ">
                                  v{file.latest_version_number || 1}
                                </span>
                                <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 text-xs font-mono text-white">
                                  01:15
                                </span>
                                <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 text-xs text-white flex items-center gap-1.5 font-medium">
                                  <MessageSquare className="w-3 h-3 text-zinc-300" />
                                  <span>5</span>
                                </div>
                              </>
                            ) : isSheet ? (
                              <div className="w-full h-full bg-[#212121] flex flex-col justify-between p-3">
                                <span className="text-xs font-bold text-emerald-400 ">SHEET</span>
                                <div className="space-y-1">
                                  <div className="h-1.5 w-full bg-emerald-500/20 rounded" />
                                  <div className="h-1.5 w-2/3 bg-emerald-500/10 rounded" />
                                </div>
                                <span className="text-xs text-emerald-400 font-mono">Tracker | Summary</span>
                              </div>
                            ) : (
                              <div className="w-full h-full bg-[#181818] flex flex-col justify-between p-3">
                                <span className="text-xs font-bold text-blue-400 ">DOC</span>
                                <div className="space-y-1.5">
                                  <div className="h-1.5 w-full bg-blue-500/20 rounded" />
                                  <div className="h-1.5 w-4/5 bg-blue-500/10 rounded" />
                                </div>
                                <span className="text-xs text-[#A3A6AD]">PDF Preview</span>
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
                                <p className="text-xs text-[#A3A6AD] mt-0.5">
                                  {file.created_by_name || "Editor"} · Oct 14
                                </p>
                              </>
                            )}

                            <div className="mt-2.5 flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>Approved</span>
                              </span>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleItemContextMenu(e, file);
                                }}
                                className="p-1 rounded-lg hover:bg-[#212121] text-[#A3A6AD] hover:text-white"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                        </DraggableItem>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {foldersList.length === 0 && filesList.length === 0 && !isCreatingInlineFolder && (
            <div className="py-20 text-center border border-dashed border-[#212121] rounded-xl">
              <Folder className="w-10 h-10 text-[#A3A6AD] mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-white">This folder is empty</h3>
              <p className="text-xs text-[#A3A6AD] mt-1">
                Right-click anywhere to upload files or create subfolders.
              </p>
            </div>
          )}
        </div>

        {/* =========================================================================
            BOTTOM FLOATING SELECTION BAR (Phase 3 Spec)
            ========================================================================= */}
        <SelectionBar
          selectedCount={selectedItemIds.length}
          selectedBytes={selectedBytes}
          selectedFolderCount={selectedFolderCount}
          selectedFileCount={selectedFileCount}
          onClearSelection={() => setSelectedItemIds([])}
          onCopyLink={handleCopyProjectLink}
          onDownload={() => handleStartDownload("zip")}
          onManageAccess={() => {
            setManageAccessDialogState({
              isOpen: true,
              targetName: workspaceData?.project?.name || "Project",
            });
          }}
          onDelete={() => {
            setDeleteDialogState({
              isOpen: true,
              itemCount: selectedItemIds.length,
              onConfirm: () => {
                setDeleteDialogState(null);
                handleBatchDeleteWithUndo();
              },
            });
          }}
          onMoveTo={() => {
            setMoveCopyPanelState({
              isOpen: true,
              mode: "move",
              itemIds: selectedItemIds,
            });
          }}
          onDuplicate={() => {
            toast.info("Duplicate selected");
          }}
          onCopyTo={() => {
            setMoveCopyPanelState({
              isOpen: true,
              mode: "copy",
              itemIds: selectedItemIds,
            });
          }}
          canDownload={canDownload}
        />
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

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        isOpen={!!deleteDialogState?.isOpen}
        name={deleteDialogState?.itemName}
        itemCount={deleteDialogState?.itemCount}
        isPermanent={deleteDialogState?.isPermanent}
        onClose={() => setDeleteDialogState(null)}
        onConfirm={() => {
          deleteDialogState?.onConfirm();
        }}
      />

      {/* Manage Access Dialog */}
      <ManageAccessDialog
        isOpen={!!manageAccessDialogState?.isOpen}
        targetName={manageAccessDialogState?.targetName || project.name}
        onClose={() => setManageAccessDialogState(null)}
        isRestricted={Boolean(workspaceData?.project?.is_restricted)}
        onToggleRestricted={(restricted) => {
          apiRequest(`/projects/${projectId}`, {
            method: "PATCH",
            body: JSON.stringify({ is_restricted: restricted }),
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["project-items", projectId] });
            toast.success(restricted ? "Project restricted" : "Inherited access restored");
          });
        }}
        members={
          grantsData?.grants?.map((g: any) => ({
            id: g.id || g.user_id,
            name: g.user_name || g.email,
            email: g.email || "",
            level: g.access_level || "commenter",
            can_download: g.can_download ?? true,
            inherited_from: g.inherited ? (g.inherited_from || "Company") : undefined,
          })) || []
        }
        onAddMember={async (email, level, canDownload, message) => {
          await apiRequest(`/projects/${projectId}/grants`, {
            method: "POST",
            body: JSON.stringify({
              email,
              access_level: level,
              can_download: canDownload,
              message,
            }),
          });
          queryClient.invalidateQueries({ queryKey: ["project-grants", projectId] });
          toast.success(`Access granted to ${email}`);
        }}
        onRemoveMember={async (memberId) => {
          await apiRequest(`/projects/${projectId}/grants/${memberId}`, {
            method: "DELETE",
          });
          queryClient.invalidateQueries({ queryKey: ["project-grants", projectId] });
          toast.success("Member removed");
        }}
      />

      {/* Floating Drag Overlay Ghost (Folder tab / thumbnail / stack badge) */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <WorkspaceDragGhost
            activeItem={activeDragItem}
            selectedCount={
              selectedItemIds.includes(activeDragItem.id)
                ? selectedItemIds.length
                : 1
            }
          />
        ) : null}
      </DragOverlay>

      {/* Full-Page Computer Drag & Drop Overlay */}
      {isDraggingFilesFromComputer && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            computerDragCounter.current--;
            if (computerDragCounter.current <= 0) {
              setIsDraggingFilesFromComputer(false);
              computerDragCounter.current = 0;
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            computerDragCounter.current = 0;
            setIsDraggingFilesFromComputer(false);
            setComputerHoverFolderId(null);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              Array.from(e.dataTransfer.files).forEach((f) => startFileUpload(f));
            }
          }}
          className="fixed inset-0 z-50 bg-[#181818]/90 backdrop-blur-sm border-2 border-dashed border-[#4876F3] flex flex-col items-center justify-center p-6 text-center select-none cursor-copy animate-in fade-in duration-150"
        >
          <div className="w-16 h-16 rounded-xl bg-[#4876F3]/10 border border-[#4876F3]/30 flex items-center justify-center mb-4 text-[#4876F3] shadow-lg animate-bounce">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">
            Drop to upload to {currentFolderName}
          </h3>
          <p className="text-xs text-[#A3A6AD] max-w-sm">
            Release anywhere to upload into this folder, or drop directly onto a folder card below to upload into that folder.
          </p>
        </div>
      )}
    </div>
    </DndContext>
  );
}
