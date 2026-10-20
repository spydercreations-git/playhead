"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  HardDrive,
  FolderPlus,
  Upload,
  Search,
  Lock,
  LayoutGrid,
  List,
  MoreHorizontal,
  ChevronRight,
  Folder as FolderIcon,
  VideoFileIcon,
  ImageFileIcon,
  PdfFileIcon,
  AudioFileIcon,
  Download,
  Trash2,
  FolderInput,
  FolderOutput,
  Edit3,
  X,
  Check,
} from "@/components/ui/icon";
import { FolderCard } from "@/components/cards/folder-card";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

interface DriveFolder {
  id: string;
  name: string;
  category: "videos" | "images" | "documents" | "music" | "custom" | string;
  is_default_folder: boolean;
  position: string;
  file_count: number;
  total_bytes: number;
  created_at: string;
  updated_at: string;
}

interface DriveItem {
  id: string;
  name: string;
  kind: "file" | "folder";
  category?: string;
  total_bytes: number;
  is_default_folder: boolean;
  created_at: string;
  updated_at: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return isoString;
  }
}

export default function MyDrivePage() {
  const router = useRouter();
  const { isExecutive, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isExecutive) {
      router.replace("/");
    }
  }, [authLoading, isExecutive, router]);

  // State
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<DriveFolder | null>(null);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMenuTarget, setActionMenuTarget] = useState<DriveFolder | DriveItem | null>(null);

  // Modals
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DriveFolder | DriveItem | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"move" | "copy">("move");
  const [projectModalTarget, setProjectModalTarget] = useState<DriveFolder | DriveItem | null>(null);
  const [projectsList, setProjectsList] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectActionLoading, setProjectActionLoading] = useState(false);

  // Error / Alert feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch root folders
  const fetchFolders = async () => {
    try {
      const data = await apiRequest<{ folders: DriveFolder[] }>("/drive/folders");
      setFolders(data.folders || []);
    } catch (err) {
      console.error("Failed to load drive folders", err);
    }
  };

  // Fetch items inside folder
  const fetchFolderItems = async (folderId: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<{ items: DriveItem[] }>(`/drive/items?folder_id=${folderId}`);
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to load drive items", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchFolders().finally(() => setLoading(false));
  }, []);

  // When folder selection changes
  useEffect(() => {
    if (currentFolder) {
      fetchFolderItems(currentFolder.id);
      // Record view in recent_items
      apiRequest("/drive/recent", {
        method: "POST",
        body: JSON.stringify({ item_id: currentFolder.id, item_type: "folder" }),
      }).catch(() => {});
    } else {
      fetchFolders();
    }
  }, [currentFolder]);

  // Load projects for Move/Copy modal
  const openProjectModal = async (target: DriveFolder | DriveItem, mode: "move" | "copy") => {
    setProjectModalTarget(target);
    setProjectModalMode(mode);
    setIsProjectModalOpen(true);
    setActionMenuTarget(null);
    try {
      const data = await apiRequest<{ projects: ProjectOption[] }>("/projects");
      const projs = data.projects || [];
      setProjectsList(projs);
      if (projs.length > 0) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (err) {
      console.error("Failed to load projects", err);
    }
  };

  const handleExecuteProjectAction = async () => {
    if (!projectModalTarget || !selectedProjectId) return;
    setProjectActionLoading(true);
    try {
      const endpoint = projectModalMode === "move"
        ? `/drive/items/${projectModalTarget.id}/move`
        : `/drive/items/${projectModalTarget.id}/copy`;

      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ target_project_id: selectedProjectId }),
      });

      setIsProjectModalOpen(false);
      if (currentFolder) {
        fetchFolderItems(currentFolder.id);
      } else {
        fetchFolders();
      }
    } catch (err: any) {
      setFeedbackMessage(err.message || "Failed to complete action");
    } finally {
      setProjectActionLoading(false);
    }
  };

  // Create folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await apiRequest("/drive/folders", {
        method: "POST",
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent_id: currentFolder ? currentFolder.id : null,
        }),
      });

      setNewFolderName("");
      setIsNewFolderOpen(false);
      if (currentFolder) {
        fetchFolderItems(currentFolder.id);
      } else {
        fetchFolders();
      }
    } catch (err: any) {
      setFeedbackMessage(err.message || "Could not create folder");
    }
  };

  // Rename item
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInput.trim()) return;

    try {
      await apiRequest(`/drive/items/${renameTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameInput.trim() }),
      });

      setIsRenameOpen(false);
      setRenameTarget(null);
      if (currentFolder) {
        fetchFolderItems(currentFolder.id);
      } else {
        fetchFolders();
      }
    } catch (err: any) {
      setFeedbackMessage(err.message || "Cannot rename item");
    }
  };

  // Delete item (trash)
  const handleDelete = async (target: DriveFolder | DriveItem) => {
    setActionMenuTarget(null);
    try {
      await apiRequest(`/drive/items/${target.id}`, {
        method: "DELETE",
      });

      if (currentFolder) {
        fetchFolderItems(currentFolder.id);
      } else {
        fetchFolders();
      }
    } catch (err: any) {
      setFeedbackMessage(err.message || "Cannot delete this folder");
    }
  };

  // Handle direct file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Initiate upload
      const initData = await apiRequest<{ upload_id: string; parts: Array<{ part_number: number; url: string }> }>("/uploads/initiate", {
        method: "POST",
        body: JSON.stringify({
          project_id: "drive",
          parent_id: currentFolder ? currentFolder.id : null,
          filename: file.name,
          size_bytes: file.size,
          mime: file.type || "application/octet-stream",
        }),
      });

      const { upload_id, parts } = initData;

      // 2. Upload parts to S3 / MinIO directly
      const completedParts = [];
      for (const p of parts) {
        const partRes = await fetch(p.url, {
          method: "PUT",
          body: file,
        });
        const etag = partRes.headers.get("ETag") || `"mock-etag-${p.part_number}"`;
        completedParts.push({ part_number: p.part_number, etag });
      }

      // 3. Complete upload
      await apiRequest(`/uploads/${upload_id}/complete`, {
        method: "POST",
        body: JSON.stringify({ parts: completedParts }),
      });

      if (currentFolder) {
        fetchFolderItems(currentFolder.id);
      } else {
        fetchFolders();
      }
    } catch (err) {
      console.error(err);
      setFeedbackMessage("Upload encountered an error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Calculate total bytes across folders
  const totalDriveBytes = folders.reduce((acc, f) => acc + (f.total_bytes || 0), 0);

  // Filter items or folders based on searchQuery
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredItems = items.filter((it) =>
    it.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-white select-none">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Header */}
      <header className="px-8 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            {currentFolder ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                <button
                  onClick={() => setCurrentFolder(null)}
                  className="hover:text-white transition-colors flex items-center gap-1 font-medium"
                >
                  <HardDrive size={16} />
                  <span>My Drive</span>
                </button>
                <ChevronRight size={14} className="text-[var(--text-3)]" />
                <span className="text-white font-semibold">{currentFolder.name}</span>
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">My Drive</h1>
                <p className="text-sm text-[var(--text-2)] mt-1">
                  Private to you. Move or copy anything into a project when it&apos;s ready.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsNewFolderOpen(true)}
              className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[var(--input)] border border-[var(--border)] hover:bg-[#3A3C44] text-sm font-medium text-white transition-colors"
            >
              <FolderPlus size={16} />
              <span>New folder</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-sm font-semibold text-[var(--button-text)] transition-colors"
            >
              <Upload size={16} className="text-[var(--button-text)]" />
              <span>Upload</span>
            </button>
          </div>
        </div>

        {/* Lock Subheader with Real Storage Stats */}
        {!currentFolder && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)] mt-3">
            <Lock size={13} className="shrink-0" />
            <span>Only you can see My Drive · {formatBytes(totalDriveBytes)} used</span>
          </div>
        )}

        {/* Feedback Alert if any */}
        {feedbackMessage && (
          <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[#FA457B]/10 border border-[#FA457B]/30 text-xs text-[#FA457B]">
            <span>{feedbackMessage}</span>
            <button onClick={() => setFeedbackMessage(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Controls: Search, View Mode Toggle */}
        <div className="flex items-center justify-between mt-6 pb-2">
          <div className="relative w-72">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search My Drive"
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-[var(--input)] border border-[var(--border)] focus:border-[#3B67E0] focus:outline-none text-sm text-white placeholder-[var(--text-3)]"
            />
          </div>

          <div className="flex items-center gap-1 bg-[var(--input)] p-0.5 rounded-lg border border-[var(--border)]">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "grid" ? "bg-[#3A3C44] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "list" ? "bg-[#3A3C44] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-8 pb-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-44 rounded-xl bg-[var(--panel)] animate-pulse border border-[var(--border)]" />
            ))}
          </div>
        ) : !currentFolder ? (
          /* ROOT VIEW: Folders Section (P06 Grid or List) */
          <div>
            <div className="flex items-center justify-between mb-4 mt-2">
              <h2 className="text-sm font-semibold text-white">Folders</h2>
              <span className="text-xs text-[var(--text-3)] font-mono">{filteredFolders.length}</span>
            </div>

            {filteredFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center text-[var(--text-3)] mb-3">
                  <FolderIcon size={22} />
                </div>
                <h3 className="text-sm font-semibold text-white">No folders found</h3>
                <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm">
                  Create a new folder or upload files to organize your personal drive.
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredFolders.map((folder) => (
                  <div key={folder.id}>
                    <FolderCard
                      id={folder.id}
                      name={folder.name}
                      itemCount={folder.file_count || 0}
                      totalBytes={folder.total_bytes || 0}
                      isSelected={selectedFolderIds.includes(folder.id)}
                      selectionActive={selectedFolderIds.length > 0}
                      onToggleSelect={() => {
                        setSelectedFolderIds((prev) =>
                          prev.includes(folder.id)
                            ? prev.filter((id) => id !== folder.id)
                            : [...prev, folder.id]
                        );
                      }}
                      onOpen={() => setCurrentFolder(folder)}
                      onContextMenu={(e) => {
                        if (e && "preventDefault" in e && typeof e.preventDefault === "function") {
                          e.preventDefault();
                        }
                        setActionMenuTarget(folder);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* List View (P07) */
              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--panel)]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs font-semibold text-[var(--text-3)]">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Modified</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredFolders.map((folder) => (
                      <tr
                        key={folder.id}
                        onDoubleClick={() => setCurrentFolder(folder)}
                        className="hover:bg-[var(--input)]/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 flex items-center gap-2.5">
                          <FolderIcon size={16} className="text-[#3FCF8E]" />
                          <span className="font-medium text-white">{folder.name}</span>
                          {folder.is_default_folder && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-3)] font-mono">
                              Default
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-2)] font-mono">
                          {folder.file_count} {folder.file_count === 1 ? "file" : "files"}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-2)] font-mono">
                          {formatBytes(folder.total_bytes)}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-3)] font-mono">
                          {formatDate(folder.updated_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setActionMenuTarget(folder)}
                            className="p-1 rounded text-[var(--text-3)] hover:text-white"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* INSIDE FOLDER VIEW (P07 Folder List View) */
          <div>
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center text-[var(--text-3)] mb-3">
                  <Upload size={22} />
                </div>
                <h3 className="text-sm font-semibold text-white">This folder is empty</h3>
                <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm">
                  Drag and drop files here, or use the Upload button above.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--panel)]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs font-semibold text-[var(--text-3)]">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Modified</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--input)]/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 flex items-center gap-2.5">
                          {item.kind === "folder" ? (
                            <FolderIcon size={16} className="text-[#3FCF8E]" />
                          ) : item.category === "videos" ? (
                            <VideoFileIcon size={16} className="text-[#FFBB56]" />
                          ) : item.category === "images" ? (
                            <ImageFileIcon size={16} className="text-[#FA457B]" />
                          ) : item.category === "music" ? (
                            <AudioFileIcon size={16} className="text-[#9787FF]" />
                          ) : (
                            <PdfFileIcon size={16} className="text-[#4876F3]" />
                          )}
                          <span className="font-medium text-white">{item.name}</span>
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-2)] capitalize">
                          {item.kind === "folder" ? "Folder" : item.category || "File"}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-2)] font-mono">
                          {formatBytes(item.total_bytes)}
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--text-3)] font-mono">
                          {formatDate(item.updated_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setActionMenuTarget(item)}
                            className="p-1 rounded text-[var(--text-3)] hover:text-white"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Context Action Menu Modal/Dropdown */}
      {actionMenuTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setActionMenuTarget(null)}
        >
          <div
            className="w-64 rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl p-2 flex flex-col gap-1 text-sm select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
              <p className="font-semibold text-white truncate">{actionMenuTarget.name}</p>
              <p className="text-xs text-[var(--text-3)]">Options</p>
            </div>

            {/* Move to Project */}
            {!actionMenuTarget.is_default_folder && (
              <button
                onClick={() => openProjectModal(actionMenuTarget, "move")}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white hover:bg-[var(--input)] transition-colors"
              >
                <FolderInput size={15} className="text-[#4876F3]" />
                <span>Move to project</span>
              </button>
            )}

            {/* Copy to Project */}
            <button
              onClick={() => openProjectModal(actionMenuTarget, "copy")}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white hover:bg-[var(--input)] transition-colors"
            >
              <FolderOutput size={15} className="text-[#3FCF8E]" />
              <span>Copy to project</span>
            </button>

            {/* Rename (disabled for default folders) */}
            {!actionMenuTarget.is_default_folder ? (
              <button
                onClick={() => {
                  setRenameTarget(actionMenuTarget);
                  setRenameInput(actionMenuTarget.name);
                  setIsRenameOpen(true);
                  setActionMenuTarget(null);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white hover:bg-[var(--input)] transition-colors"
              >
                <Edit3 size={15} className="text-[var(--text-2)]" />
                <span>Rename</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--text-3)] cursor-not-allowed">
                <Edit3 size={15} />
                <span>Cannot rename default folder</span>
              </div>
            )}

            {/* Trash (disabled for default folders) */}
            {!actionMenuTarget.is_default_folder ? (
              <button
                onClick={() => handleDelete(actionMenuTarget)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#FA457B] hover:bg-[#FA457B]/10 transition-colors"
              >
                <Trash2 size={15} />
                <span>Move to trash</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--text-3)] cursor-not-allowed">
                <Trash2 size={15} />
                <span>Cannot delete default folder</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl p-5"
          >
            <h3 className="text-base font-semibold text-white">Create new folder</h3>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Add a custom folder to organize your private drive.
            </p>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full h-10 mt-4 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] focus:border-[#3B67E0] focus:outline-none text-sm text-white"
            />
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="px-4 py-1.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-[var(--button-text)]"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {isRenameOpen && renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleRename}
            className="w-full max-w-sm rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl p-5"
          >
            <h3 className="text-base font-semibold text-white">Rename item</h3>
            <input
              type="text"
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full h-10 mt-4 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] focus:border-[#3B67E0] focus:outline-none text-sm text-white"
            />
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setIsRenameOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!renameInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-[var(--button-text)]"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move / Copy to Project Modal */}
      {isProjectModalOpen && projectModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl p-5">
            <h3 className="text-base font-semibold text-white">
              {projectModalMode === "move" ? "Move to project" : "Copy to project"}
            </h3>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Select the destination project for &quot;{projectModalTarget.name}&quot;. All subfolders and renditions will be included.
            </p>

            {projectsList.length === 0 ? (
              <p className="text-sm text-[#FA457B] mt-4">
                No active projects found. Create a project first.
              </p>
            ) : (
              <div className="mt-4 max-h-48 overflow-y-auto space-y-1.5 border border-[var(--border)] rounded-lg p-2 bg-[var(--bg)]">
                {projectsList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-md text-sm text-left transition-colors ${
                      selectedProjectId === p.id
                        ? "bg-[#3B67E0]/20 text-[#3B67E0] border border-[#3B67E0]/40"
                        : "text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white"
                    }`}
                  >
                    <span>{p.name}</span>
                    {selectedProjectId === p.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setIsProjectModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteProjectAction}
                disabled={!selectedProjectId || projectActionLoading}
                className="px-4 py-1.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50 text-xs font-semibold text-[var(--button-text)]"
              >
                {projectActionLoading ? "Processing..." : projectModalMode === "move" ? "Move" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
