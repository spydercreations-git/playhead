"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { TaskBriefEditor } from "./task-brief-editor";
import { SelectLibraryFileDialog } from "./select-library-file-dialog";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import {
  X,
  Bell,
  Globe,
  FileText,
  Plus,
  Loader2,
  ChevronDown,
  Building2,
  VideoFileIcon,
} from "@/components/ui/icon";
import { ClientAvatar } from "@/components/ui/avatar";
import { EntityPicker } from "@/components/pickers/entity-picker";

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

// Deterministic client badge colors matching allowed design tokens
const CLIENT_COLORS = [
  "#3FCF8E", // Teal-green
  "#4876F3", // Blue
  "#9787FF", // Purple
  "#FA457B", // Pink
  "#FFD43B", // Amber
];

function getClientColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLIENT_COLORS[Math.abs(hash) % CLIENT_COLORS.length];
}

export function AssignTaskDialog({
  open,
  onClose,
  onCreated,
}: AssignTaskDialogProps) {
  const { isClient } = useAuth();
  const [taskName, setTaskName] = useState("");
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [deadlineIso, setDeadlineIso] = useState<string>("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionJson, setDescriptionJson] = useState<any>(null);

  // Custom Dropdowns open state
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  // Link addition popover
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Click outside listener for project dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(e.target as Node)
      ) {
        setProjectDropdownOpen(false);
      }
    }
    if (projectDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [projectDropdownOpen]);

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
    if (!selectedClientId) {
      setErrorMessage("Client is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const payload: any = {
        name: taskName.trim(),
        client_id: selectedClientId || undefined,
        project_id: selectedProjectId || undefined,
        status: "Not started",
        deadline: deadlineIso || undefined,
        description_title: "Brief",
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

  const selectedClient = clients.find((c) => c.id === selectedClientId) || clients[0];
  const filteredProjects = selectedClientId
    ? projects.filter((p) => !p.client_id || p.client_id === selectedClientId)
    : projects;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const isSubmitDisabled = !taskName.trim() || !selectedClientId || submitting;

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
      <div className="w-[1100px] max-w-[95vw] h-[790px] max-h-[94vh] rounded-[20px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl overflow-hidden flex flex-col">
        {/* Main 2-Column Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* LEFT COLUMN: Title, Subtitle, Task name, Brief Rich Editor */}
          <div className="flex-1 min-w-0 p-8 flex flex-col justify-between overflow-y-auto">
            {/* Top section: Title, Subtitle, Task Name */}
            <div className="space-y-6">
              <div>
                <h1 className="text-[28px] font-bold text-white tracking-tight leading-none">
                  Assign new task
                </h1>
                <p className="text-[15px] text-[var(--text-2)] mt-2">
                  Idyll gets notified as soon as you assign it.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-[10px] bg-red-500/10 border border-red-500/20 text-[13px] text-red-400">
                  {errorMessage}
                </div>
              )}

              {/* Task name input */}
              <div>
                <label className="text-[13px] font-medium text-[var(--text-2)] mb-2 block">
                  Task name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Costco PR unboxing ad"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="h-[54px] w-full rounded-[12px] bg-[var(--input)] border border-[var(--border)] px-4 text-[18px] font-semibold text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] focus:ring-1 focus:ring-[#4876F3] transition-all"
                />
              </div>

              {/* Brief Editor (tall rich text editor ~350px tall) */}
              <div>
                <div className="flex items-center mb-2">
                  <label className="text-[13px] font-medium text-[var(--text-2)]">
                    Brief
                  </label>
                  <span className="text-[13px] text-[var(--text-3)] ml-2.5">
                    What do you need? Formats, length, references.
                  </span>
                </div>
                <TaskBriefEditor
                  initialContent={descriptionHtml}
                  minHeight="350px"
                  placeholder="What do you need? Formats, length, references."
                  onChange={(html, json) => {
                    setDescriptionHtml(html);
                    setDescriptionJson(json);
                  }}
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: 380px, darker background, divider on left */}
          <div className="w-[380px] shrink-0 bg-[var(--bg)] border-l border-[var(--border)] px-6 py-6 flex flex-col space-y-5 overflow-y-auto relative">
            {/* Close button X */}
            <div className="flex items-center justify-end -mt-1 -mr-1 mb-1">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* CLIENT */}
            <div className="relative">
              <span className="text-[13px] font-semibold tracking-wider text-[var(--text-3)] block mb-2">
                CLIENT
              </span>

              {isClient ? (
                <div className="h-11 w-full rounded-[10px] bg-[var(--input)]/60 border border-[var(--border)] px-3.5 flex items-center justify-between text-[14px] text-white opacity-85 cursor-not-allowed">
                  <div className="flex items-center gap-2.5 truncate">
                    <ClientAvatar
                      id={selectedClient?.id}
                      name={selectedClient?.name || "Client"}
                      size={20}
                    />
                    <span className="truncate">{selectedClient?.name || "Your company"}</span>
                  </div>
                  <Building2 size={16} className="text-[var(--text-3)] shrink-0" />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClientPicker(true)}
                  className="h-11 w-full rounded-[10px] bg-[var(--input)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3.5 flex items-center justify-between text-[14px] text-white transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {selectedClient ? (
                      <ClientAvatar
                        id={selectedClient.id}
                        name={selectedClient.name}
                        size={20}
                      />
                    ) : null}
                    <span className="truncate">
                      {selectedClient?.name || "Select client"}
                    </span>
                  </div>
                  <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
                </button>
              )}
            </div>

            {/* DEADLINE */}
            <div>
              <span className="text-[13px] font-semibold tracking-wider text-[var(--text-3)] block mb-2">
                DEADLINE
              </span>
              <CustomDatePicker
                value={deadlineIso}
                onChange={(val) => setDeadlineIso(val)}
                placeholder="Select deadline"
              />
            </div>

            {/* LINKED PROJECT */}
            <div className="relative" ref={projectDropdownRef}>
              <span className="text-[13px] font-semibold tracking-wider text-[var(--text-3)] block mb-2">
                LINKED PROJECT
              </span>
              <button
                type="button"
                onClick={() => setProjectDropdownOpen((prev) => !prev)}
                className={`h-11 w-full rounded-[10px] bg-[var(--input)] border px-3.5 flex items-center justify-between text-[14px] text-white transition-all cursor-pointer ${
                  projectDropdownOpen
                    ? "border-[#4876F3] ring-1 ring-[#4876F3]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <VideoFileIcon size={16} className="text-[var(--text-3)] shrink-0" />
                  <span className="truncate">
                    {selectedProject ? selectedProject.name : "None"}
                  </span>
                </div>
                <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
              </button>

              {/* Connected Dropdown below field */}
              {projectDropdownOpen && (
                <div className="absolute top-full mt-1.5 left-0 w-full rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] py-1.5 shadow-xl z-50 max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId("");
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-[14px] transition-colors ${
                      !selectedProjectId
                        ? "bg-[#4876F3] text-white font-medium"
                        : "text-white hover:bg-[var(--hover)]"
                    }`}
                  >
                    <VideoFileIcon size={16} className="text-[var(--text-3)] shrink-0" />
                    <span>None</span>
                  </button>
                  {filteredProjects.map((p) => {
                    const isSelected = p.id === selectedProjectId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setProjectDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-[14px] transition-colors ${
                          isSelected
                            ? "bg-[#4876F3] text-white font-medium"
                            : "text-white hover:bg-[var(--hover)]"
                        }`}
                      >
                        <VideoFileIcon size={16} className="text-[var(--text-2)] shrink-0" />
                        <span className="truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LINKS */}
            <div>
              <div className="flex items-center mb-2">
                <span className="text-[13px] font-semibold tracking-wider text-[var(--text-3)]">
                  LINKS
                </span>
                <span className="text-[13px] font-normal text-[var(--text-3)] ml-2">
                  {links.length} of 15
                </span>
              </div>

              {/* Link Pills */}
              <div className="space-y-2 mb-3">
                {links.map((link, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-full bg-[var(--input)] border border-[var(--border)] text-[13px] text-white"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {link.library_item_id ? (
                        <FileText size={16} className="text-[#4876F3] shrink-0" />
                      ) : (
                        <Globe size={16} className="text-[var(--text-3)] shrink-0" />
                      )}
                      <span className="truncate">{link.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-0.5 rounded text-[var(--text-3)] hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add link buttons */}
              {links.length < 15 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddLink((prev) => !prev)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[8px] border border-dashed border-[var(--border-strong)] hover:border-white text-[13px] font-medium text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <Plus size={16} />
                    <span>Add link</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFilePicker(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[8px] border border-dashed border-[var(--border-strong)] hover:border-white text-[13px] font-medium text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <VideoFileIcon size={16} />
                    <span>From Library</span>
                  </button>
                </div>
              )}

              {/* Inline Add Link Form */}
              {showAddLink && (
                <div className="mt-2.5 p-3 rounded-[10px] bg-[#161618] border border-[var(--border)] space-y-2">
                  <input
                    type="text"
                    placeholder="Link label (e.g. Raw footage Drive)"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1.5 text-[13px] text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      className="flex-1 min-w-0 bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2.5 py-1.5 text-[13px] text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3]"
                    />
                    <button
                      type="button"
                      onClick={handleAddExternalLink}
                      className="shrink-0 px-3.5 py-1.5 bg-[#4876F3] text-white text-[13px] font-medium rounded-[6px] hover:bg-[#3B67E0] transition-colors cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddLink(false)}
                      className="shrink-0 px-2.5 py-1.5 text-[13px] text-[var(--text-3)] hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Starts as Not started box */}
            <div className="rounded-[10px] bg-[#161618] border border-[var(--border)] p-3.5 flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-[var(--text-3)] mt-1.5 shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-white leading-tight">
                  Starts as Not started
                </p>
                <p className="text-[13px] text-[var(--text-3)] mt-1 leading-snug">
                  Idyll updates the status as work moves.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="h-[72px] px-8 border-t border-[var(--border)] flex items-center justify-between bg-[var(--panel-raised)] shrink-0">
          {/* Real staff notification notice */}
          <div className="flex items-center gap-2.5 text-[13px] text-[var(--text-2)]">
            <Bell size={16} className="text-[var(--text-3)]" />
            <span>Rohit and Harsh will be notified.</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[14px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="h-[44px] px-6 rounded-[10px] bg-[#4876F3] hover:bg-[#3B67E0] disabled:opacity-40 disabled:cursor-not-allowed text-[14px] font-semibold text-white transition-colors flex items-center gap-2 shadow-sm"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              <span>Assign task</span>
            </button>
          </div>
        </div>
      </div>

      {/* Select file from Playhead modal */}
      <SelectLibraryFileDialog
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAddLibraryItem}
      />

      {/* Choose a Client Modal (P3) */}
      <EntityPicker
        isOpen={showClientPicker}
        onClose={() => setShowClientPicker(false)}
        tabs={["clients"]}
        mode="single"
        title="Choose a client"
        subtitle="The task will belong to this client."
        primaryButtonText="Continue"
        preselectedIds={selectedClientId ? [selectedClientId] : []}
        onConfirm={(entities) => {
          if (entities.length > 0) {
            setSelectedClientId(entities[0].id);
          }
        }}
      />
    </div>,
    document.body
  );
}
