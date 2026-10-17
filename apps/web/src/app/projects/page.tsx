"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { toast } from "@/lib/toast";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ProjectCard } from "@/components/cards/project-card";
import { Folder, ChevronDown, Lock } from "@/components/ui/icon";

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
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { user, company, isClient, hasPermission, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [dropTargetClientId, setDropTargetClientId] = useState<string | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{
    project: { id: string; name: string; clientId: string };
    targetClient: { id: string; name: string };
  } | null>(null);
  const [isMovingProject, setIsMovingProject] = useState(false);

  // Fetch client options for filter dropdown
  const { data: clientsData } = useQuery({
    queryKey: ["clients-options"],
    queryFn: () => apiRequest("/clients"),
  });
  const clientOptions = clientsData?.clients || [];

  // Fetch projects (server will filter according to user role / grants)
  const { data, isLoading } = useQuery<{ projects: ProjectItem[] }>({
    queryKey: ["projects-list", statusFilter, selectedClientId],
    queryFn: () => {
      let url = `/projects?status=${statusFilter}`;
      if (selectedClientId) url += `&client_id=${selectedClientId}`;
      return apiRequest<{ projects: ProjectItem[] }>(url);
    },
  });

  const projects = data?.projects || [];
  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const uniqueClientIds = Array.from(new Set(projects.map((p) => p.client_id).filter(Boolean)));
  const clientCount = uniqueClientIds.length || clientOptions.length;

  if (!authLoading && user && !company && !isClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-[#2A2B30] border border-[#2E2F34] flex items-center justify-center mb-4 text-[#A3A6AD]">
          <Folder className="w-8 h-8 text-[#A3A6AD]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Projects</h2>
        <p className="text-sm text-[#A3A6AD] max-w-md">
          Your account isn&apos;t part of a team yet. Ask an Admin to invite you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Projects
          </h1>
          <p className="text-xs text-[#A3A6AD] mt-0.5">
            {projects.length} {projects.length === 1 ? "project" : "projects"} across{" "}
            {clientCount} {clientCount === 1 ? "client" : "clients"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex h-9 items-center rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3 text-xs text-[#7C7F87] focus-within:border-[#4876F3] transition-colors">
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 bg-transparent text-white placeholder-[#7C7F87] focus:outline-none text-xs"
            />
          </div>

          {/* Client Filter */}
          {clientOptions.length > 0 && (
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="h-9 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-3 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
              >
                <option value="">All Clients</option>
                {clientOptions.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-3 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg bg-[#212121] border border-[#2E2F34] p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "grid"
                  ? "bg-[#2E2F34] text-white"
                  : "text-[#A3A6AD] hover:text-white"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "table"
                  ? "bg-[#2E2F34] text-white"
                  : "text-[#A3A6AD] hover:text-white"
              }`}
            >
              List
            </button>
          </div>

          {hasPermission("projects.create") && (
            <button
              onClick={() => setShowNewProject(true)}
              className="flex h-9 items-center justify-center rounded-lg bg-[#4876F3] hover:bg-[#3B67E0] px-4 text-xs font-semibold text-white shadow transition-colors"
            >
              + New Project
            </button>
          )}
        </div>
      </div>

      {/* Client Chips Row */}
      {clientOptions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedClientId("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
              selectedClientId === ""
                ? "bg-[#4876F3] text-white font-semibold shadow-sm"
                : "bg-[#212121] border border-[#2E2F34] text-[#A3A6AD] hover:text-white hover:border-[#424344]"
            }`}
          >
            All ({projects.length})
          </button>
          {clientOptions.map((client: any) => {
            const count = projects.filter((p) => p.client_id === client.id).length;
            const isSelected = selectedClientId === client.id;
            const isDropTarget = dropTargetClientId === client.id;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => setSelectedClientId(isSelected ? "" : client.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetClientId(client.id);
                }}
                onDragLeave={() => {
                  setDropTargetClientId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTargetClientId(null);
                  const raw = e.dataTransfer.getData("application/project");
                  if (raw) {
                    try {
                      const proj = JSON.parse(raw);
                      if (proj.clientId !== client.id) {
                        setMoveConfirm({ project: proj, targetClient: client });
                      }
                    } catch {}
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  isDropTarget
                    ? "ring-2 ring-[#4876F3] bg-[#4876F3]/30 text-white font-semibold scale-[1.015]"
                    : isSelected
                    ? "bg-[#4876F3] text-white font-semibold shadow-sm"
                    : "bg-[#212121] border border-[#2E2F34] text-[#A3A6AD] hover:text-white hover:border-[#424344]"
                }`}
              >
                <span>{client.name}</span>
                <span className={`text-xs ${isSelected || isDropTarget ? "text-white/80" : "text-[#7C7F87]"}`}>
                  {isDropTarget ? "Drop to move" : count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Projects List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl bg-[#212121] border border-[#424344] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#424344] bg-[#212121]/50 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E2F34] text-[#4876F3] mb-3">
            <Folder className="w-6 h-6 text-[#4876F3]" />
          </div>
          <h3 className="text-base font-semibold text-white">No projects found</h3>
          <p className="mt-1 text-xs text-[#A3A6AD] max-w-sm">
            {search
              ? "No projects matched your search query."
              : "No projects in this view yet."}
          </p>
          {hasPermission("projects.create") && !search && (
            <button
              onClick={() => setShowNewProject(true)}
              className="mt-4 rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B67E0]"
            >
              + Create First Project
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((project) => (
            <div
              key={project.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/project",
                  JSON.stringify({
                    id: project.id,
                    name: project.name,
                    clientId: project.client_id,
                  })
                );
              }}
              className="cursor-grab active:cursor-grabbing transition-opacity active:opacity-40"
            >
              <ProjectCard
                id={project.id}
                name={project.name}
                clientName={project.client_name || "Client"}
                videoCount={project.video_count || 0}
                totalBytes={project.total_bytes || 0}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#424344] bg-[#212121]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#424344] bg-[#2E2F34]/50 text-[#A3A6AD]">
              <tr>
                <th className="py-3 px-4 font-medium">Project</th>
                <th className="py-3 px-4 font-medium">Client</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Counts</th>
                <th className="py-3 px-4 font-medium">Size</th>
                <th className="py-3 px-4 font-medium">Last Activity</th>
                <th className="py-3 px-4 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#424344]/40">
              {filtered.map((project) => (
                <tr
                  key={project.id}
                  className="hover:bg-[#2E2F34]/40 transition-colors"
                >
                  <td className="py-3.5 px-4 font-semibold text-white">
                    <Link
                      href={`/projects/${project.id}`}
                      className="hover:text-[#4876F3] inline-flex items-center gap-1.5"
                    >
                      <span>{project.name}</span>
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 text-[#4876F3]">
                    {project.client_name}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded  font-bold ${
                        project.status === "archived"
                          ? "bg-[#424344] text-[#A3A6AD]"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#A3A6AD]">
                    {project.video_count || 0} videos, {project.file_count || 0} files, {project.folder_count || 0} folders
                  </td>
                  <td className="py-3.5 px-4 text-[#A3A6AD]">
                    {formatBytes(project.total_bytes || 0)}
                  </td>
                  <td className="py-3.5 px-4 text-[#A3A6AD]">
                    {formatDate(project.updated_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded bg-[#2E2F34] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4876F3]"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Move Project to Client Confirmation Modal */}
      {moveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl bg-[#212121] border border-[#2E2F34] p-6 shadow-overlay space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#4876F3]/20 border border-[#4876F3]/30 flex items-center justify-center text-[#4876F3]">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Move project to {moveConfirm.targetClient.name}?</h3>
                <p className="text-xs text-[#A3A6AD] mt-0.5">Moving "{moveConfirm.project.name}"</p>
              </div>
            </div>
            <p className="text-xs text-[#A3A6AD] leading-relaxed">
              This project will be moved under <span className="text-white font-medium">{moveConfirm.targetClient.name}</span>. Members with client-level access will be updated.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMoveConfirm(null)}
                className="px-4 py-2 rounded-lg bg-[#2A2B30] hover:bg-[#2E2F34] text-xs font-semibold text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMovingProject}
                onClick={async () => {
                  setIsMovingProject(true);
                  try {
                    await apiRequest(`/projects/${moveConfirm.project.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ client_id: moveConfirm.targetClient.id }),
                    });
                    queryClient.invalidateQueries({ queryKey: ["projects-list"] });
                    toast.success(`Moved "${moveConfirm.project.name}" to ${moveConfirm.targetClient.name}`);
                    setMoveConfirm(null);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to move project");
                  } finally {
                    setIsMovingProject(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#3B67E0] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors shadow"
              >
                {isMovingProject ? "Moving..." : "Move Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <NewProjectDialog
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        onClientCreatedPrompt={() => {
          setShowNewProject(false);
          setShowNewClient(true);
        }}
      />
      <NewClientDialog
        isOpen={showNewClient}
        onClose={() => setShowNewClient(false)}
        onSuccess={() => setShowNewProject(true)}
      />
    </div>
  );
}

