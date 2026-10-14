"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const { user } = useAuth();

  const [showPeopleModal, setShowPeopleModal] = useState(false);
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [newPersonLevel, setNewPersonLevel] = useState("commenter");
  const [newPersonDownload, setNewPersonDownload] = useState(true);
  const [addPersonError, setAddPersonError] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  // Fetch project details (includes access_level, can_download, can_manage, folders)
  const { data, isLoading, error } = useQuery({
    queryKey: ["project-workspace", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}`),
    retry: false,
  });

  // Fetch people on this project
  const { data: peopleData } = useQuery({
    queryKey: ["project-people", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}/people`),
    enabled: showPeopleModal,
  });

  const addPersonMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/projects/${projectId}/people`, {
        method: "POST",
        body: JSON.stringify({
          email: newPersonEmail.trim(),
          level: newPersonLevel,
          can_download: newPersonDownload,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
      setNewPersonEmail("");
      setAddPersonError(null);
    },
    onError: (err: any) => {
      setAddPersonError(err?.error || "Failed to add person to project");
    },
  });

  const updatePersonMutation = useMutation({
    mutationFn: ({ personId, level, canDownload }: { personId: string; level?: string; canDownload?: boolean }) =>
      apiRequest(`/projects/${projectId}/people/${personId}`, {
        method: "PATCH",
        body: JSON.stringify({
          level,
          can_download: canDownload,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
    },
  });

  const removePersonMutation = useMutation({
    mutationFn: (personId: string) =>
      apiRequest(`/projects/${projectId}/people/${personId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-people", projectId] });
    },
  });

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function handleCopyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-xl bg-[#212121] border border-[#424344]" />
        <div className="h-96 rounded-xl bg-[#212121] border border-[#424344]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <h2 className="text-lg font-bold text-white">Project Not Found</h2>
        <p className="mt-1 text-sm text-[#9A9DA0]">
          This project does not exist or you do not have permission to view it.
        </p>
        <Link
          href="/projects"
          className="mt-4 rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  const project = data?.project;
  const accessLevel = data?.access_level;
  const canManage = data?.can_manage;
  const folders = data?.folders || [];
  const people = peopleData?.people || [];

  return (
    <div className="space-y-6">
      {/* Workspace Header per PROJECT_WORKSPACE.md */}
      <div className="rounded-xl border border-[#424344] bg-[#212121] p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#9A9DA0] mb-1">
              <Link href="/clients" className="hover:underline">
                Clients
              </Link>
              <span>/</span>
              <Link
                href={`/clients/${project.client_id}`}
                className="text-[#4876F3] font-medium hover:underline"
              >
                {project.client_name}
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {project.name}
              </h1>
              <span className="rounded bg-[#2E2F34] px-2 py-0.5 text-[10px] font-semibold text-[#9A9DA0] capitalize">
                Your Access: {accessLevel}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#9A9DA0]">
              {project.file_count || 0} files · {folders.length || project.folder_count || 0} folders · {formatBytes(project.total_bytes || 0)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Member Avatars button -> triggers People and Access Dialog */}
            <button
              onClick={() => setShowPeopleModal(true)}
              className="flex items-center gap-2 rounded-lg border border-[#424344] bg-[#2E2F34] px-3 py-1.5 text-xs text-white hover:border-[#686B6E] transition-colors"
            >
              <div className="flex -space-x-1.5 overflow-hidden">
                <span className="inline-block h-5 w-5 rounded-full bg-[#4876F3] text-[9px] font-bold text-center leading-5 text-white">
                  {user?.name ? user.name[0].toUpperCase() : "U"}
                </span>
                <span className="inline-block h-5 w-5 rounded-full bg-[#34A853] text-[9px] font-bold text-center leading-5 text-white">
                  +
                </span>
              </div>
              <span>People & Access</span>
            </button>

            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              className="rounded-lg border border-[#424344] bg-[#2E2F34] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#383a42] transition-colors"
            >
              {copiedLink ? "✓ Copied" : "Copy Link"}
            </button>

            {/* Share CTA */}
            <button
              onClick={() => setShowPeopleModal(true)}
              className="rounded-lg bg-[#4876F3] px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#3b66df] transition-colors"
            >
              Share
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Folder Tree */}
        <div className="rounded-xl border border-[#424344] bg-[#212121] p-4 h-fit space-y-3">
          <div className="text-xs font-bold text-[#9A9DA0] uppercase tracking-wider">
            Folders
          </div>
          <div className="space-y-1">
            {folders.length === 0 ? (
              <p className="text-xs text-[#747678] italic">No folders yet</p>
            ) : (
              folders.map((f: any) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white cursor-pointer transition-colors"
                >
                  <span>📁</span>
                  <span className="font-medium truncate">{f.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-[#424344] bg-[#212121] p-5">
            <h2 className="text-sm font-bold text-white mb-3">Folders & Files</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {folders.map((folder: any) => (
                <div
                  key={folder.id}
                  className="rounded-xl border border-[#424344] bg-[#2E2F34] p-4 hover:border-[#4876F3] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📁</span>
                    <div className="truncate">
                      <h3 className="text-xs font-bold text-white group-hover:text-[#4876F3] truncate">
                        {folder.name}
                      </h3>
                      <p className="text-[10px] text-[#9A9DA0]">
                        {folder.file_count || 0} files
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* People and Access Dialog */}
      {showPeopleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-[#424344] bg-[#212121] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#424344]/60">
              <div>
                <h3 className="text-base font-bold text-white">
                  People and Access
                </h3>
                <p className="text-xs text-[#9A9DA0]">
                  Project: {project.name}
                </p>
              </div>
              <button
                onClick={() => setShowPeopleModal(false)}
                className="text-[#9A9DA0] hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Add person form (Only if canManage is true) */}
            {canManage ? (
              <div className="space-y-3 rounded-lg bg-[#2E2F34] p-3.5 border border-[#424344]">
                <label className="block text-xs font-semibold text-white">
                  Add People by Email
                </label>
                {addPersonError && (
                  <div className="rounded bg-red-500/10 border border-red-500/30 p-2 text-xs text-red-400">
                    {addPersonError}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    placeholder="teammate@agency.com or client@brand.com"
                    value={newPersonEmail}
                    onChange={(e) => setNewPersonEmail(e.target.value)}
                    className="flex-1 rounded bg-[#212121] border border-[#424344] px-3 py-1.5 text-xs text-white placeholder-[#686B6E] focus:outline-none"
                  />
                  <select
                    value={newPersonLevel}
                    onChange={(e) => setNewPersonLevel(e.target.value)}
                    className="rounded bg-[#212121] border border-[#424344] px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="uploader">Uploader</option>
                    <option value="full">Full access</option>
                  </select>
                  <button
                    type="button"
                    disabled={!newPersonEmail.trim() || addPersonMutation.isPending}
                    onClick={() => addPersonMutation.mutate()}
                    className="rounded bg-[#4876F3] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3b66df] disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#9A9DA0]">
                  <input
                    type="checkbox"
                    checked={newPersonDownload}
                    onChange={(e) => setNewPersonDownload(e.target.checked)}
                    className="rounded border-[#424344]"
                  />
                  Can download video cuts and assets
                </label>
              </div>
            ) : (
              <div className="rounded bg-[#2E2F34]/50 p-3 text-xs text-[#9A9DA0]">
                You have {accessLevel} access. Only admins, managers, and people with Full access can manage members.
              </div>
            )}

            {/* People List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-medium text-[#9A9DA0] px-1">
                <span>Person</span>
                <span>Access Level</span>
              </div>

              {people.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#747678]">
                  No individual grants assigned yet. Team Admins and Managers have full access automatically.
                </div>
              ) : (
                people.map((person: any) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[#2E2F34] p-2.5 border border-[#424344]"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4876F3]/20 font-bold text-[#4876F3] text-xs">
                        {person.email.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-medium text-white truncate">
                          {person.user_name || person.email}
                        </span>
                        <span className="text-[10px] text-[#9A9DA0] truncate">
                          {person.email}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <>
                          <select
                            value={person.level}
                            onChange={(e) =>
                              updatePersonMutation.mutate({
                                personId: person.id,
                                level: e.target.value,
                              })
                            }
                            className="rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white focus:outline-none"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="commenter">Commenter</option>
                            <option value="uploader">Uploader</option>
                            <option value="full">Full access</option>
                          </select>
                          <button
                            onClick={() => removePersonMutation.mutate(person.id)}
                            className="text-xs text-red-400 hover:underline px-1"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-[#9A9DA0] capitalize">
                          {person.level}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#424344]/50">
              <button
                type="button"
                onClick={() => setShowPeopleModal(false)}
                className="rounded-lg bg-[#2E2F34] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#383a42]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
