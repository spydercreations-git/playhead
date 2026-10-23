"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { useUploadStore } from "@/lib/upload-store";
import { useBreadcrumbsStore, BreadcrumbItem } from "@/lib/breadcrumbs-store";
import { FolderCard } from "@/components/cards/folder-card";
import { FileCard } from "@/components/cards/file-card";
import { CopyLinkDialog } from "@/components/sharing/copy-link-dialog";
import { MoveCopyPanel } from "@/components/panels/move-copy-panel";
import { ManageAccessDialog } from "@/components/access/manage-access-dialog";
import { DeleteDialog } from "@/components/dialogs/delete-dialog";
import { useContextMenu } from "@/components/ui/menu";
import { buildUnifiedItemMenuGroups } from "@/components/items/unified-item-menu";
import {
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Upload,
  UploadFile,
  DriveFolderUpload,
  PersonAdd,
  Link2,
  Folder,
  FolderPlus,
  Plus,
} from "@/components/ui/icon";
import { ClientAvatar, UserAvatar } from "@/components/ui/avatar";

// Helper to recursively read dropped entries preserving paths
async function readEntry(entry: any, path = ""): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file: File) => {
          try {
            Object.defineProperty(file, "webkitRelativePath", {
              value: path ? `${path}/${file.name}` : file.name,
              writable: true,
              configurable: true,
            });
          } catch {
            // Ignore if property definition fails
          }
          resolve([file]);
        },
        () => resolve([])
      );
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    const allEntries: any[] = [];
    const readBatch = (): Promise<void> => {
      return new Promise((resolve) => {
        dirReader.readEntries(
          (batch: any[]) => {
            if (!batch || batch.length === 0) {
              resolve();
            } else {
              allEntries.push(...batch);
              readBatch().then(resolve);
            }
          },
          () => resolve()
        );
      });
    };
    await readBatch();
    const files: File[] = [];
    const currentPath = path ? `${path}/${entry.name}` : entry.name;
    for (const child of allEntries) {
      const childFiles = await readEntry(child, currentPath);
      files.push(...childFiles);
    }
    return files;
  }
  return [];
}

async function readAllEntriesRecursively(entries: any[]): Promise<File[]> {
  const allFiles: File[] = [];
  for (const entry of entries) {
    const files = await readEntry(entry);
    allFiles.push(...files);
  }
  return allFiles;
}

