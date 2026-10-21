"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Upload, Folder, Loader2 } from "@/components/ui/icon";
import { apiRequest } from "@/lib/api";
import { useUploadStore } from "@/lib/upload-store";

interface ProjectOption {
  id: string;
  name: string;
  client_name?: string;
}

interface FolderOption {
  id: string;
  name: string;
}

interface UploadDestinationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialFolderId?: string;
}

export function UploadDestinationDialog({
  isOpen,
  onClose,
  initialProjectId,
  initialFolderId,
}: UploadDestinationDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addUploads } = useUploadStore();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch projects on open
  useEffect(() => {
    if (!isOpen) return;

    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const res = await apiRequest<{ projects: any[] }>("/projects");
        const list = res?.projects || [];
        setProjects(list);

        // Preselect project
        let targetProjId = initialProjectId || "";
        if (!targetProjId && list.length > 0) {
          targetProjId = list[0].id;
        }
        setSelectedProjectId(targetProjId);
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoadingProjects(false);
      }
    }

    loadProjects();
  }, [isOpen, initialProjectId]);

  // Fetch folders when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setFolders([]);
      setSelectedFolderId("");
      return;
    }

    async function loadFolders() {
      setLoadingFolders(true);
      try {
        const res = await apiRequest<{ items: any[] }>(`/projects/${selectedProjectId}/items`);
        const folderItems = (res?.items || []).filter((it: any) => it.kind === "folder");
        setFolders(folderItems);

        // Preselect folder if available
        if (initialFolderId && folderItems.some((f: any) => f.id === initialFolderId)) {
          setSelectedFolderId(initialFolderId);
        } else if (folderItems.length > 0) {
          setSelectedFolderId(folderItems[0].id);
        } else {
          setSelectedFolderId("");
        }
      } catch (err) {
        console.error("Failed to load folders:", err);
        setFolders([]);
      } finally {
        setLoadingFolders(false);
      }
    }

    loadFolders();
  }, [selectedProjectId, initialFolderId]);

  // Save choice to server
  const saveChoiceToServer = async (projId: string, fldId: string) => {
    try {
      await apiRequest("/users/me/upload-destination", {
        method: "PUT",
        body: JSON.stringify({
          project_id: projId,
          folder_id: fldId,
        }),
      });
    } catch (e) {
      console.warn("Failed to save upload destination to server:", e);
    }
  };

  const handleFilesSelected = async (filesList: FileList | File[]) => {
    const files = Array.from(filesList);
    if (files.length === 0 || !selectedProjectId) return;

    // Save choice to server so it follows user on all devices (Requirement 5)
    await saveChoiceToServer(selectedProjectId, selectedFolderId);

    await addUploads(files, {
      projectId: selectedProjectId,
      parentId: selectedFolderId || null,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-white">Upload files</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Select destination project and folder
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Project Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Project
            </label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-[var(--input)] text-xs text-[var(--text-3)]">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading projects...</span>
              </div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-sm text-white focus:outline-none focus:border-[var(--accent)]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.client_name ? `(${p.client_name})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Folder Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Folder
            </label>
            {loadingFolders ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-[var(--input)] text-xs text-[var(--text-3)]">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading folders...</span>
              </div>
            ) : folders.length === 0 ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-[var(--text-3)]">
                <Folder size={14} />
                <span>No folders (will upload to project root)</span>
              </div>
            ) : (
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-sm text-white focus:outline-none focus:border-[var(--accent)]"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                handleFilesSelected(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--input)]/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFilesSelected(e.target.files);
                }
              }}
            />
            <div className="mx-auto w-10 h-10 rounded-full bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center text-[var(--text-2)] mb-2">
              <Upload size={18} />
            </div>
            <p className="text-sm font-medium text-white">
              Click to browse or drag files here
            </p>
            <p className="text-xs text-[var(--text-3)] mt-1">
              Supports video, images, audio, and documents
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedProjectId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Upload size={14} />
            <span>Choose files</span>
          </button>
        </div>
      </div>
    </div>
  );
}
