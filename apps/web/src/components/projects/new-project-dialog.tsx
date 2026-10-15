"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

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

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [template, setTemplate] = useState<"blank" | "video_project">("video_project");
  const [people, setPeople] = useState<AssignedPerson[]>([]);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    apiRequest<{ clients: Client[] }>("/clients")
      .then((res) => {
        setClients(res.clients || []);
        if (!clientId && res.clients && res.clients.length > 0) {
          setClientId(res.clients[0].id);
        }
      })
      .catch(() => {});
  }, [isOpen, clientId]);

  if (!isOpen) return null;

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
      setLoading(true);
      setError(null);

      const payload = {
        name: name.trim(),
        client_id: clientId,
        template,
        people: people.filter((p) => p.email.trim().length > 0),
      };

      const project = await apiRequest<{ id: string }>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onClose();
      router.push(`/projects/${project.id}`);
    } catch (err: any) {
      setError(err?.error || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl border border-[#2E2F34] bg-[#212121] p-6 shadow-2xl max-h-[90vh] flex flex-col relative">
        <div className="flex items-center justify-between pb-4 border-b border-[#2E2F34]">
          <h2 className="text-base font-bold text-white">Create New Project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#9A9DA0]">
                Client <span className="text-red-400">*</span>
              </label>
              {onClientCreatedPrompt && (
                <button
                  type="button"
                  onClick={onClientCreatedPrompt}
                  className="text-xs font-semibold text-[#4876F3] hover:underline"
                >
                  + Create New Client
                </button>
              )}
            </div>
            <div className="relative">
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full h-10 rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] px-3.5 pr-9 text-xs text-white focus:border-[#4876F3] focus:outline-none appearance-none transition-colors"
              >
                <option value="" disabled>
                  Select a client...
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-[14px] h-[14px] text-[#7C7F87] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Template Choice */}
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-2">
              Project Template
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setTemplate("video_project")}
                className={`cursor-pointer rounded-[10px] border p-3 transition-colors ${
                  template === "video_project"
                    ? "border-[#4876F3] bg-[#4876F3]/10"
                    : "border-[#2E2F34] bg-[#2A2B30] hover:border-[#424344]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">
                    Video Project
                  </span>
                  {template === "video_project" && (
                    <span className="h-2 w-2 rounded-full bg-[#4876F3]" />
                  )}
                </div>
                <p className="text-[11px] text-[#9A9DA0]">
                  Pre-creates 4 default folders: Briefs, Raw footage, Edits, Deliverables.
                </p>
              </div>

              <div
                onClick={() => setTemplate("blank")}
                className={`cursor-pointer rounded-[10px] border p-3 transition-colors ${
                  template === "blank"
                    ? "border-[#4876F3] bg-[#4876F3]/10"
                    : "border-[#2E2F34] bg-[#2A2B30] hover:border-[#424344]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">Blank</span>
                  {template === "blank" && (
                    <span className="h-2 w-2 rounded-full bg-[#4876F3]" />
                  )}
                </div>
                <p className="text-[11px] text-[#9A9DA0]">
                  Starts empty with no default folders.
                </p>
              </div>
            </div>
          </div>

          {/* People Assignment */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-white">
                Assign People (Team & Clients)
              </label>
              <button
                type="button"
                onClick={handleAddPerson}
                className="text-xs font-semibold text-[#4876F3] hover:underline"
              >
                + Assign Person
              </button>
            </div>

            {people.length === 0 ? (
              <p className="text-[11px] text-[#7C7F87]">
                Admins and Managers have full access automatically. Assign team Editors or client emails here.
              </p>
            ) : (
              <div className="space-y-2">
                {people.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-[10px] bg-[#2A2B30] p-2 border border-[#2E2F34]"
                  >
                    <input
                      type="email"
                      required
                      placeholder="Email address"
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
                        className="h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] pl-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="commenter">Commenter</option>
                        <option value="uploader">Uploader</option>
                        <option value="full">Full access</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <label
                      title="Can download files"
                      className="flex items-center gap-1 text-[11px] text-[#9A9DA0] shrink-0 px-1"
                    >
                      <input
                        type="checkbox"
                        checked={p.can_download}
                        onChange={(e) =>
                          handleUpdatePerson(idx, "can_download", e.target.checked)
                        }
                        className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-[#4876F3]"
                      />
                      DL
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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2E2F34]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-[#9A9DA0] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-[10px] bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B66D6] disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
