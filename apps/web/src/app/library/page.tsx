"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/cards/project-card";
import { Search, ChevronDown, LayoutGrid, List, Plus, Folder } from "@/components/ui/icon";

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
  const queryClient = useQueryClient();
  const { user, company, isClient, hasPermission, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showNewProject, setShowNewProject] = useState(false);

  // Fetch client options for filter dropdown
  const { data: clientsData } = useQuery({
    queryKey: ["clients-options"],
    queryFn: () => apiRequest("/clients"),
  });
  const clientOptions = clientsData?.clients || [];

  // Fetch projects
  const { data, isLoading } = useQuery<{ projects: ProjectItem[] }>({
    queryKey: ["library-projects", selectedClientId],
    queryFn: () => {
      let url = "/projects?status=active";
      if (selectedClientId) url += `&client_id=${selectedClientId}`;
      return apiRequest<{ projects: ProjectItem[] }>(url);
    },
  });

  const projects = data?.projects || [];

  const filtered = useMemo(() => {
    let list = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.client_name?.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return list;
  }, [projects, search, sortBy]);

  // Group projects by client matching Screenshot L1
  const groupedByClient = useMemo(() => {
    const groups: { [key: string]: { clientName: string; clientId: string; isInternal: boolean; items: ProjectItem[] } } = {};

    filtered.forEach((p) => {
      const cId = p.client_id || "internal";
      const cName = p.client_name || "Idyll Productions";
      const isInternal = cName.toLowerCase().includes("idyll");

      if (!groups[cId]) {
        groups[cId] = {
          clientName: cName,
          clientId: cId,
          isInternal,
          items: [],
        };
      }
      groups[cId].items.push(p);
    });

    return Object.values(groups);
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Top Header matching L1 */}
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
            className="flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] px-4 text-xs font-semibold text-[var(--button-text)] shadow transition-all active:scale-95"
          >
            <Plus size={16} />
            <span>New project</span>
          </button>
        )}
      </div>

      {/* Filter and Control Bar matching L1 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
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

          {/* Client filter dropdown */}
          <div className="relative">
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="h-9 rounded-[10px] bg-[var(--input)] border border-[var(--border)] pl-3 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors cursor-pointer"
            >
              <option value="">Client: All clients</option>
              {clientOptions.map((c: any) => (
                <option key={c.id} value={c.id}>
                  Client: {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="text-[var(--text-3)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
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

      {/* Main Content: Grouped by Client matching Screenshot L1 */}
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
            {search ? "Try adjusting your search filters." : "Create your first project to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-8 pt-2">
          {groupedByClient.map((group) => {
            const clientInitial = group.clientName.trim()[0]?.toUpperCase() || "C";
            const badgeBg = group.isInternal ? "bg-[var(--panel-raised)] text-[var(--text-2)]" : "bg-[#4876F3]/20 text-[#4876F3]";

            return (
              <div key={group.clientId} className="space-y-3.5">
                {/* Client Section Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-xs font-bold ${badgeBg}`}>
                      {clientInitial}
                    </span>
                    <span className="text-sm font-semibold text-white">{group.clientName}</span>
                    <span className="text-xs text-[var(--text-3)]">
                      {group.isInternal ? "internal · " : ""}
                      {group.items.length} {group.items.length === 1 ? "project" : "projects"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedClientId(group.clientId === "internal" ? "" : group.clientId)}
                    className="text-xs font-medium text-[var(--text-3)] hover:text-white transition-colors"
                  >
                    View all
                  </button>
                </div>

                {/* Projects Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {group.items.map((proj) => (
                    <ProjectCard
                      key={proj.id}
                      id={proj.id}
                      name={proj.name}
                      clientName={proj.client_name}
                      videoCount={proj.file_count || proj.video_count || 0}
                      totalBytes={proj.total_bytes || 0}
                      waitingReviewCount={proj.waiting_review_count || 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Dialog */}
      {showNewProject && (
        <NewProjectDialog
          isOpen={showNewProject}
          onClose={() => {
            setShowNewProject(false);
            queryClient.invalidateQueries({ queryKey: ["library-projects"] });
          }}
          defaultClientId={selectedClientId}
        />
      )}
    </div>
  );
}
