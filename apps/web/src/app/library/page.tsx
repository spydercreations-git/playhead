"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth, AUTH_QUERY_KEY } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/cards/project-card";
import { ProjectCardMenu } from "@/components/projects/project-card-menu";
import { RenameProjectDialog } from "@/components/projects/rename-project-dialog";
import { ProjectManageAccessModal } from "@/components/access/project-manage-access-modal";
import { CopyLinkDialog } from "@/components/sharing/copy-link-dialog";
import {
  DownloadTray,
  startBrowserDownload,
  DownloadSession,
  DownloadFile,
} from "@/components/downloads/download-tray";
import { Search, ChevronDown, LayoutGrid, List, Plus, Folder } from "@/components/ui/icon";
import {
  SelectClientsModal,
  ClientFilterButton,
  ClientOption,
} from "@/components/clients/select-clients-modal";

interface ProjectItem {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
  status: string;
  file_count: number;
  folder_count: number;
  video_count: number;
  total_bytes: number;
  updated_at: string;
  waiting_review_count?: number;
}

export default function LibraryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user, company, isClient, hasPermission, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSelectClients, setShowSelectClients] = useState(false);

  // Modals & Menu State
  const [menuState, setMenuState] = useState<{
    isOpen: boolean;
    project: ProjectItem | null;
    anchorRect: DOMRect | null;
    clickPosition: { x: number; y: number } | null;
  }>({
    isOpen: false,
    project: null,
    anchorRect: null,
    clickPosition: null,
  });

  const [manageAccessProject, setManageAccessProject] = useState<ProjectItem | null>(null);
  const [copyLinkProject, setCopyLinkProject] = useState<ProjectItem | null>(null);
  const [renameProject, setRenameProject] = useState<ProjectItem | null>(null);

  // Download tray state
  const [downloadSession, setDownloadSession] = useState<DownloadSession | null>(null);
  const downloadPausedRef = useRef(false);
  const downloadCancelledRef = useRef(false);

  // Initialize selectedClientIds from URL query param if present
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const urlClients = new URLSearchParams(window.location.search).get("clients");
      if (urlClients) {
        return urlClients.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  });

  // If URL didn't have filter, initialize from user's server preference once loaded
  const [hasInitializedFromUser, setHasInitializedFromUser] = useState(false);
  useEffect(() => {
    if (user && !hasInitializedFromUser) {
      const urlParam = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("clients")
        : null;

      if (!urlParam && Array.isArray(user.library_client_filter) && user.library_client_filter.length > 0) {
        setSelectedClientIds(user.library_client_filter);
      }
      setHasInitializedFromUser(true);
    }
  }, [user, hasInitializedFromUser]);

  // Fetch client options for filter dropdown and modal
  const { data: clientsData } = useQuery<{ clients: ClientOption[] }>({
    queryKey: ["clients-options"],
    queryFn: () => apiRequest<{ clients: ClientOption[] }>("/clients"),
  });
  const clientOptions = clientsData?.clients || [];

  // Fetch all projects (both active and inactive)
  const { data, isLoading } = useQuery<{ projects: ProjectItem[] }>({
    queryKey: ["library-projects"],
    queryFn: () => apiRequest<{ projects: ProjectItem[] }>("/projects"),
  });

  const projects = data?.projects || [];

  // Find internal Idyll Productions client
  const idyllClient = useMemo(() => {
    return clientOptions.find((c) => c.name.toLowerCase().includes("idyll"));
  }, [clientOptions]);

  // Apply Client filter and Search & Sort
  const filtered = useMemo(() => {
    let list = projects;

    // Filter by selected clients if filtered
    if (selectedClientIds.length > 0) {
      list = list.filter((p) => {
        if (p.client_id && selectedClientIds.includes(p.client_id)) return true;
        // Fallback for internal projects without client_id set directly
        if (!p.client_id && idyllClient && selectedClientIds.includes(idyllClient.id)) return true;
        return false;
      });
    }

    // Search query filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.client_name?.toLowerCase().includes(q)
      );
    }

    if (sortBy === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return list;
  }, [projects, selectedClientIds, idyllClient, search, sortBy]);

  // Group projects by client matching Screenshot L1 & L8, separating active and inactive
  const groupedByClient = useMemo(() => {
    const groups: {
      [key: string]: {
        clientName: string;
        clientId: string;
        isInternal: boolean;
        activeItems: ProjectItem[];
        inactiveItems: ProjectItem[];
      };
    } = {};

    filtered.forEach((p) => {
      const cId = p.client_id || (idyllClient?.id ?? "internal");
      const cName = p.client_name || "Idyll Productions";
      const isInternal = cName.toLowerCase().includes("idyll");

      if (!groups[cId]) {
        groups[cId] = {
          clientName: cName,
          clientId: cId,
          isInternal,
          activeItems: [],
          inactiveItems: [],
        };
      }
      if (p.status === "inactive") {
        groups[cId].inactiveItems.push(p);
      } else {
        groups[cId].activeItems.push(p);
      }
    });

    return Object.values(groups);
  }, [filtered, idyllClient]);

  // Permissions for Project Card Menu
  const permissions = useMemo(() => {
    return {
      canManageAccess: hasPermission("manage_access") || hasPermission("projects.manage_access"),
      canCreateProject: hasPermission("create_project") || hasPermission("projects.create"),
      canRenameProject: hasPermission("rename_project") || hasPermission("projects.rename"),
      canDeleteProject: hasPermission("delete_project") || hasPermission("projects.delete"),
    };
  }, [hasPermission]);

  // Actions
  const handleOpenProject = (proj: ProjectItem) => {
    router.push(`/library/${proj.id}`);
  };

  const handleDownloadProjectZip = async (project: ProjectItem) => {
    try {
      const manifestRes = await apiRequest<{
        files: any[];
        total_bytes: number;
        file_count: number;
        suggested_zip_name: string;
      }>(`/projects/${project.id}/download`);

      if (!manifestRes.files || manifestRes.files.length === 0) {
        toast.info("This project has no files to download");
        return;
      }

      const files: DownloadFile[] = manifestRes.files.map((f: any) => ({
        id: f.id,
        name: f.name,
        path: f.path || f.name,
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
        name: manifestRes.suggested_zip_name || `${project.name}.zip`,
        totalBytes: manifestRes.total_bytes,
        downloadedBytes: 0,
        speedBytesPerSec: 0,
        status: "downloading",
        files: progressFiles,
        mode: "zip",
      };

      setDownloadSession(newSession);
      downloadPausedRef.current = false;
      downloadCancelledRef.current = false;

      await startBrowserDownload({
        manifest: { files, total_bytes: manifestRes.total_bytes },
        mode: "zip",
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

  const handleDuplicateProject = async (project: ProjectItem) => {
    try {
      await apiRequest(`/projects/${project.id}/duplicate`, {
        method: "POST",
      });
      toast.success(`Duplicated "${project.name}"`);
      queryClient.invalidateQueries({ queryKey: ["library-projects"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate project");
    }
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!renameProject) return;
    try {
      await apiRequest(`/projects/${renameProject.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });
      toast.success("Project renamed");
      queryClient.invalidateQueries({ queryKey: ["library-projects"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to rename project");
      throw err;
    }
  };

  const handleToggleActiveProject = async (project: ProjectItem) => {
    const newStatus = project.status === "inactive" ? "active" : "inactive";
    try {
      await apiRequest(`/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(
        newStatus === "inactive"
          ? `Marked "${project.name}" as inactive`
          : `Marked "${project.name}" as active`
      );
      queryClient.invalidateQueries({ queryKey: ["library-projects"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update project status");
    }
  };

  const handleDeleteProject = async (project: ProjectItem) => {
    try {
      await apiRequest(`/projects/${project.id}`, {
        method: "DELETE",
      });
      toast.success(`Moved "${project.name}" to Trash`);
      queryClient.invalidateQueries({ queryKey: ["library-projects"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    }
  };

  // Handler to apply selected clients filter (updates state, URL, and server persistence)
  const handleApplyClientFilter = async (ids: string[]) => {
    setSelectedClientIds(ids);

    // 1. Sync to URL so filtered view can be shared
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (ids.length > 0) {
        url.searchParams.set("clients", ids.join(","));
      } else {
        url.searchParams.delete("clients");
      }
      window.history.replaceState({}, "", url.toString());
    }

    // 2. Persist to server per user so Library opens with same filter next time on any computer
    try {
      await apiRequest("/users/me/library-client-filter", {
        method: "PUT",
        body: JSON.stringify({ client_ids: ids }),
      });
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    } catch {
      // ignore
    }
  };

  const handleClearAllClients = () => {
    handleApplyClientFilter([]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching L1 & L8 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Library</h1>
          <p className="text-xs text-[var(--text-3)] mt-1">
            Every client project, folder and file.
          </p>
        </div>

        {hasPermission("projects.create") && (
          <button
            onClick={() => setShowNewProject(true)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] px-4 text-xs font-semibold text-[var(--button-text)] shadow transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            <span>New project</span>
          </button>
        )}
      </div>

      {/* Filter and Control Bar matching L7 & L8 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search projects */}
          <div className="flex h-9 w-64 items-center gap-2 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs text-[var(--text-3)] focus-within:border-[#4876F3] transition-colors">
            <Search size={15} className="text-[var(--text-3)] shrink-0" />
            <input
              type="text"
              placeholder="Search projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-white placeholder-[var(--text-3)] focus:outline-none text-xs"
            />
          </div>

          {/* "Select clients" Button (Groups Icon) matching L7 & L8 */}
          {!isClient && (
            <ClientFilterButton
              selectedClientIds={selectedClientIds}
              clients={clientOptions}
              onClick={() => setShowSelectClients(true)}
              onClearAll={handleClearAllClients}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
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
              onClick={() => setView("grid")}
              className={`p-1.5 rounded-[6px] transition-colors ${
                view === "grid" ? "bg-[var(--border)] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-[6px] transition-colors ${
                view === "list" ? "bg-[var(--border)] text-white" : "text-[var(--text-3)] hover:text-white"
              }`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Grouped by Client matching Screenshot L8 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[290px] rounded-[14px] bg-[var(--panel)] border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : groupedByClient.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4 rounded-[14px] border border-[var(--border)] bg-[var(--panel)]">
          <Folder size={36} className="text-[var(--text-3)] mb-2" />
          <h3 className="text-base font-semibold text-white">No projects found</h3>
          <p className="text-xs text-[var(--text-3)] mt-1">
            {search || selectedClientIds.length > 0
              ? "Try adjusting your filters or search."
              : "Create your first project to get started."}
          </p>
          {selectedClientIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllClients}
              className="mt-3 text-xs font-semibold text-[#4876F3] hover:underline cursor-pointer"
            >
              Show all clients
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8 pt-2">
          {groupedByClient.map((group) => {
            const clientInitial = group.clientName.trim()[0]?.toUpperCase() || "C";
            const badgeBg = group.isInternal ? "bg-[var(--panel-raised)] text-[var(--text-2)]" : "bg-[#4876F3]/20 text-[#4876F3]";
            const totalCount = group.activeItems.length + group.inactiveItems.length;

            return (
              <div key={group.clientId} className="space-y-4">
                {/* Client Section Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-xs font-bold ${badgeBg}`}>
                      {clientInitial}
                    </span>
                    <span className="text-sm font-semibold text-white">{group.clientName}</span>
                    <span className="text-xs text-[var(--text-3)]">
                      {group.isInternal ? "internal · " : ""}
                      {totalCount} {totalCount === 1 ? "project" : "projects"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (group.clientId && group.clientId !== "internal") {
                        handleApplyClientFilter([group.clientId]);
                      } else if (idyllClient) {
                        handleApplyClientFilter([idyllClient.id]);
                      }
                    }}
                    className="text-xs font-medium text-[var(--text-3)] hover:text-white transition-colors cursor-pointer"
                  >
                    View all
                  </button>
                </div>

                {/* Active Projects Grid */}
                {group.activeItems.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {group.activeItems.map((proj) => (
                      <ProjectCard
                        key={proj.id}
                        id={proj.id}
                        name={proj.name}
                        clientName={proj.client_name}
                        videoCount={proj.file_count || proj.video_count || 0}
                        totalBytes={proj.total_bytes || 0}
                        waitingReviewCount={proj.waiting_review_count || 0}
                        onOpenMenu={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuState({
                            isOpen: true,
                            project: proj,
                            anchorRect: rect,
                            clickPosition: null,
                          });
                        }}
                        onContextMenu={(e) => {
                          setMenuState({
                            isOpen: true,
                            project: proj,
                            anchorRect: null,
                            clickPosition: { x: e.clientX, y: e.clientY },
                          });
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Inactive Section at bottom of client group */}
                {group.inactiveItems.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
                        Inactive
                      </span>
                      <span className="text-xs text-[var(--text-3)]">
                        ({group.inactiveItems.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 opacity-75 hover:opacity-100 transition-opacity">
                      {group.inactiveItems.map((proj) => (
                        <ProjectCard
                          key={proj.id}
                          id={proj.id}
                          name={proj.name}
                          clientName={proj.client_name}
                          videoCount={proj.file_count || proj.video_count || 0}
                          totalBytes={proj.total_bytes || 0}
                          waitingReviewCount={proj.waiting_review_count || 0}
                          onOpenMenu={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuState({
                              isOpen: true,
                              project: proj,
                              anchorRect: rect,
                              clickPosition: null,
                            });
                          }}
                          onContextMenu={(e) => {
                            setMenuState({
                              isOpen: true,
                              project: proj,
                              anchorRect: null,
                              clickPosition: { x: e.clientX, y: e.clientY },
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Project Card Menu (⋯ or Right Click) */}
      {menuState.isOpen && menuState.project && (
        <ProjectCardMenu
          isOpen={menuState.isOpen}
          onClose={() =>
            setMenuState((prev) => ({
              ...prev,
              isOpen: false,
              project: null,
              anchorRect: null,
              clickPosition: null,
            }))
          }
          anchorRect={menuState.anchorRect}
          clickPosition={menuState.clickPosition}
          project={menuState.project}
          permissions={permissions}
          onOpen={() => handleOpenProject(menuState.project!)}
          onManageAccess={() => setManageAccessProject(menuState.project)}
          onCopyLink={() => setCopyLinkProject(menuState.project)}
          onDownloadZip={() => handleDownloadProjectZip(menuState.project!)}
          onDuplicate={() => handleDuplicateProject(menuState.project!)}
          onRename={() => setRenameProject(menuState.project)}
          onToggleActive={() => handleToggleActiveProject(menuState.project!)}
          onDelete={() => handleDeleteProject(menuState.project!)}
        />
      )}

      {/* Manage Access Dialog */}
      {manageAccessProject && (
        <ProjectManageAccessModal
          isOpen={!!manageAccessProject}
          onClose={() => setManageAccessProject(null)}
          projectId={manageAccessProject.id}
          projectName={manageAccessProject.name}
        />
      )}

      {/* Copy Link Dialog (L5 window) */}
      {copyLinkProject && (
        <CopyLinkDialog
          isOpen={!!copyLinkProject}
          onClose={() => setCopyLinkProject(null)}
          projectId={copyLinkProject.id}
          projectName={copyLinkProject.name}
          onOpenManageAccess={() => {
            const p = copyLinkProject;
            setCopyLinkProject(null);
            setManageAccessProject(p);
          }}
        />
      )}

      {/* Rename Project Dialog */}
      {renameProject && (
        <RenameProjectDialog
          isOpen={!!renameProject}
          onClose={() => setRenameProject(null)}
          projectName={renameProject.name}
          onRename={handleRenameSubmit}
        />
      )}

      {/* Download Tray (for streaming ZIP downloads) */}
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

      {/* Select Clients Window (L7) */}
      <SelectClientsModal
        open={showSelectClients}
        onClose={() => setShowSelectClients(false)}
        selectedClientIds={selectedClientIds}
        clients={clientOptions}
        onApply={handleApplyClientFilter}
      />

      {/* New Project Dialog */}
      {showNewProject && (
        <NewProjectDialog
          isOpen={showNewProject}
          onClose={() => {
            setShowNewProject(false);
            queryClient.invalidateQueries({ queryKey: ["library-projects"] });
          }}
          defaultClientId={selectedClientIds.length === 1 ? selectedClientIds[0] : ""}
        />
      )}
    </div>
  );
}
