"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewClientDialog } from "@/components/clients/new-client-dialog";

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
  const { canCreateClientOrProject } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Projects
          </h1>
          <p className="text-xs text-[#9A9DA0]">
            Review, collaborate, and track video production projects
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex h-9 items-center rounded-lg bg-[#212121] border border-[#424344] px-3 text-xs text-[#9A9DA0]">
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-36 bg-transparent text-white placeholder-[#686B6E] focus:outline-none"
            />
          </div>

          {/* Client Filter */}
          {clientOptions.length > 0 && (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="h-9 rounded-lg bg-[#212121] border border-[#424344] px-2.5 text-xs text-white focus:outline-none"
            >
              <option value="">All Clients</option>
              {clientOptions.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg bg-[#212121] border border-[#424344] px-2.5 text-xs text-white focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg bg-[#212121] border border-[#424344] p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "grid"
                  ? "bg-[#2E2F34] text-white"
                  : "text-[#9A9DA0] hover:text-white"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "table"
                  ? "bg-[#2E2F34] text-white"
                  : "text-[#9A9DA0] hover:text-white"
              }`}
            >
              List
            </button>
          </div>

          {canCreateClientOrProject && (
            <button
              onClick={() => setShowNewProject(true)}
              className="flex h-9 items-center justify-center rounded-lg bg-[#4876F3] px-4 text-xs font-semibold text-white shadow hover:bg-[#3b66df] transition-colors"
            >
              + New Project
            </button>
          )}
        </div>
      </div>

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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#424344] bg-[#212121]/50 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2E2F34] text-[#4876F3] mb-3">
            📁
          </div>
          <h3 className="text-base font-semibold text-white">No projects found</h3>
          <p className="mt-1 text-xs text-[#9A9DA0] max-w-sm">
            {search
              ? "No projects matched your search query."
              : "No projects in this view yet."}
          </p>
          {canCreateClientOrProject && !search && (
            <button
              onClick={() => setShowNewProject(true)}
              className="mt-4 rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3b66df]"
            >
              + Create First Project
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex flex-col justify-between rounded-xl border border-[#424344] bg-[#212121] p-5 hover:border-[#686B6E] hover:shadow-xl transition-all"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-[#4876F3] truncate uppercase tracking-wider">
                    {project.client_name || "Client"}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                      project.status === "archived"
                        ? "bg-[#424344] text-[#9A9DA0]"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-[#4876F3] transition-colors truncate">
                  {project.name}
                </h3>

                <p className="mt-2 text-xs text-[#9A9DA0]">
                  {project.file_count || 0} files · {project.folder_count || 0} folders · {formatBytes(project.total_bytes || 0)}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-[#424344]/50 flex items-center justify-between text-xs text-[#9A9DA0]">
                <span>Updated {formatDate(project.updated_at)}</span>
                <span className="font-semibold text-white group-hover:translate-x-0.5 transition-transform">
                  Open →
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#424344] bg-[#212121]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#424344] bg-[#2E2F34]/50 text-[#9A9DA0]">
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
                      className="hover:text-[#4876F3]"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 text-[#4876F3]">
                    {project.client_name}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        project.status === "archived"
                          ? "bg-[#424344] text-[#9A9DA0]"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-[#9A9DA0]">
                    {project.file_count || 0} files, {project.folder_count || 0} folders
                  </td>
                  <td className="py-3.5 px-4 text-[#9A9DA0]">
                    {formatBytes(project.total_bytes || 0)}
                  </td>
                  <td className="py-3.5 px-4 text-[#9A9DA0]">
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