export default function LibraryProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const currentFolderId = searchParams.get("folder") || null;

  const { user } = useAuth();
  const { uploads, addUploads } = useUploadStore();
  const setBreadcrumbs = useBreadcrumbsStore((state) => state.setBreadcrumbs);

  // Hidden native inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const targetFolderForUploadRef = useRef<string | null>(null);

  // Search & Filters (for folder view)
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Selection & Dialog States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCopyLink, setShowCopyLink] = useState(false);
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Destination folder picker modal (when uploading/dropping files at project level)
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [selectedFolderForUpload, setSelectedFolderForUpload] = useState<string>("");
  const [pendingFilesToUpload, setPendingFilesToUpload] = useState<File[] | null>(null);
  const [isCreatingFolderInline, setIsCreatingFolderInline] = useState(false);
  const [inlineFolderName, setInlineFolderName] = useState("");

  const [moveItemState, setMoveItemState] = useState<{
    isOpen: boolean;
    mode: "move" | "copy";
    item: any;
  } | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<{
    isOpen: boolean;
    item: any;
  } | null>(null);

  // Context Menu
  const { openContextMenu } = useContextMenu();

  // 1. Fetch Project Details
  const { data: projectDetails } = useQuery<{ project?: any }>({
    queryKey: ["project-details", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}`),
  });

  // 2. Fetch Project Items
  const { data: workspaceData } = useQuery({
    queryKey: ["project-workspace", projectId, currentFolderId, typeFilter, sortBy],
    queryFn: () =>
      apiRequest<{
        project: any;
        folders: any[];
        files: any[];
        breadcrumbs?: any[];
      }>(
        `/projects/${projectId}/items?parent_id=${currentFolderId || ""}&type=${typeFilter}&sort=${sortBy}`
      ),
    refetchInterval: 5000,
  });

  const rawProject = projectDetails?.project || workspaceData?.project || { id: projectId, name: "Project" };
  const project = {
    ...rawProject,
    ...(workspaceData?.project || {}),
  };
  const rawFolders = useMemo(() => workspaceData?.folders || [], [workspaceData?.folders]);
  const rawFiles = useMemo(() => workspaceData?.files || [], [workspaceData?.files]);

  // 3. Fetch Project Tree (for move/copy picker)
  const { data: treeData } = useQuery<{ folders: any[] }>({
    queryKey: ["project-tree", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/folders/tree`),
  });

  // 4. Fetch Grants/Members for member avatars stack
  const { data: grantsData } = useQuery<{ grants?: any[]; members?: any[] }>({
    queryKey: ["project-grants", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/grants`),
  });

  const members = grantsData?.grants || grantsData?.members || [
    { email: "harsh@idyllproductions.com", name: "Harsh", color: "#FFBB56" },
    { email: "rahul@idyllproductions.com", name: "Rahul", color: "#FA457B" },
    { email: "karishma@idyllproductions.com", name: "Karishma", color: "#4876F3" },
    { email: "sarah@idyllproductions.com", name: "Sarah", color: "#3FCF8E" },
  ];

  // Current folder item if inside a folder
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return (
      rawFolders.find((f) => f.id === currentFolderId) ||
      treeData?.folders?.find((f: any) => f.id === currentFolderId) || {
        id: currentFolderId,
        name: "Folder",
      }
    );
  }, [currentFolderId, rawFolders, treeData]);

  // Client badge and details
  const clientName = project.client_name || "Client";

  // Requirement 1: Register Top Bar Breadcrumbs Only (Library > <Client> > <Project> > <Folder>...)
  useEffect(() => {
    const crumbs: BreadcrumbItem[] = [{ label: "Library", href: "/library" }];

    if (project.client_name) {
      crumbs.push({
        label: project.client_name,
        href: project.client_id ? `/clients/${project.client_id}` : "/library",
      });
    }

    crumbs.push({
      label: project.name || "Project",
      href: `/library/${projectId}`,
    });

    if (currentFolderId && currentFolder) {
      crumbs.push({
        label: currentFolder.name,
        href: `/library/${projectId}?folder=${currentFolderId}`,
      });
    }

    setBreadcrumbs(crumbs);

    return () => {
      setBreadcrumbs(null);
    };
  }, [
    project.client_name,
    project.client_id,
    project.name,
    projectId,
    currentFolderId,
    currentFolder,
    setBreadcrumbs,
  ]);

  // Requirement 2: Title Row metadata
  const createdDateText = useMemo(() => {
    const createdAt = project.created_at ? new Date(project.created_at) : new Date();
    const now = new Date();
    const isToday =
      createdAt.getFullYear() === now.getFullYear() &&
      createdAt.getMonth() === now.getMonth() &&
      createdAt.getDate() === now.getDate();

    if (isToday) return "created today";

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `created ${monthNames[createdAt.getMonth()]} ${createdAt.getDate()}`;
  }, [project.created_at]);

  const creatorName = useMemo(() => {
    if (project.created_by_name) return project.created_by_name;
    if (project.creator_name) return project.creator_name;
    if (user?.name) return user.name;
    return "Harsh";
  }, [project.created_by_name, project.creator_name, user?.name]);

  const templateLabel =
    project.template === "video" || project.template === "video_project"
      ? "Video project"
      : "Blank project";

  // Filtering
  const filteredFolders = useMemo(() => {
    if (!search.trim()) return rawFolders;
    return rawFolders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [rawFolders, search]);

  const filteredFiles = useMemo(() => {
    let list = rawFiles;
    if (search.trim()) {
      list = list.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
    }
    return list;
  }, [rawFiles, search]);

  // Active uploads in current folder
  const activeUploadsInFolder = useMemo(() => {
    return uploads.filter((u) => (u.parentId || null) === currentFolderId);
  }, [uploads, currentFolderId]);

  // Mutations
  const createFolderMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      apiRequest<{ item?: any; folder?: any }>("/items/folder", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: parentId !== undefined ? parentId : currentFolderId || null,
          name: name.trim(),
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setIsNewFolderOpen(false);
      setNewFolderName("");
      toast.success("Folder created");
      return data;
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to create folder");
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string | null }) =>
      apiRequest(`/items/${id}/move`, {
        method: "POST",
        body: JSON.stringify({ target_parent_id: targetFolderId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setMoveItemState(null);
      toast.success("Item moved");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to move item");
    },
  });

  const copyMutation = useMutation({
    mutationFn: ({
      id,
      targetFolderId,
      targetProjectId,
    }: {
      id: string;
      targetFolderId: string | null;
      targetProjectId?: string;
    }) =>
      apiRequest(`/items/${id}/copy`, {
        method: "POST",
        body: JSON.stringify({
          target_project_id: targetProjectId || projectId,
          target_parent_id: targetFolderId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      setMoveItemState(null);
      toast.success("Item copied");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to copy item");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/items/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      toast.success("Item duplicated");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to duplicate item");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/items/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setDeleteDialogState(null);
      toast.success("Item deleted");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to delete item");
    },
  });

  // Handler: Upload Folder (Requirement 4)
  const handleFolderUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // Track created subfolder IDs relative to the current upload root
    const folderIdMap = new Map<string, string>();
    const folderPaths = new Set<string>();

    files.forEach((f) => {
      const relPath = f.webkitRelativePath || f.name;
      const parts = relPath.split("/").filter(Boolean);
      if (parts.length > 1) {
        let accumulated = "";
        for (let i = 0; i < parts.length - 1; i++) {
          accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
          folderPaths.add(accumulated);
        }
      }
    });

    // Create shallowest folders first so parents exist before children
    const sortedPaths = Array.from(folderPaths).sort(
      (a, b) => a.split("/").length - b.split("/").length
    );

    toast.info("Uploading folder...");

    for (const dirPath of sortedPaths) {
      const parts = dirPath.split("/");
      const folderName = parts[parts.length - 1];
      const parentDirPath = parts.slice(0, -1).join("/");
      const parentId = parentDirPath ? folderIdMap.get(parentDirPath) : currentFolderId || null;

      try {
        const res = await apiRequest<{ item?: any; folder?: any }>("/items/folder", {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            parent_id: parentId || null,
            name: folderName,
          }),
        });
        const createdId = res?.item?.id || res?.folder?.id;
        if (createdId) {
          folderIdMap.set(dirPath, createdId);
        }
      } catch (err: any) {
        console.error("Failed to create folder:", dirPath, err);
      }
    }

    // Now upload each file into its folder
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const parts = relPath.split("/").filter(Boolean);
      const parentDirPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      const parentId = parentDirPath
        ? folderIdMap.get(parentDirPath) || currentFolderId
        : currentFolderId;

      await addUploads([f], {
        projectId,
        parentId: parentId || null,
        targetPath: `${project.name || "Project"} / ${parentDirPath || "Folder"}`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
    toast.success("Folder upload complete");
  };

  // Handler: Upload Files Menu Click
  const handleUploadFilesOption = () => {
    if (currentFolderId) {
      targetFolderForUploadRef.current = currentFolderId;
      fileInputRef.current?.click();
    } else {
      // At project level: prompt folder picker
      setPendingFilesToUpload(null);
      if (rawFolders.length > 0) {
        setSelectedFolderForUpload(rawFolders[0].id);
      } else {
        setSelectedFolderForUpload("");
      }
      setShowFolderPicker(true);
    }
  };

  // Handler: When files selected via hidden file input
  const handleFilesChosen = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const filesArray = Array.from(filesList);

    const destinationFolderId = targetFolderForUploadRef.current || currentFolderId;
    if (!destinationFolderId) {
      // Show folder destination picker with these files
      setPendingFilesToUpload(filesArray);
      if (rawFolders.length > 0) {
        setSelectedFolderForUpload(rawFolders[0].id);
      } else {
        setSelectedFolderForUpload("");
      }
      setShowFolderPicker(true);
      return;
    }

    const destFolder = rawFolders.find((f) => f.id === destinationFolderId) || currentFolder;
    await addUploads(filesArray, {
      projectId,
      parentId: destinationFolderId,
      targetPath: `${project.name || "Project"} / ${destFolder?.name || "Folder"}`,
    });
    queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
    toast.success(`Upload started (${filesArray.length} file${filesArray.length > 1 ? "s" : ""})`);
  };

  // Handler: Confirm Destination Folder from dialog
  const handleConfirmFolderSelection = async (folderId: string) => {
    if (pendingFilesToUpload && pendingFilesToUpload.length > 0) {
      const destFolder = rawFolders.find((f) => f.id === folderId);
      await addUploads(pendingFilesToUpload, {
        projectId,
        parentId: folderId,
        targetPath: `${project.name || "Project"} / ${destFolder?.name || "Folder"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      toast.success(`Upload started (${pendingFilesToUpload.length} file${pendingFilesToUpload.length > 1 ? "s" : ""})`);
      setPendingFilesToUpload(null);
      setShowFolderPicker(false);
    } else {
      targetFolderForUploadRef.current = folderId;
      setShowFolderPicker(false);
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
    }
  };

  // Handler: Create Folder Inline inside picker dialog
  const handleCreateInlineFolder = async () => {
    if (!inlineFolderName.trim()) return;
    try {
      const res = await apiRequest<{ item?: any; folder?: any }>("/items/folder", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          parent_id: null,
          name: inlineFolderName.trim(),
        }),
      });
      const createdId = res?.item?.id || res?.folder?.id;
      await queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-tree", projectId] });
      setInlineFolderName("");
      setIsCreatingFolderInline(false);
      if (createdId) {
        setSelectedFolderForUpload(createdId);
      }
      toast.success("Folder created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create folder");
    }
  };

  // Handler: Drag and Drop (folders vs files)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
      }

      const hasDirectory = entries.some((entry) => entry.isDirectory);
      if (hasDirectory) {
        const filesWithPaths = await readAllEntriesRecursively(entries);
        if (filesWithPaths.length > 0) {
          await handleFolderUpload(filesWithPaths);
          return;
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (currentFolderId) {
        await addUploads(files, {
          projectId,
          parentId: currentFolderId,
          targetPath: `${project.name || "Project"} / ${currentFolder?.name || "Folder"}`,
        });
        queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
        toast.success(`Upload started (${files.length} file${files.length > 1 ? "s" : ""})`);
      } else {
        setPendingFilesToUpload(files);
        if (rawFolders.length > 0) {
          setSelectedFolderForUpload(rawFolders[0].id);
        } else {
          setSelectedFolderForUpload("");
        }
        setShowFolderPicker(true);
      }
    }
  };

  // Context Menu builder
  const handleItemContextMenu = (e: React.MouseEvent | HTMLElement, item: any, kind: "folder" | "file") => {
    const isFolder = kind === "folder";
    const groups = buildUnifiedItemMenuGroups({
      kind,
      canDownload: true,
      onManageAccess: () => setShowManageAccess(true),
      onCreateShareLink: () => setShowCopyLink(true),
      onDownload: () => {
        if (isFolder) {
          toast.info("Preparing folder zip download...");
        } else {
          toast.info("Starting file download...");
        }
      },
      onCopyTo: () => setMoveItemState({ isOpen: true, mode: "copy", item }),
      onMoveTo: () => setMoveItemState({ isOpen: true, mode: "move", item }),
      onDuplicate: () => duplicateMutation.mutate(item.id),
      onRename: () => {
        const newName = prompt("Rename item:", item.name);
        if (newName && newName.trim() && newName.trim() !== item.name) {
          apiRequest(`/items/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName.trim() }),
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
            toast.success("Renamed item");
          });
        }
      },
      onDelete: () => setDeleteDialogState({ isOpen: true, item }),
    });

    openContextMenu(e, groups);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File and Folder Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesChosen(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        ref={folderInputRef}
        {...({ webkitdirectory: "", directory: "" } as any)}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFolderUpload(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
      />

      {/* Requirement 2: TITLE ROW & Requirement 3: BUTTONS */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Project Title (30px bold) + Client Tag + Subtitle Line */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[30px] font-bold text-white tracking-tight leading-none">
              {project.name || "Project"}
            </h1>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--panel)] border border-[var(--border)] text-xs text-[var(--text-2)] font-medium">
              <ClientAvatar id={project.client_id} name={clientName} size={16} />
              <span>{clientName}</span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-2 font-normal">
            {templateLabel} · {createdDateText} by {creatorName}
          </p>
        </div>

        {/* Right: Avatars of people with access, Manage access, Copy link, New folder, Upload Split Button */}
        <div className="flex items-center gap-2">
          {/* Avatars of people with access */}
          <div className="flex -space-x-1.5 overflow-hidden mr-1">
            {members.slice(0, 4).map((m: any, idx: number) => (
              <UserAvatar
                key={m.id || idx}
                id={m.id}
                name={m.name}
                email={m.email}
                size={24}
                ring
              />
            ))}
          </div>

          {/* Manage access */}
          <button
            type="button"
            onClick={() => setShowManageAccess(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <PersonAdd size={16} className="text-[var(--text-2)]" />
            <span>Manage access</span>
          </button>

          {/* Copy link */}
          <button
            type="button"
            onClick={() => setShowCopyLink(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <Link2 size={16} className="text-[var(--text-2)]" />
            <span>Copy link</span>
          </button>

          {/* New folder button */}
          <button
            type="button"
            onClick={() => setIsNewFolderOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <FolderPlus size={16} className="text-[var(--text-2)]" />
            <span>New folder</span>
          </button>

          {/* Requirement 4: Upload Split Button (PR2) */}
          <div
            className="relative"
            onMouseEnter={() => setIsUploadHovered(true)}
            onMouseLeave={() => setIsUploadHovered(false)}
          >
            <div className="inline-flex items-center h-8 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors shadow select-none">
              <button
                type="button"
                onClick={() => setIsUploadMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-white"
              >
                <Upload size={16} />
                <span>Upload</span>
              </button>
              <div className="h-4 w-[1px] bg-white/20" />
              <button
                type="button"
                onClick={() => setIsUploadMenuOpen((prev) => !prev)}
                className="flex items-center justify-center px-1.5 py-1.5 cursor-pointer hover:bg-white/10 rounded-r-[8px] text-white"
                title="Upload options"
              >
                <ChevronDown
                  size={14}
                  className={
                    isUploadMenuOpen || isUploadHovered
                      ? "rotate-180 transition-transform"
                      : "transition-transform"
                  }
                />
              </button>
            </div>

            {/* Upload Dropdown Menu matching PR2 */}
            {(isUploadMenuOpen || isUploadHovered) && (
              <div className="absolute right-0 top-full mt-1.5 w-[160px] rounded-[10px] bg-[var(--panel)] border border-[var(--border)] shadow-xl p-1 z-50 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadMenuOpen(false);
                    setIsUploadHovered(false);
                    handleUploadFilesOption();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-xs text-white hover:bg-[var(--hover)] transition-colors text-left cursor-pointer"
                >
                  <UploadFile size={16} className="text-[var(--text-2)]" />
                  <span>Upload files</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadMenuOpen(false);
                    setIsUploadHovered(false);
                    folderInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-xs text-white hover:bg-[var(--hover)] transition-colors text-left cursor-pointer"
                >
                  <DriveFolderUpload size={16} className="text-[var(--text-2)]" />
                  <span>Upload folder</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Requirement 6: EMPTY PROJECT STATE matching PR1 */}
      {!currentFolderId && filteredFolders.length === 0 && (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={handleDrop}
          className={`rounded-[16px] border border-dashed p-12 flex flex-col items-center justify-center text-center my-6 min-h-[380px] w-full transition-colors ${
            isDragOver ? "border-[#4876F3] bg-[#4876F3]/5" : "border-[var(--border)] bg-transparent"
          }`}
        >
          {/* Folder Icon in rounded container */}
          <div className="w-14 h-14 rounded-[12px] bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center mb-5 text-[var(--text-3)]">
            <FolderPlus size={24} className="text-[var(--text-2)]" />
          </div>

          {/* Heading */}
          <h2 className="text-lg font-semibold text-white mb-2">This project is empty</h2>

          {/* Subtitle */}
          <p className="text-xs text-[var(--text-3)] mb-6 max-w-md">
            Create a folder, or drop a whole folder here to upload it.
          </p>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => setIsNewFolderOpen(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors shadow cursor-pointer"
            >
              <FolderPlus size={16} />
              <span>New folder</span>
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <DriveFolderUpload size={16} className="text-[var(--text-2)]" />
              <span>Upload folder</span>
            </button>
          </div>

          {/* Footnote */}
          <p className="text-xs text-[var(--text-3)]">Files always live inside a folder.</p>
        </div>
      )}

      {/* Requirement 7: When project has folders, show the folders grid (no grey info bar) */}
      {!currentFolderId && filteredFolders.length > 0 && (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={handleDrop}
          className={`space-y-6 pt-2 rounded-[12px] transition-colors ${
            isDragOver ? "ring-2 ring-[#4876F3] ring-dashed p-2" : ""
          }`}
        >
          <div className="space-y-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Folders</span>
              <span className="text-xs text-[var(--text-3)]">{filteredFolders.length}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFolders.map((folder) => {
                const isSelected = selectedIds.includes(folder.id);
                return (
                  <FolderCard
                    key={folder.id}
                    id={folder.id}
                    name={folder.name}
                    itemCount={folder.item_count ?? folder.file_count ?? 0}
                    totalBytes={folder.total_bytes || 0}
                    isSelected={isSelected}
                    onToggleSelect={() => {
                      setSelectedIds((prev) =>
                        prev.includes(folder.id)
                          ? prev.filter((x) => x !== folder.id)
                          : [...prev, folder.id]
                      );
                    }}
                    onOpen={() => router.push(`/library/${projectId}?folder=${folder.id}`)}
                    onContextMenu={(e) => handleItemContextMenu(e, folder, "folder")}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* INSIDE A FOLDER */}
      {currentFolderId && (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={handleDrop}
          className={`space-y-6 pt-2 rounded-[12px] transition-colors ${
            isDragOver ? "ring-2 ring-[#4876F3] ring-dashed p-2" : ""
          }`}
        >
          {/* Folder Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder size={20} className="text-[var(--text-2)]" />
              <span className="text-base font-semibold text-white">{currentFolder?.name}</span>
              <span className="text-xs text-[var(--text-3)]">
                {filteredFiles.length + activeUploadsInFolder.length} items
              </span>
            </div>

            {/* Filter and View toggles */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-52 items-center gap-2 rounded-[8px] bg-[var(--input)] border border-[var(--border)] px-2.5 text-xs text-[var(--text-3)] focus-within:border-[#4876F3] transition-colors">
                <Search size={14} className="text-[var(--text-3)] shrink-0" />
                <input
                  type="text"
                  placeholder="Search in folder"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-white placeholder-[var(--text-3)] focus:outline-none text-xs"
                />
              </div>

              <div className="h-8 p-[2px] rounded-[8px] bg-[var(--input)] border border-[var(--border)] inline-flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === "grid" ? "bg-[var(--hover)] text-white shadow-sm" : "text-[var(--text-3)] hover:text-white"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === "list" ? "bg-[var(--hover)] text-white shadow-sm" : "text-[var(--text-3)] hover:text-white"
                  }`}
                  title="List view"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Files Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Active Uploads in progress */}
            {activeUploadsInFolder.map((u) => (
              <FileCard
                key={u.id}
                file={{
                  id: u.id,
                  name: u.filename,
                  type: u.file?.type || "video/mp4",
                  size_bytes: u.file?.size,
                  status:
                    u.status === "uploading"
                      ? "uploading"
                      : u.status === "completed"
                      ? "ready"
                      : "processing",
                  upload_progress: u.progressPercent,
                  uploaded_bytes: (u.file?.size || 0) * (u.progressPercent / 100),
                  total_bytes: u.file?.size || 0,
                  seconds_remaining: 40,
                }}
              />
            ))}

            {/* Existing Files */}
            {filteredFiles.map((file) => {
              const isSelected = selectedIds.includes(file.id);
              return (
                <FileCard
                  key={file.id}
                  file={{
                    id: file.id,
                    name: file.name,
                    type: file.mime_type || file.type || "video/mp4",
                    size_bytes: file.size_bytes || 0,
                    thumbnail_url: file.thumbnail_url,
                    duration_seconds: file.duration_seconds || 42,
                    uploaded_at: file.created_at || file.updated_at,
                    status:
                      file.preview_status === "generating" ||
                      file.preview_status === "pending" ||
                      file.processing_status === "generating"
                        ? "processing"
                        : "ready",
                  }}
                  isSelected={isSelected}
                  onToggleSelect={() => {
                    setSelectedIds((prev) =>
                      prev.includes(file.id) ? prev.filter((x) => x !== file.id) : [...prev, file.id]
                    );
                  }}
                  onOpen={() => router.push(`/review/${file.id}`)}
                  onContextMenu={(e) => handleItemContextMenu(e, file, "file")}
                />
              );
            })}
          </div>

          {filteredFiles.length === 0 && activeUploadsInFolder.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[30vh] text-center px-4 rounded-[12px] border border-[var(--border)] bg-[var(--panel)]">
              <Folder size={32} className="text-[var(--text-3)] mb-2" />
              <p className="text-sm font-semibold text-white">This folder is empty</p>
              <p className="text-xs text-[var(--text-3)] mt-1">Upload files to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Requirement 5: NEW FOLDER MODAL */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsNewFolderOpen(false);
              setNewFolderName("");
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-[400px] rounded-[14px] bg-[var(--panel)] border border-[var(--border)] p-6 shadow-xl z-10 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-semibold text-white">New folder</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newFolderName.trim()) {
                  createFolderMutation.mutate({ name: newFolderName });
                }
              }}
              className="mt-4"
            >
              <input
                type="text"
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full h-10 px-3 rounded-[8px] bg-[var(--input)] border border-[var(--border)] text-sm text-white focus:outline-none focus:border-[#4876F3]"
              />
              <div className="flex items-center justify-end gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewFolderOpen(false);
                    setNewFolderName("");
                  }}
                  className="h-8 px-3 rounded-[8px] text-xs font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim() || createFolderMutation.isPending}
                  className="h-8 px-4 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer shadow"
                >
                  {createFolderMutation.isPending ? "Creating..." : "Create folder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DESTINATION FOLDER PICKER MODAL (Requirement 4) */}
      {showFolderPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            className="fixed inset-0"
            onClick={() => {
              setShowFolderPicker(false);
              setPendingFilesToUpload(null);
            }}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-[14px] bg-[var(--panel)] border border-[var(--border)] p-6 shadow-xl z-10 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-semibold text-white">Choose a folder</h3>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Files always live inside a folder. Select where to upload.
            </p>

            {/* Folder list */}
            <div className="mt-4 max-h-56 overflow-y-auto space-y-1.5">
              {rawFolders.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--text-3)]">
                  No folders in this project yet. Create one below to upload.
                </div>
              ) : (
                rawFolders.map((f) => {
                  const isSelected = selectedFolderForUpload === f.id;
                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFolderForUpload(f.id)}
                      className={`flex items-center justify-between p-2.5 rounded-[8px] cursor-pointer border transition-colors ${
                        isSelected
                          ? "bg-[var(--hover)] border-[#4876F3] text-white"
                          : "bg-[var(--input)] border-transparent hover:border-[var(--border)] text-[var(--text-2)] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Folder
                          size={18}
                          className={isSelected ? "text-[#4876F3]" : "text-[var(--text-3)]"}
                        />
                        <span className="text-xs font-medium truncate">{f.name}</span>
                      </div>
                      <span className="text-xs text-[var(--text-3)] shrink-0">
                        {f.item_count ?? f.file_count ?? 0} items
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inline New Folder section */}
            <div className="mt-4 pt-3 border-t border-[var(--border)]">
              {isCreatingFolderInline ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New folder name"
                    value={inlineFolderName}
                    onChange={(e) => setInlineFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateInlineFolder();
                      }
                    }}
                    className="flex-1 h-8 px-2.5 rounded-[6px] bg-[var(--input)] border border-[var(--border)] text-xs text-white focus:outline-none focus:border-[#4876F3]"
                  />
                  <button
                    type="button"
                    onClick={handleCreateInlineFolder}
                    disabled={!inlineFolderName.trim()}
                    className="h-8 px-3 rounded-[6px] bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingFolderInline(false);
                      setInlineFolderName("");
                    }}
                    className="h-8 px-2 text-xs text-[var(--text-3)] hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingFolderInline(true)}
                  className="flex items-center gap-2 text-xs font-medium text-[#4876F3] hover:underline cursor-pointer"
                >
                  <Plus size={16} />
                  <span>New folder</span>
                </button>
              )}
            </div>

            {/* Dialog Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => {
                  setShowFolderPicker(false);
                  setPendingFilesToUpload(null);
                }}
                className="h-8 px-3 rounded-[8px] text-xs font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFolderForUpload}
                onClick={() => handleConfirmFolderSelection(selectedFolderForUpload)}
                className="h-8 px-4 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer shadow"
              >
                {pendingFilesToUpload ? "Upload to this folder" : "Select folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Link Dialog */}
      {showCopyLink && (
        <CopyLinkDialog
          isOpen={showCopyLink}
          onClose={() => setShowCopyLink(false)}
          projectId={projectId}
          projectName={project.name}
          onOpenManageAccess={() => setShowManageAccess(true)}
        />
      )}

      {/* Move to / Copy to Panel */}
      {moveItemState?.isOpen && (
        <MoveCopyPanel
          isOpen={moveItemState.isOpen}
          mode={moveItemState.mode}
          itemCount={1}
          clientName={clientName}
          projectName={project.name}
          projectId={projectId}
          sourceLocationName={currentFolder?.name || "Raw files"}
          folders={treeData?.folders || rawFolders}
          onClose={() => setMoveItemState(null)}
          onConfirm={(targetFolderId, targetProjectId) => {
            if (moveItemState.mode === "move") {
              moveMutation.mutate({
                id: moveItemState.item.id,
                targetFolderId,
              });
            } else {
              copyMutation.mutate({
                id: moveItemState.item.id,
                targetFolderId,
                targetProjectId,
              });
            }
          }}
        />
      )}

      {/* Manage Access Dialog */}
      {showManageAccess && (
        <ManageAccessDialog
          isOpen={showManageAccess}
          targetName={project.name}
          onClose={() => setShowManageAccess(false)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogState?.isOpen && (
        <DeleteDialog
          isOpen={deleteDialogState.isOpen}
          name={deleteDialogState.item?.name || "item"}
          onClose={() => setDeleteDialogState(null)}
          onConfirm={() => deleteMutation.mutate(deleteDialogState.item.id)}
        />
      )}
    </div>
  );
}
