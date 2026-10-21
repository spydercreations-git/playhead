"use client";

import React, { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { useUploadStore } from "@/lib/upload-store";
import { FolderCard } from "@/components/cards/folder-card";
import { FileCard, FileCardItem } from "@/components/cards/file-card";
import { CopyLinkDialog } from "@/components/sharing/copy-link-dialog";
import { MoveCopyPanel } from "@/components/panels/move-copy-panel";
import { ManageAccessDialog } from "@/components/access/manage-access-dialog";
import { DeleteDialog } from "@/components/dialogs/delete-dialog";
import { FileViewer, ViewerItem } from "@/components/files/file-viewer";
import { Menu, MenuGroup, useContextMenu } from "@/components/ui/menu";
import { buildUnifiedItemMenuGroups } from "@/components/items/unified-item-menu";
import {
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Upload,
  PersonAdd,
  Link2,
  Folder,
  Info,
  ChevronRight,
  Plus,
} from "@/components/ui/icon";

export default function LibraryProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const currentFolderId = searchParams.get("folder") || null;

  const { user, isClient, hasPermission } = useAuth();
  const { uploads, addUploads } = useUploadStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Selection & Dialog States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCopyLink, setShowCopyLink] = useState(false);
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [moveItemState, setMoveItemState] = useState<{
    isOpen: boolean;
    mode: "move" | "copy";
    item: any;
  } | null>(null);
  const [deleteDialogState, setDeleteDialogState] = useState<{
    isOpen: boolean;
    item: any;
  } | null>(null);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);

  // Context Menu
  const { openContextMenu } = useContextMenu();

  // 1. Fetch Project Details & Items
  const { data: workspaceData, isLoading } = useQuery({
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

  const project = workspaceData?.project || { id: projectId, name: "Project" };
  const rawFolders = workspaceData?.folders || [];
  const rawFiles = workspaceData?.files || [];
  const breadcrumbs = workspaceData?.breadcrumbs || [];

  // 2. Fetch Project Tree (for Move to picker)
  const { data: treeData } = useQuery<{ folders: any[] }>({
    queryKey: ["project-tree", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/folders/tree`),
  });

  // 3. Fetch Grants/Members for member avatars stack
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

  // Current folder item if inside a folder
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return rawFolders.find((f) => f.id === currentFolderId) ||
      treeData?.folders?.find((f) => f.id === currentFolderId) || { id: currentFolderId, name: "Folder" };
  }, [currentFolderId, rawFolders, treeData]);

  // Active uploads in this folder
  const activeUploadsInFolder = useMemo(() => {
    return uploads.filter(
      (u) => (u.parentId || null) === currentFolderId
    );
  }, [uploads, currentFolderId]);

  // Mutations
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
    mutationFn: ({ id, targetFolderId, targetProjectId }: { id: string; targetFolderId: string | null; targetProjectId?: string }) =>
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

  // Upload handler
  const handleUploadClick = () => {
    if (!currentFolderId) {
      toast.info("Files can only be uploaded inside a folder. Open a folder, then Upload or drop files.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilesChosen = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    if (!currentFolderId) {
      toast.info("Files can only be uploaded inside a folder. Open a folder, then Upload or drop files.");
      return;
    }

    const filesArray = Array.from(filesList);
    await addUploads(filesArray, {
      projectId,
      parentId: currentFolderId,
      targetPath: `${project.name || "Project"} / ${currentFolder?.name || "Folder"}`,
    });
    queryClient.invalidateQueries({ queryKey: ["project-workspace", projectId] });
  };

  // Context menu builder matching Screenshot L4
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

  // Client badge color
  const clientName = project.client_name || "Client";
  const clientInitial = clientName.trim()[0]?.toUpperCase() || "C";
  const isInternal = clientName.toLowerCase().includes("idyll");
  const badgeColor = isInternal ? "bg-[var(--panel-raised)] text-[var(--text-2)]" : "bg-[#4876F3]/20 text-[#4876F3]";

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => handleFilesChosen(e.target.files)}
      />

      {/* Top Breadcrumb Navigation matching Screenshot L2 / L3 */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[var(--text-3)]">
        <Link href="/library" className="hover:text-white transition-colors">
          Library
        </Link>
        <span>›</span>
        <span>{clientName}</span>
        <span>›</span>
        <Link href={`/library/${projectId}`} className={`hover:text-white transition-colors ${!currentFolderId ? "text-white font-medium" : ""}`}>
          {project.name}
        </Link>
        {currentFolder && (
          <>
            <span>›</span>
            <span className="text-white font-medium">{currentFolder.name}</span>
          </>
        )}
      </nav>

      {/* Main Project Header matching Screenshot L2 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Project Title + Client Tag */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">{project.name}</h1>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-[var(--panel)] border border-[var(--border)] text-xs text-[var(--text-2)] font-medium">
            <span className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded text-xs font-bold ${badgeColor}`}>
              {clientInitial}
            </span>
            <span>{clientName}</span>
          </div>
        </div>

        {/* Right Header Buttons matching Screenshot L2 */}
        <div className="flex items-center gap-2.5">
          {/* Member Avatars Stack */}
          <div className="flex -space-x-1.5 overflow-hidden mr-1">
            {members.slice(0, 4).map((m: any, idx: number) => (
              <div
                key={m.id || idx}
                style={{ backgroundColor: m.color || (idx === 0 ? "#FFBB56" : idx === 1 ? "#FA457B" : idx === 2 ? "#4876F3" : "#3FCF8E") }}
                className="inline-flex h-6 w-6 rounded-full ring-2 ring-[var(--panel)] text-xs font-bold text-white items-center justify-center"
              >
                {(m.name || m.email || "U").slice(0, 1).toUpperCase()}
              </div>
            ))}
          </div>

          {/* Manage Access Button */}
          <button
            type="button"
            onClick={() => setShowManageAccess(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors"
          >
            <PersonAdd size={14} className="text-[var(--text-2)]" />
            <span>Manage access</span>
          </button>

          {/* Copy Link Button (L5) */}
          <button
            type="button"
            onClick={() => setShowCopyLink(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--panel)] hover:bg-[var(--hover)] border border-[var(--border)] text-xs font-semibold text-white transition-colors"
          >
            <Link2 size={14} className="text-[var(--text-2)]" />
            <span>Copy link</span>
          </button>

          {/* Upload Button (Blue) */}
          <button
            type="button"
            onClick={handleUploadClick}
            className="flex items-center gap-1.5 h-8 px-4 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-[var(--button-text)] transition-all shadow active:scale-95"
          >
            <Upload size={14} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Secondary Breadcrumbs */}
      <div className="text-xs text-[var(--text-3)] flex items-center gap-1.5 pt-0.5">
        <Link href="/library" className="hover:text-white">Library</Link>
        <span>›</span>
        <span>{clientName}</span>
        <span>›</span>
        <Link href={`/library/${projectId}`} className={!currentFolderId ? "text-[var(--text-2)] font-medium" : "hover:text-white"}>
          {project.name}
        </Link>
        {currentFolder && (
          <>
            <span>›</span>
            <span className="text-white font-medium">{currentFolder.name}</span>
          </>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex h-9 w-64 items-center gap-2 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs text-[var(--text-3)] focus-within:border-[#4876F3] transition-colors">
            <Search size={15} className="text-[var(--text-3)] shrink-0" />
            <input
              type="text"
              placeholder="Search in this project"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-white placeholder-[var(--text-3)] focus:outline-none text-xs"
            />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-[10px] bg-[var(--input)] border border-[var(--border)] pl-3 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors cursor-pointer"
            >
              <option value="all">Type: All</option>
              <option value="video">Videos</option>
              <option value="image">Images</option>
              <option value="document">Documents</option>
            </select>
            <ChevronDown size={14} className="text-[var(--text-3)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-[10px] bg-[var(--input)] border border-[var(--border)] pl-3 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors cursor-pointer"
            >
              <option value="date">Date modified</option>
              <option value="name">Name</option>
            </select>
            <ChevronDown size={14} className="text-[var(--text-3)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Grid / List switch */}
          <div className="flex rounded-[8px] bg-[var(--panel)] border border-[var(--border)] p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-[6px] transition-colors ${
                viewMode === "grid" ? "bg-[var(--border)] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-[6px] transition-colors ${
                viewMode === "list" ? "bg-[var(--border)] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* VIEW A: PROJECT ROOT LEVEL (Folders 4, banner, "No files at project level") */}
      {!currentFolderId && (
        <div className="space-y-6 pt-2">
          {/* Folders Section matching Screenshot L2 */}
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
                        prev.includes(folder.id) ? prev.filter((x) => x !== folder.id) : [...prev, folder.id]
                      );
                    }}
                    onOpen={() => router.push(`/library/${projectId}?folder=${folder.id}`)}
                    onContextMenu={(e) => handleItemContextMenu(e, folder, "folder")}
                  />
                );
              })}
            </div>
          </div>

          {/* Info Banner matching Screenshot L2 */}
          <div className="flex items-center gap-2.5 rounded-[10px] bg-[var(--panel)] border border-[var(--border)] px-4 py-3 text-xs text-[var(--text-2)]">
            <Info size={16} className="text-[var(--text-3)] shrink-0" />
            <span>Files can only be uploaded inside a folder. Open a folder, then Upload or drop files.</span>
          </div>

          {/* Empty files at project level text matching Screenshot L2 */}
          <div className="py-2 text-xs text-[var(--text-3)]">
            No files at project level
          </div>
        </div>
      )}

      {/* VIEW B: INSIDE A FOLDER (Screenshot L3 Upload states in the folder grid) */}
      {currentFolderId && (
        <div className="space-y-6 pt-2">
          {/* Folder Title Header */}
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-[var(--text-2)]" />
            <span className="text-base font-semibold text-white">{currentFolder?.name}</span>
            <span className="text-xs text-[var(--text-3)]">
              {filteredFiles.length + activeUploadsInFolder.length} items
            </span>
          </div>

          {/* Files Grid with in-place L3 upload states */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Active Uploads in progress / processing */}
            {activeUploadsInFolder.map((u) => (
              <FileCard
                key={u.id}
                file={{
                  id: u.id,
                  name: u.filename,
                  type: u.file?.type || "video/mp4",
                  size_bytes: u.file?.size,
                  status: u.status === "uploading" ? "uploading" : u.status === "completed" ? "ready" : "processing",
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
                    status: file.processing_status === "generating" ? "processing" : "ready",
                  }}
                  isSelected={isSelected}
                  onToggleSelect={() => {
                    setSelectedIds((prev) =>
                      prev.includes(file.id) ? prev.filter((x) => x !== file.id) : [...prev, file.id]
                    );
                  }}
                  onOpen={() => setViewingFileId(file.id)}
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

      {/* Copy Link Dialog (Screenshot L5) */}
      {showCopyLink && (
        <CopyLinkDialog
          isOpen={showCopyLink}
          onClose={() => setShowCopyLink(false)}
          projectId={projectId}
          projectName={project.name}
          onOpenManageAccess={() => setShowManageAccess(true)}
        />
      )}

      {/* Move to / Copy to Panel (Screenshot L6) */}
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
