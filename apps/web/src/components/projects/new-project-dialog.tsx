"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  X,
  Folder,
  Film,
  FileSpreadsheet,
  Check,
  Plus,
  Loader2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import { NewClientDialog } from "@/components/clients/new-client-dialog";

interface Client {
  id: string;
  name: string;
}

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultClientId?: string;
  onClientCreatedPrompt?: () => void;
}

interface AssignedPerson {
  email: string;
  level: "viewer" | "commenter" | "uploader" | "full";
  can_download: boolean;
}

export function NewProjectDialog({
  isOpen,
  onClose,
  defaultClientId,
  onClientCreatedPrompt,
}: NewProjectDialogProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [template, setTemplate] = useState<"blank" | "video_project">("video_project");
  const [people, setPeople] = useState<AssignedPerson[]>([]);

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Setup Step State per Part C spec
  const [setupStep, setSetupStep] = useState<"form" | "setting_up">("form");
  const [completedFolders, setCompletedFolders] = useState(false);
  const [completedTracker, setCompletedTracker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSetupStep("form");
      setCompletedFolders(false);
      setCompletedTracker(false);
      setError(null);
      return;
    }

    setLoadingClients(true);
    apiRequest<{ clients: Client[] }>("/clients")
      .then((res) => {
        const clientList = res.clients || [];
        setClients(clientList);
        if (!clientId && clientList.length > 0) {
          setClientId(clientList[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, [isOpen, clientId]);

  function handleAddPerson() {
    setPeople([
      ...people,
      { email: "", level: "commenter", can_download: false },
    ]);
  }

  function handleUpdatePerson(
    index: number,
    field: keyof AssignedPerson,
    value: any
  ) {
    const next = [...people];
    next[index] = { ...next[index], [field]: value };
    setPeople(next);
  }

  function handleRemovePerson(index: number) {
    setPeople(people.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientId) return;

    try {
      setError(null);
      setSetupStep("setting_up");

      const payload = {
        name: name.trim(),
        client_id: clientId,
        template,
        people: people.filter((p) => p.email.trim().length > 0),
      };

      // Real project creation
      const project = await apiRequest<{
        id: string;
        folder_count?: number;
        tracker_item_id?: any;
      }>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Show real completion check marks (no fake delays)
      if (template === "video_project") {
        setCompletedFolders(true);
      }
      setCompletedTracker(true);

      // Brief transition before smoothly navigating
      setTimeout(() => {
        onClose();
        router.push(`/projects/${project.id}?new=1`);
      }, 200);
    } catch (err: any) {
      setError(err?.error || err?.message || "Failed to create project");
      setSetupStep("form");
    }
  }

  const dialogTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  const closeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.12, ease: "easeIn" as const };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={closeTransition}
          onClick={setupStep === "form" ? onClose : undefined}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={dialogTransition}
          className="relative z-10 w-full max-w-3xl rounded-2xl border border-[#2E2F34] bg-[#212121] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2F34] bg-[#212121]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4876F3]" />
              <h2 className="text-sm font-bold text-white">Create New Project</h2>
            </div>
            {setupStep === "form" && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Setup Animation Screen per Part C */}
          {setupStep === "setting_up" ? (
            <div className="py-16 px-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-[#4876F3]/10 border border-[#4876F3]/20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#4876F3] animate-spin" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  Setting up &ldquo;{name}&rdquo;
                </h3>
                <p className="text-xs text-[#9A9DA0]">
                  Configuring project structure and real-time collaboration tracker
                </p>
              </div>

              <div className="w-full max-w-sm rounded-xl border border-[#2E2F34] bg-[#2A2B30] p-4 space-y-3">
                {template === "video_project" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#D1D2D4] flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-[#4876F3]" />
                      <span>Creating folders (Briefs, Raw, Edits, Deliverables)</span>
                    </span>
                    {completedFolders ? (
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-[#9A9DA0] animate-spin" />
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#D1D2D4] flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Creating Tracker</span>
                  </span>
                  {completedTracker ? (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[#9A9DA0] animate-spin" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Frame.io-style 2-Column Form
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#2E2F34]">
                {/* Left Column: Template Cards (5 cols) */}
                <div className="md:col-span-5 p-6 space-y-4 bg-[#1E1E20]">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#7C7F87]">
                      1. Project Template
                    </label>
                    <p className="text-[11px] text-[#9A9DA0] mt-0.5">
                      Choose standard production workflow or a clean workspace.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Video Project Template */}
                    <div
                      onClick={() => setTemplate("video_project")}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        template === "video_project"
                          ? "border-[#4876F3] bg-[#4876F3]/10 shadow-[0_0_15px_rgba(72,118,243,0.15)]"
                          : "border-[#2E2F34] bg-[#2A2B30] hover:border-[#3E4048]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4 text-[#4876F3]" />
                          <span className="text-xs font-bold text-white">
                            Video Project
                          </span>
                        </div>
                        {template === "video_project" ? (
                          <div className="w-4 h-4 rounded-full bg-[#4876F3] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[#424344]" />
                        )}
                      </div>
                      <p className="text-[11px] text-[#9A9DA0] leading-relaxed">
                        Industry workflow: auto-creates 4 folders and a live production Tracker.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {["Briefs", "Raw footage", "Edits", "Deliverables"].map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 rounded bg-[#212121] px-1.5 py-0.5 text-[10px] text-[#D1D2D4] border border-[#2E2F34]"
                          >
                            <Folder className="w-2.5 h-2.5 text-[#4876F3]" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Blank Project Template */}
                    <div
                      onClick={() => setTemplate("blank")}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        template === "blank"
                          ? "border-[#4876F3] bg-[#4876F3]/10 shadow-[0_0_15px_rgba(72,118,243,0.15)]"
                          : "border-[#2E2F34] bg-[#2A2B30] hover:border-[#3E4048]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-zinc-400" />
                          <span className="text-xs font-bold text-white">
                            Blank Project
                          </span>
                        </div>
                        {template === "blank" ? (
                          <div className="w-4 h-4 rounded-full bg-[#4876F3] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[#424344]" />
                        )}
                      </div>
                      <p className="text-[11px] text-[#9A9DA0] leading-relaxed">
                        Start completely clean. You organize folders and assets as you go.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Project Details & People (7 cols) */}
                <div className="md:col-span-7 p-6 space-y-5 bg-[#212121]">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-[#7C7F87]">
                      2. Project Details
                    </label>
                  </div>

                  {/* Project Name */}
                  <div>
                    <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
                      Project Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. October UGC, Brand Campaign Q4"
                      className="w-full h-10 rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Client Select */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-[#9A9DA0]">
                        Client <span className="text-red-400">*</span>
                      </label>
                    </div>

                    <Select
                      value={clientId}
                      onChange={(val) => setClientId(val)}
                      options={clients.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      placeholder={loadingClients ? "Loading clients..." : "Select client..."}
                      actionButton={{
                        label: "+ Create New Client",
                        icon: <Plus className="w-3.5 h-3.5" />,
                        onClick: () => {
                          if (onClientCreatedPrompt) {
                            onClientCreatedPrompt();
                          } else {
                            setShowNewClientModal(true);
                          }
                        },
                      }}
                    />
                  </div>

                  {/* People Assignment */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="text-xs font-medium text-white">
                          People & Permissions
                        </label>
                        <p className="text-[11px] text-[#7C7F87]">
                          Admins & Managers have access. Invite editors or client reviewers below.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddPerson}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#4876F3] hover:text-[#3B66D6] shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>

                    {people.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-[#2E2F34] p-3 text-center text-xs text-[#7C7F87]">
                        No individual members assigned yet.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {people.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-[10px] bg-[#2A2B30] p-2 border border-[#2E2F34]"
                          >
                            <input
                              type="email"
                              required
                              placeholder="colleague@domain.com"
                              value={p.email}
                              onChange={(e) =>
                                handleUpdatePerson(idx, "email", e.target.value)
                              }
                              className="flex-1 h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] px-2.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                            />
                            <div className="relative">
                              <select
                                value={p.level}
                                onChange={(e) =>
                                  handleUpdatePerson(idx, "level", e.target.value)
                                }
                                className="h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] pl-2.5 pr-7 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none"
                              >
                                <option value="viewer">Viewer</option>
                                <option value="commenter">Commenter</option>
                                <option value="uploader">Uploader</option>
                                <option value="full">Full access</option>
                              </select>
                              <ChevronDown className="w-3 h-3 text-[#7C7F87] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <label
                              title="Can download files"
                              className="flex items-center gap-1 text-[11px] text-[#9A9DA0] shrink-0 px-1 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={p.can_download}
                                onChange={(e) =>
                                  handleUpdatePerson(idx, "can_download", e.target.checked)
                                }
                                className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-[#4876F3]"
                              />
                              <span>DL</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemovePerson(idx)}
                              className="p-1 text-[#7C7F87] hover:text-red-400 text-xs"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dialog Footer */}
              <div className="flex items-center justify-end gap-3 p-4 px-6 border-t border-[#2E2F34] bg-[#1E1E20]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-[#9A9DA0] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !clientId}
                  className="rounded-[10px] bg-[#4876F3] px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-[#3B66D6] disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <span>Create Project</span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>

      {/* Embedded New Client Dialog */}
      {showNewClientModal && (
        <NewClientDialog
          isOpen={showNewClientModal}
          onClose={() => setShowNewClientModal(false)}
          onSuccess={() => {
            setShowNewClientModal(false);
            apiRequest<{ clients: Client[] }>("/clients").then((res) => {
              if (res.clients) {
                setClients(res.clients);
                if (res.clients.length > 0) {
                  setClientId(res.clients[res.clients.length - 1].id);
                }
              }
            });
          }}
        />
      )}
    </>
  );
}
