"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { motion, useReducedMotion } from "framer-motion";
import {
  X,
  Folder,
  Film,
  FileSpreadsheet,
  Check,
  Plus,
  Loader2,
  ChevronDown,
  Image as ImageIcon,
} from "@/components/ui/icon";
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
  const [personEmailInput, setPersonEmailInput] = useState("");

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Setup Step State
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
      setName("");
      setPeople([]);
      setPersonEmailInput("");
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

  function handleAddPersonEmail() {
    const trimmed = personEmailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (people.some((p) => p.email.toLowerCase() === trimmed)) {
      setPersonEmailInput("");
      return;
    }
    setPeople([...people, { email: trimmed, level: "commenter", can_download: false }]);
    setPersonEmailInput("");
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

      const project = await apiRequest<{
        id: string;
        folder_count?: number;
        tracker_item_id?: any;
      }>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (template === "video_project") {
        setCompletedFolders(true);
      }
      setCompletedTracker(true);

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

  const isCreateDisabled = !name.trim() || !clientId;

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
          className="relative z-10 w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-overlay overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--panel)]">
            <h2 className="text-base font-semibold text-white tracking-tight">
              New project
            </h2>
            {setupStep === "form" && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Setup Animation Screen */}
          {setupStep === "setting_up" ? (
            <div className="py-16 px-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-12 h-12 rounded-xl bg-[#4876F3]/10 border border-[#4876F3]/20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#4876F3] animate-spin" />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  Setting up &ldquo;{name}&rdquo;
                </h3>
                <p className="text-xs text-[var(--text-2)]">
                  Configuring project structure and real-time collaboration tracker
                </p>
              </div>

              <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--input)] p-4 space-y-3">
                {template === "video_project" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-2)] flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-[#4876F3]" />
                      <span>Creating folders (Briefs, Raw, Edits, Deliverables)</span>
                    </span>
                    {completedFolders ? (
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <Loader2 className="w-3.5 h-3.5 text-[var(--text-2)] animate-spin" />
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-2)] flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Creating Tracker</span>
                  </span>
                  {completedTracker ? (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[var(--text-2)] animate-spin" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Frame.io-style 2-Column Form
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
                {/* Left Column: Start with (5 cols) */}
                <div className="md:col-span-5 p-6 space-y-3.5 bg-[var(--bg)]">
                  <div className="text-[13px] font-medium text-[var(--text-2)]">
                    Start with
                  </div>

                  <div className="space-y-3">
                    {/* Video Project Template */}
                    <div
                      onClick={() => setTemplate("video_project")}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        template === "video_project"
                          ? "border-[#4876F3] bg-[#4876F3]/10"
                          : "border-[var(--border)] bg-[var(--input)] hover:border-[var(--border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center shrink-0">
                            <Film className="w-3.5 h-3.5 text-[#4876F3]" />
                          </div>
                          <span className="text-sm font-semibold text-white">
                            Video project
                          </span>
                        </div>
                        {template === "video_project" ? (
                          <div className="w-4 h-4 rounded-full bg-[#4876F3] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[var(--border-strong)]" />
                        )}
                      </div>
                      <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
                        Standard production workspace with folders and Tracker.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {["Briefs", "Raw footage", "Edits", "Deliverables"].map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 rounded bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--text-2)] border border-[var(--border)]"
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
                          ? "border-[#4876F3] bg-[#4876F3]/10"
                          : "border-[var(--border)] bg-[var(--input)] hover:border-[var(--border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center shrink-0">
                            <Folder className="w-3.5 h-3.5 text-zinc-400" />
                          </div>
                          <span className="text-sm font-semibold text-white">
                            Blank project
                          </span>
                        </div>
                        {template === "blank" ? (
                          <div className="w-4 h-4 rounded-full bg-[#4876F3] flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[var(--border-strong)]" />
                        )}
                      </div>
                      <p className="text-[13px] text-[var(--text-2)] leading-relaxed">
                        Clean workspace to organize your own way.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Preview Card, Client, People (7 cols) */}
                <div className="md:col-span-7 p-6 space-y-4 bg-[var(--panel)]">
                  {/* Preview Card with Cover + Input inside */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    {/* Dashed Add cover area */}
                    <div className="border border-dashed border-[var(--border)] rounded-lg py-5 px-4 flex items-center justify-center gap-2 text-[13px] text-[var(--text-3)] hover:border-[var(--border)] hover:text-[var(--text-2)] cursor-pointer transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      <span>Add cover (optional)</span>
                    </div>

                    {/* Project Name Input INSIDE Card */}
                    <div className="mt-3.5 pt-1">
                      <input
                        type="text"
                        required
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Project name"
                        className="w-full bg-transparent border-0 p-0 text-base font-medium text-white placeholder-[var(--text-3)] focus:outline-none focus:ring-0 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Client Select */}
                  <div>
                    <label className="block text-[13px] font-medium text-[var(--text-2)] mb-1.5">
                      Client
                    </label>
                    <Select
                      value={clientId}
                      onChange={(val) => setClientId(val)}
                      searchable
                      options={clients.map((c) => ({
                        value: c.id,
                        label: c.name,
                        icon: (
                          <div className="w-5 h-5 rounded bg-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--text-2)] shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                        ),
                      }))}
                      placeholder={loadingClients ? "Loading clients..." : "Select client..."}
                      actionButton={{
                        label: "+ Create new client",
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

                  {/* People Section */}
                  <div>
                    <label className="block text-[13px] font-medium text-[var(--text-2)] mb-1.5">
                      People
                    </label>

                    {/* Email Input Row */}
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        placeholder="Add team or client emails"
                        value={personEmailInput}
                        onChange={(e) => setPersonEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddPersonEmail();
                          }
                        }}
                        className="flex-1 h-9 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 text-xs text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleAddPersonEmail}
                        disabled={!personEmailInput.trim()}
                        className="h-9 px-3.5 rounded-[10px] bg-[var(--input)] border border-[var(--border)] text-xs font-medium text-white hover:bg-[var(--border)] disabled:opacity-40 transition-colors shrink-0"
                      >
                        Add
                      </button>
                    </div>

                    {/* Added People List or Grey Line */}
                    {people.length === 0 ? (
                      <p className="text-[13px] text-[var(--text-3)] mt-2">
                        Admins and Managers always have access.
                      </p>
                    ) : (
                      <div className="space-y-2 mt-2.5 max-h-36 overflow-y-auto pr-1">
                        {people.map((p, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-[10px] bg-[var(--input)] p-2 border border-[var(--border)]"
                          >
                            <span className="flex-1 text-xs text-white truncate pl-1">
                              {p.email}
                            </span>
                            <div className="relative">
                              <select
                                value={p.level}
                                onChange={(e) =>
                                  handleUpdatePerson(idx, "level", e.target.value)
                                }
                                className="h-7 rounded-[7px] bg-[var(--panel)] border border-[var(--border)] pl-2 pr-6 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none"
                              >
                                <option value="viewer">Viewer</option>
                                <option value="commenter">Commenter</option>
                                <option value="uploader">Uploader</option>
                                <option value="full">Full access</option>
                              </select>
                              <ChevronDown className="w-3 h-3 text-[var(--text-3)] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePerson(idx)}
                              className="p-1 text-[var(--text-3)] hover:text-red-400 text-xs transition-colors"
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
              <div className="flex items-center justify-between p-4 px-6 border-t border-[var(--border)] bg-[var(--bg)]">
                <div className="text-[13px] text-[var(--text-3)]">
                  {template === "video_project"
                    ? "Creates 4 folders and a Tracker sheet"
                    : ""}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-[14px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreateDisabled}
                    className="rounded-[10px] bg-[#3B67E0] hover:bg-[#3B67E0] px-5 py-2.5 text-[14px] font-medium text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    <span>Create project</span>
                  </button>
                </div>
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
