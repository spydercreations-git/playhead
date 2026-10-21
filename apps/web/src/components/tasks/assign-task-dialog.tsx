"use client";

import React, { useState, useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { TaskBriefEditor } from "./task-brief-editor";
import { SelectLibraryFileDialog } from "./select-library-file-dialog";
import {
  X,
  Calendar,
  Globe,
  FileText,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  Building2,
  FolderGit2,
} from "@/components/ui/icon";

interface ClientItem {
  id: string;
  name: string;
}

interface ProjectItem {
  id: string;
  name: string;
  client_id?: string;
}

interface LinkItem {
  title: string;
  url?: string;
  library_item_id?: string;
}

interface AssignTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}

export function AssignTaskDialog({
  open,
  onClose,
  onCreated,
}: AssignTaskDialogProps) {
  const { user, isClient } = useAuth();
  const [taskName, setTaskName] = useState("");
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [deadlineDate, setDeadlineDate] = useState<string>("");
  const [deadlineTime, setDeadlineTime] = useState<string>("18:00");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [descriptionTitle, setDescriptionTitle] = useState("Brief");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionJson, setDescriptionJson] = useState<any>(null);

  // Link addition popover
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setErrorMessage("");
    // Load clients
    apiRequest<{ clients: ClientItem[] }>("/clients")
      .then((res) => {
        const clList = res.clients || [];
        setClients(clList);
        if (clList.length > 0 && !selectedClientId) {
          setSelectedClientId(clList[0].id);
        }
      })
      .catch(() => {});

    // Load projects
    apiRequest<{ projects: ProjectItem[] }>("/projects")
      .then((res) => {
        setProjects(res.projects || []);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  function handleAddExternalLink() {
    if (!newLinkUrl.trim()) return;
    const trimmed = newLinkUrl.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setErrorMessage("Only HTTP and HTTPS links are allowed.");
      return;
    }
    if (links.length >= 15) {
      setErrorMessage("Maximum of 15 links allowed per task.");
      return;
    }
    const title = newLinkTitle.trim() || trimmed;
    setLinks((prev) => [...prev, { title, url: trimmed }]);
    setNewLinkTitle("");
    setNewLinkUrl("");
    setShowAddLink(false);
    setErrorMessage("");
  }

  function handleAddLibraryItem(item: { id: string; name: string }) {
    if (links.length >= 15) {
      setErrorMessage("Maximum of 15 links allowed per task.");
      return;
    }
    setLinks((prev) => [...prev, { title: item.name, library_item_id: item.id }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskName.trim()) {
      setErrorMessage("Task name is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    let combinedDeadline = "";
    if (deadlineDate) {
      combinedDeadline = `${deadlineDate}T${deadlineTime || "18:00"}:00Z`;
    }

    try {
      const payload: any = {
        name: taskName.trim(),
        client_id: selectedClientId || undefined,
        project_id: selectedProjectId || undefined,
        status: "Not started",
        deadline: combinedDeadline || undefined,
        description_title: descriptionTitle,
        description_html: descriptionHtml,
        description_json: descriptionJson,
        links: links,
      };

      const res = await apiRequest<{ id: string }>("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onCreated(res.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProjects = selectedClientId
    ? projects.filter((p) => !p.client_id || p.client_id === selectedClientId)
    : projects;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-white">Assign new task</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Idyll gets notified as soon as you create it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-[8px] bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Task Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Task name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Costco PR unboxing ad"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] px-3.5 py-2 text-sm text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Client & Deadline Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Client */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Client
              </label>
              {isClient ? (
                <div className="w-full bg-[var(--input)]/60 border border-[var(--border)] rounded-[8px] px-3 py-2 text-xs text-white flex items-center justify-between opacity-80 cursor-not-allowed">
                  <span>{clients[0]?.name || "Your company"}</span>
                  <Building2 className="w-3.5 h-3.5 text-[var(--text-3)]" />
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:border-[var(--primary)]"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[var(--panel-raised)]">
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] absolute right-3 top-2.5 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                Deadline
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={(e) => setDeadlineDate(e.target.value)}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-3 pr-2 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-24 bg-[var(--input)] border border-[var(--border)] rounded-[8px] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Status Row */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Status
            </label>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--input)] text-[var(--text-2)] border border-[var(--border)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-3)]" />
                Not started
              </span>
              <span className="text-[12px] text-[var(--text-3)]">
                Clients can't change the status.
              </span>
            </div>
          </div>

          {/* Links Row */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--text-2)]">
                Links <span className="text-[12px] text-[var(--text-3)] font-normal">({links.length} of 15)</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {links.map((link, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] group"
                >
                  {link.library_item_id ? (
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-[var(--text-3)]" />
                  )}
                  <span className="max-w-[150px] truncate">{link.title}</span>
                  <button
                    type="button"
                    onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-0.5 rounded text-[var(--text-3)] hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {links.length < 15 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAddLink(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs text-[var(--text-2)] hover:text-white bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add link
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilePicker(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs text-[var(--text-2)] hover:text-white bg-[var(--input)] hover:bg-[var(--hover)] border border-[var(--border)] transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    Select file from Playhead
                  </button>
                </div>
              )}
            </div>

            {/* Add External Link Popover */}
            {showAddLink && (
              <div className="mt-2 p-3 rounded-[8px] bg-[var(--panel)] border border-[var(--border)] space-y-2">
                <input
                  type="text"
                  placeholder="Link label (e.g. Raw footage Drive)"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1 text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1 text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddExternalLink}
                    className="px-3 py-1 bg-[var(--primary)] text-white text-xs font-medium rounded-[6px]"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddLink(false)}
                    className="px-2 py-1 text-xs text-[var(--text-3)] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Brief */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--text-2)] flex items-center gap-1.5">
                <span>{descriptionTitle}</span>
              </label>
            </div>
            <TaskBriefEditor
              initialContent={descriptionHtml}
              placeholder="Describe what you need: formats, length, references..."
              onChange={(html, json) => {
                setDescriptionHtml(html);
                setDescriptionJson(json);
              }}
            />
          </div>

          {/* Linked Project (Optional) */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Linked project <span className="text-[12px] text-[var(--text-3)] font-normal">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="" className="bg-[var(--panel-raised)]">
                  None
                </option>
                {filteredProjects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[var(--panel-raised)]">
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-xs font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-[8px] text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Assign task
            </button>
          </div>
        </form>
      </div>

      {/* Select file from Playhead modal */}
      <SelectLibraryFileDialog
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAddLibraryItem}
      />
    </div>
  );
}
