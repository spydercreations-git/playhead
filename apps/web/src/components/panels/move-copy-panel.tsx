"use client";

import React, { useState, useMemo } from "react";
import { X, Folder, Search, Info } from "@/components/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface FolderItem {
  id: string;
  name: string;
  item_count?: number;
  file_count?: number;
  parent_id?: string | null;
  children?: FolderItem[];
}

export interface MoveCopyPanelProps {
  isOpen: boolean;
  mode: "move" | "copy";
  itemCount: number;
  clientName: string;
  projectName: string;
  projectId?: string;
  sourceLocationName?: string;
  folders: FolderItem[];
  onClose: () => void;
  onConfirm: (targetFolderId: string | null, targetProjectId?: string) => void;
  isLoading?: boolean;
}

export function MoveCopyPanel({
  isOpen,
  mode,
  itemCount,
  clientName,
  projectName,
  projectId,
  sourceLocationName = "Raw files",
  folders,
  onClose,
  onConfirm,
  isLoading = false,
}: MoveCopyPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId || null);

  // Fetch other projects for same client if available
  const { data: projectsData } = useQuery<{ projects?: any[] }>({
    queryKey: ["projects-same-client", clientName],
    queryFn: () => apiRequest<{ projects: any[] }>("/projects"),
    enabled: isOpen,
  });

  const otherProjects = useMemo(() => {
    const list = projectsData?.projects || [];
    return list.filter((p) => p.id !== projectId && (!clientName || p.client_name === clientName));
  }, [projectsData, projectId, clientName]);

  const filteredFolders = useMemo(() => {
    if (!search.trim()) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [folders, search]);

  if (!isOpen) return null;

  const isMove = mode === "move";
  const title = isMove
    ? `Move ${itemCount} ${itemCount === 1 ? "item" : "items"}`
    : `Copy ${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  const fromSubtitle = sourceLocationName
    ? `From ${projectName} / ${sourceLocationName}`
    : `From ${projectName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-[460px] rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in duration-150 flex flex-col gap-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
            <p className="text-xs text-[var(--text-2)] mt-0.5">{fromSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 focus-within:border-[#4876F3] transition-colors">
          <Search size={16} className="text-[var(--text-3)] shrink-0" />
          <input
            type="text"
            placeholder="Search folders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
          />
        </div>

        {/* Folder / Project Navigation Lists */}
        <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
          {/* This project section */}
          <div>
            <div className="text-xs font-semibold text-[var(--text-3)] mb-1.5 px-1">
              This project
            </div>
            <div className="space-y-1">
              {filteredFolders.length === 0 ? (
                <div className="text-xs text-[var(--text-3)] py-2 px-3">No folders found</div>
              ) : (
                filteredFolders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  const count = folder.item_count ?? folder.file_count ?? 0;
                  const countLabel = count === 0 ? "Empty" : `${count} ${count === 1 ? "item" : "items"}`;

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        setSelectedProjectId(projectId || null);
                      }}
                      className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-xs transition-colors ${
                        isSelected
                          ? "bg-[var(--panel-raised)] text-white font-medium ring-1 ring-[#4876F3]"
                          : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Folder size={16} className={isSelected ? "text-[#4876F3]" : "text-[var(--text-3)]"} />
                        <span className="truncate">{folder.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[var(--text-3)] shrink-0 text-xs">
                        <span>{countLabel}</span>
                        <span className="text-xs font-mono">›</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Other projects section */}
          {otherProjects.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text-3)] mb-1.5 px-1">
                Other projects
              </div>
              <div className="space-y-1">
                {otherProjects.slice(0, 3).map((proj: any) => {
                  const isForbidden = isMove; // Rule 6 & L6: cross-project move forbidden
                  return (
                    <div
                      key={proj.id}
                      onClick={() => {
                        if (!isForbidden) {
                          setSelectedProjectId(proj.id);
                          setSelectedFolderId(null);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-xs transition-colors ${
                        isForbidden
                          ? "opacity-40 cursor-not-allowed text-[var(--text-3)]"
                          : selectedProjectId === proj.id
                          ? "bg-[var(--panel-raised)] text-white font-medium ring-1 ring-[#4876F3] cursor-pointer"
                          : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Folder size={16} className="text-[var(--text-3)]" />
                        <span className="truncate">{proj.name}</span>
                      </div>
                      <div className="text-[var(--text-3)] text-sm">
                        {isForbidden ? "⊘" : "›"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* L6 Notice Banner */}
        {isMove && (
          <div className="flex items-center gap-2 rounded-[8px] bg-[var(--input)] border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-2)]">
            <Info size={16} className="text-[var(--text-3)] shrink-0" />
            <span>Files can&apos;t move to another project. Use Copy to instead.</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-[8px] bg-[var(--hover)] hover:bg-[var(--input)] text-xs font-semibold text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedFolderId || isLoading}
            onClick={() => {
              if (selectedFolderId) {
                onConfirm(selectedFolderId, selectedProjectId || undefined);
              }
            }}
            className={`h-8 px-4 rounded-[8px] text-xs font-semibold text-white transition-all ${
              selectedFolderId && !isLoading
                ? "bg-[#2563EB] hover:bg-[#3B67E0] shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
                : "bg-[var(--border)] text-[var(--text-3)] cursor-not-allowed"
            }`}
          >
            {isLoading ? "Processing..." : isMove ? "Move here" : "Copy here"}
          </button>
        </div>
      </div>
    </div>
  );
}
