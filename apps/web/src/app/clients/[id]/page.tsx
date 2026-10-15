"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ChevronDown, X } from "lucide-react";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientId = params.id as string;
  const { hasPermission, isClient } = useAuth();

  const [activeTab, setActiveTab] = useState<"projects" | "contacts" | "notes">("projects");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // New contact modal state
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactLevel, setNewContactLevel] = useState("none");
  const [newContactDownload, setNewContactDownload] = useState(true);

  // Notes state
  const [notesText, setNotesText] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const res = await apiRequest(`/clients/${clientId}`);
      if (res.client?.notes?.Valid) {
        setNotesText(res.client.notes.String);
      }
      return res;
    },
    enabled: !isClient && hasPermission("clients.view_all"),
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ contactId, level, canDownload }: { contactId: string; level?: string; canDownload?: boolean }) =>
      apiRequest(`/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({
          default_level: level,
          can_download: canDownload,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
    },
  });

  const removeContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest(`/contacts/${contactId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/clients/${clientId}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          name: newContactName.trim(),
          email: newContactEmail.trim(),
          default_level: newContactLevel,
          can_download: newContactDownload,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
      setShowAddContact(false);
      setNewContactName("");
      setNewContactEmail("");
      setNewContactLevel("none");
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesText }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
      setIsEditingNotes(false);
    },
  });

  if (isClient) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="mt-1 text-sm text-[#9A9DA0]">
          You do not have access to view this client.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-xl bg-[#212121] border border-[#424344]" />
        <div className="h-64 rounded-xl bg-[#212121] border border-[#424344]" />
      </div>
    );
  }

  const client = data?.client;
  const contacts = data?.contacts || [];
  const projects = data?.projects || [];

  const filteredProjects = projects.filter((p: any) =>
    showArchived ? true : p.status !== "archived"
  );

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  const totalSize = projects.reduce(
    (acc: number, p: any) => acc + (p.total_bytes || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="rounded-xl border border-[#424344] bg-[#212121] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#4876F3]/20 text-xl font-bold text-[#4876F3]">
              {client?.name ? client.name.slice(0, 2).toUpperCase() : "CL"}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {client?.name}
                </h1>
                {client?.website?.Valid && (
                  <a
                    href={client.website.String}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#4876F3] hover:underline"
                  >
                    {client.website.String} ↗
                  </a>
                )}
              </div>
              <p className="mt-1 text-xs text-[#9A9DA0]">
                {projects.length} projects · {formatBytes(totalSize)}
              </p>
            </div>
          </div>

          {hasPermission("projects.create") && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewProject(true)}
                className="rounded-lg bg-[#4876F3] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3b66df] transition-colors"
              >
                + New Project
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-[#424344]/50 gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("projects")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "projects"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[#9A9DA0] hover:text-white"
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "contacts"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[#9A9DA0] hover:text-white"
            }`}
          >
            Contacts ({contacts.length})
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "notes"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[#9A9DA0] hover:text-white"
            }`}
          >
            Notes
          </button>
        </div>
      </div>

      {/* Tab: Projects */}
      {activeTab === "projects" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9A9DA0]">
              Showing {filteredProjects.length} projects
            </span>
            <label className="flex items-center gap-2 text-xs text-[#9A9DA0] cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-[#424344]"
              />
              Show archived
            </label>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#424344] bg-[#212121]/50 p-12 text-center">
              <p className="text-xs text-[#9A9DA0]">
                No projects found for this client.
              </p>
              <button
                onClick={() => setShowNewProject(true)}
                className="mt-3 rounded-lg bg-[#4876F3] px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                + Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="rounded-xl border border-[#424344] bg-[#212121] p-5 hover:border-[#686B6E] transition-all hover:shadow-md block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-white truncate">
                      {p.name}
                    </h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        p.status === "archived"
                          ? "bg-[#424344] text-[#9A9DA0]"
                          : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#9A9DA0]">
                    {p.file_count || 0} files · {p.folder_count || 0} folders · {formatBytes(p.total_bytes || 0)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Contacts */}
      {activeTab === "contacts" && (
        <div className="rounded-xl border border-[#424344] bg-[#212121] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Client Contacts</h3>
              <p className="text-xs text-[#9A9DA0]">
                Set default permissions that automatically apply to all projects of {client?.name}
              </p>
            </div>
            {hasPermission("clients.edit") && (
              <button
                onClick={() => setShowAddContact(true)}
                className="rounded-lg bg-[#4876F3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3b66df]"
              >
                + Add Contact
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-[#424344]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#424344] bg-[#2E2F34] text-[#9A9DA0]">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 font-medium">Default Project Access</th>
                  <th className="py-2.5 px-3 font-medium">Can Download</th>
                  <th className="py-2.5 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#424344]/40">
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#747678]">
                      No contacts added yet.
                    </td>
                  </tr>
                ) : (
                  contacts.map((c: any) => (
                    <tr key={c.id} className="hover:bg-[#2E2F34]/30">
                      <td className="py-3 px-3 text-white font-medium">
                        {c.name}
                      </td>
                      <td className="py-3 px-3 text-[#9A9DA0]">{c.email}</td>
                      <td className="py-3 px-3">
                        <select
                          value={c.default_level}
                          onChange={(e) =>
                            updateContactMutation.mutate({
                              contactId: c.id,
                              level: e.target.value,
                            })
                          }
                          className="rounded bg-[#2E2F34] border border-[#424344] px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          <option value="none">None</option>
                          <option value="viewer">Viewer</option>
                          <option value="commenter">Commenter</option>
                          <option value="uploader">Uploader</option>
                          <option value="full">Full access</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <label className="flex items-center gap-1.5 text-xs text-[#9A9DA0] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={c.can_download}
                            onChange={(e) =>
                              updateContactMutation.mutate({
                                contactId: c.id,
                                canDownload: e.target.checked,
                              })
                            }
                            className="rounded border-[#424344]"
                          />
                          Allow download
                        </label>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => removeContactMutation.mutate(c.id)}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === "notes" && (
        <div className="rounded-xl border border-[#424344] bg-[#212121] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Client Notes</h3>
            {!isEditingNotes ? (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="rounded bg-[#2E2F34] px-3 py-1 text-xs text-white hover:bg-[#383a42]"
              >
                Edit Notes
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="px-2 text-xs text-[#9A9DA0] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                  className="rounded bg-[#4876F3] px-3 py-1 text-xs font-semibold text-white shadow hover:bg-[#3b66df]"
                >
                  Save Notes
                </button>
              </div>
            )}
          </div>

          {isEditingNotes ? (
            <textarea
              rows={8}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Record agency client briefing, video format preferences, feedback contacts..."
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] p-3 text-sm text-white focus:border-[#4876F3] focus:outline-none"
            />
          ) : (
            <div className="rounded-lg bg-[#2E2F34]/50 border border-[#424344] p-4 text-xs text-white min-h-[120px] whitespace-pre-wrap">
              {notesText || (
                <span className="text-[#747678]">
                  No notes recorded yet. Click &quot;Edit Notes&quot; to write instructions and preferences.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-[#2E2F34] bg-[#212121] p-6 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2E2F34]">
              <h3 className="text-base font-bold text-white">
                Add Contact to {client?.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Sarah Connor"
                className="w-full h-10 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                placeholder="sarah@everygen.com"
                className="w-full h-10 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
                Default Access to all projects
              </label>
              <div className="relative">
                <select
                  value={newContactLevel}
                  onChange={(e) => setNewContactLevel(e.target.value)}
                  className="w-full h-10 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3.5 pr-9 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
                >
                  <option value="none">None (explicit project assignment only)</option>
                  <option value="viewer">Viewer</option>
                  <option value="commenter">Commenter</option>
                  <option value="uploader">Uploader</option>
                  <option value="full">Full access</option>
                </select>
                <ChevronDown className="w-[14px] h-[14px] text-[#7C7F87] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-[#9A9DA0] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newContactDownload}
                  onChange={(e) => setNewContactDownload(e.target.checked)}
                  className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-[#4876F3]"
                />
                Allow downloading video cuts and source files
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#2E2F34]">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-3.5 py-2 text-xs font-semibold text-[#9A9DA0] hover:text-white rounded-[10px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newContactEmail.trim() || addContactMutation.isPending}
                onClick={() => addContactMutation.mutate()}
                className="rounded-[10px] bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B66D6] disabled:opacity-50 transition-colors"
              >
                {addContactMutation.isPending ? "Adding..." : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal with pre-selected client */}
      <NewProjectDialog
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        defaultClientId={clientId}
      />
    </div>
  );
}
