"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectCard } from "@/components/cards/project-card";
import { ChevronDown, X, MoreHorizontal, Edit, Trash2, Camera } from "@/components/ui/icon";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { toast } from "@/lib/toast";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientId = params.id as string;
  const { hasPermission, isClient } = useAuth();

  const [activeTab, setActiveTab] = useState<"projects" | "contacts" | "notes">("projects");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
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

  // Picture crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const clientFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSelectClientFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "image/svg+xml") {
      setPictureError("SVG files are not supported for client pictures. Please use PNG, JPG, or WebP.");
      if (clientFileInputRef.current) clientFileInputRef.current.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setPictureError("Unsupported file format. Please upload a PNG, JPG, or WebP image.");
      if (clientFileInputRef.current) clientFileInputRef.current.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPictureError("Image exceeds 20 MB limit. Please choose a smaller image.");
      if (clientFileInputRef.current) clientFileInputRef.current.value = "";
      return;
    }
    setPictureError(null);
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    if (clientFileInputRef.current) clientFileInputRef.current.value = "";
  };

  const handleUploadClientPicture = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "client-picture.webp");
      await apiRequest(`/clients/${clientId}/picture`, {
        method: "POST",
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      setPictureError(err?.message || "Failed to upload client picture");
    } finally {
      setCropSrc(null);
    }
  };

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

  const resendContactMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest(`/contacts/${contactId}/resend`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invitation resent with new temporary password");
    },
    onError: (err: any) => {
      toast.error(err?.message || err?.error || "Failed to resend invitation");
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

  const deleteClientMutation = useMutation({
    mutationFn: () => apiRequest(`/clients/${clientId}`, { method: "DELETE" }),
    onSuccess: () => {
      router.push("/clients");
    },
  });

  if (isClient) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          You do not have access to view this client.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 rounded-xl bg-[var(--panel)] border border-[var(--border-strong)]" />
        <div className="h-64 rounded-xl bg-[var(--panel)] border border-[var(--border-strong)]" />
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
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <input
                ref={clientFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSelectClientFile}
              />
              {client?.logo_key?.Valid && client.logo_key.String ? (
                <img
                  src={client.logo_key.String}
                  alt={client?.name || "Client"}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover border border-[var(--border)]"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#4876F3]/20 text-xl font-bold text-[#4876F3]">
                  {client?.name ? client.name.slice(0, 2).toUpperCase() : "CL"}
                </div>
              )}
              {hasPermission("clients.update") && (
                <button
                  type="button"
                  onClick={() => clientFileInputRef.current?.click()}
                  title="Change client picture"
                  aria-label="Change client picture"
                  className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                >
                  <Camera className="w-5 h-5" />
                </button>
              )}
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
              <p className="mt-1 text-xs text-[var(--text-2)]">
                {projects.length} projects · {formatBytes(totalSize)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setShowEditClient(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--input)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--border)] transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>

            {/* ⋯ dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--input)] text-[var(--text-2)] hover:text-white transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMoreMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowMoreMenu(false)}
                  />
                  <div className="absolute right-0 top-10 z-40 w-44 rounded-xl border border-[var(--border)] bg-[var(--panel)] py-1 shadow-overlay">
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowEditClient(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-white hover:bg-[var(--input)] transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-[var(--input)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {hasPermission("projects.create") && (
              <button
                onClick={() => setShowNewProject(true)}
                className="rounded-lg bg-[#4876F3] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3B67E0] transition-colors"
              >
                + New Project
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-[var(--border)] gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("projects")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "projects"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[var(--text-2)] hover:text-white"
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "contacts"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[var(--text-2)] hover:text-white"
            }`}
          >
            Contacts ({contacts.length})
          </button>
          <button
            onClick={() => setActiveTab("notes")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "notes"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[var(--text-2)] hover:text-white"
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
            <span className="text-xs font-medium text-[var(--text-2)]">
              Showing {filteredProjects.length} projects
            </span>
            <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-[var(--border-strong)]"
              />
              Show archived
            </label>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--panel)]/50 p-12 text-center">
              <p className="text-xs text-[var(--text-2)]">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredProjects.map((p: any) => (
                <ProjectCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  clientName={client?.name || "Client"}
                  videoCount={p.video_count || 0}
                  totalBytes={p.total_bytes || 0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Contacts */}
      {activeTab === "contacts" && (
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Client Contacts</h3>
              <p className="text-xs text-[var(--text-2)]">
                Set default permissions that automatically apply to all projects of {client?.name}
              </p>
            </div>
            {hasPermission("clients.edit") && (
              <button
                onClick={() => setShowAddContact(true)}
                className="rounded-lg bg-[#4876F3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3B67E0]"
              >
                + Add Contact
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-[var(--panel-raised)] text-[var(--text-2)]">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 font-medium">Default Project Access</th>
                  <th className="py-2.5 px-3 font-medium">Can Download</th>
                  <th className="py-2.5 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[var(--text-2)]">
                      No contacts added yet.
                    </td>
                  </tr>
                ) : (
                  contacts.map((c: any) => (
                    <tr key={c.id} className="hover:bg-[var(--hover)]">
                      <td className="py-3 px-3 text-white font-medium">
                        {c.name}
                      </td>
                      <td className="py-3 px-3 text-[var(--text-2)]">{c.email}</td>
                      <td className="py-3 px-3">
                        <select
                          value={c.default_level}
                          onChange={(e) =>
                            updateContactMutation.mutate({
                              contactId: c.id,
                              level: e.target.value,
                            })
                          }
                          className="rounded bg-[var(--border)] border border-[var(--border-strong)] px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          <option value="none">None</option>
                          <option value="viewer">Viewer</option>
                          <option value="commenter">Commenter</option>
                          <option value="uploader">Uploader</option>
                          <option value="full">Full access</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <label className="flex items-center gap-1.5 text-xs text-[var(--text-2)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={c.can_download}
                            onChange={(e) =>
                              updateContactMutation.mutate({
                                contactId: c.id,
                                canDownload: e.target.checked,
                              })
                            }
                            className="rounded border-[var(--border-strong)]"
                          />
                          Allow download
                        </label>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {hasPermission("clients.edit") && (
                            <button
                              onClick={() => resendContactMutation.mutate(c.id)}
                              disabled={resendContactMutation.isPending}
                              className="text-xs text-[#3B67E0] hover:underline font-medium disabled:opacity-50"
                            >
                              Resend invite
                            </button>
                          )}
                          <button
                            onClick={() => removeContactMutation.mutate(c.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
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
        <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Client Notes</h3>
            {!isEditingNotes ? (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="rounded bg-[var(--border)] px-3 py-1 text-xs text-white hover:bg-[var(--border)]"
              >
                Edit Notes
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditingNotes(false)}
                  className="px-2 text-xs text-[var(--text-2)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveNotesMutation.mutate()}
                  disabled={saveNotesMutation.isPending}
                  className="rounded bg-[#4876F3] px-3 py-1 text-xs font-semibold text-white shadow hover:bg-[#3B67E0]"
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
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--border)] p-3 text-sm text-white focus:border-[#4876F3] focus:outline-none"
            />
          ) : (
            <div className="rounded-lg bg-[var(--border)]/50 border border-[var(--border-strong)] p-4 text-xs text-white min-h-[120px] whitespace-pre-wrap">
              {notesText || (
                <span className="text-[var(--text-2)]">
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
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-overlay space-y-4 relative">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-base font-bold text-white">
                Add Contact to {client?.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Sarah Connor"
                className="w-full h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                placeholder="contact@company.com"
                className="w-full h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Default Access to all projects
              </label>
              <div className="relative">
                <select
                  value={newContactLevel}
                  onChange={(e) => setNewContactLevel(e.target.value)}
                  className="w-full h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3.5 pr-9 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
                >
                  <option value="none">None (explicit project assignment only)</option>
                  <option value="viewer">Viewer</option>
                  <option value="commenter">Commenter</option>
                  <option value="uploader">Uploader</option>
                  <option value="full">Full access</option>
                </select>
                <ChevronDown className="w-[14px] h-[14px] text-[var(--text-3)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newContactDownload}
                  onChange={(e) => setNewContactDownload(e.target.checked)}
                  className="rounded border-[var(--border)] text-[#4876F3] focus:ring-[#4876F3]"
                />
                Allow downloading video cuts and source files
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-3.5 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-white rounded-[10px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newContactEmail.trim() || addContactMutation.isPending}
                onClick={() => addContactMutation.mutate()}
                className="rounded-[10px] bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3560D6] disabled:opacity-50 transition-colors"
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

      {/* Edit Client Modal */}
      <NewClientDialog
        isOpen={showEditClient}
        onClose={() => setShowEditClient(false)}
        initialData={
          client
            ? {
                id: client.id,
                name: client.name,
                website: client.website?.String || "",
                notes: client.notes?.String || "",
              }
            : undefined
        }
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["client-detail", clientId] });
        }}
      />

      {/* Delete Client Confirmation Modal */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Delete ${client?.name || "Client"}?`}
        description="This will permanently delete the client and all associated projects. This action cannot be undone."
        confirmLabel="Delete Client"
        variant="danger"
        onConfirm={() => deleteClientMutation.mutate()}
        loading={deleteClientMutation.isPending}
      />

      {pictureError && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-[#F0506E] text-white text-xs px-4 py-2.5 shadow-lg flex items-center gap-2 border border-rose-600">
          <span>{pictureError}</span>
          <button
            onClick={() => setPictureError(null)}
            className="p-1 hover:bg-white/20 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {cropSrc && (
        <ImageCropDialog
          isOpen={true}
          onClose={() => setCropSrc(null)}
          imageSrc={cropSrc}
          shape="square"
          title="Crop client picture"
          onCropComplete={handleUploadClientPicture}
        />
      )}
    </div>
  );
}
