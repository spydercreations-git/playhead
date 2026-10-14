"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

interface ClientOption {
  id: string;
  name: string;
}

interface PersonRow {
  email: string;
  level: string; // viewer, commenter, uploader, full
  can_download: boolean;
}

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultClientId?: string;
  onClientCreatedPrompt?: () => void;
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
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [template, setTemplate] = useState<"blank" | "video_project">("video_project");
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiRequest("/clients")
        .then((res) => {
          if (res.clients) {
            setClients(res.clients);
            if (!clientId && res.clients.length > 0) {
              setClientId(defaultClientId || res.clients[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, defaultClientId, clientId]);

  if (!isOpen) return null;

  function handleAddPerson() {
    setPeople([
      ...people,
      { email: "", level: "commenter", can_download: true },
    ]);
  }

  function handleUpdatePerson(index: number, field: keyof PersonRow, val: any) {
    const updated = [...people];
    updated[index] = { ...updated[index], [field]: val };
    setPeople(updated);
  }

  function handleRemovePerson(index: number) {
    setPeople(people.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!clientId) {
      setError("Please select a client");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        client_id: clientId,
        template,
        people: people.filter((p) => p.email.trim() !== ""),
      };

      const project = await apiRequest("/projects", {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl border border-[#424344] bg-[#212121] p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-[#424344]/60">
          <h2 className="text-lg font-bold text-white">Create New Project</h2>
          <button
            onClick={onClose}
            className="text-[#9A9DA0] hover:text-white text-lg p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-5">
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
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none"
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
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2 text-sm text-white focus:border-[#4876F3] focus:outline-none"
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
          </div>

          {/* Template Choice */}
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-2">
              Project Template
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setTemplate("video_project")}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  template === "video_project"
                    ? "border-[#4876F3] bg-[#4876F3]/10"
                    : "border-[#424344] bg-[#2E2F34] hover:border-[#686B6E]"
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
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  template === "blank"
                    ? "border-[#4876F3] bg-[#4876F3]/10"
                    : "border-[#424344] bg-[#2E2F34] hover:border-[#686B6E]"
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
              <p className="text-[11px] text-[#747678]">
                Admins and Managers have full access automatically. Assign team Editors or client emails here.
              </p>
            ) : (
              <div className="space-y-2.5">
                {people.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-lg bg-[#2E2F34] p-2.5 border border-[#424344]"
                  >
                    <input
                      type="email"
                      required
                      placeholder="Email address"
                      value={p.email}
                      onChange={(e) =>
                        handleUpdatePerson(idx, "email", e.target.value)
                      }
                      className="flex-1 rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white placeholder-[#686B6E] focus:outline-none"
                    />
                    <select
                      value={p.level}
                      onChange={(e) =>
                        handleUpdatePerson(idx, "level", e.target.value)
                      }
                      className="rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="commenter">Commenter</option>
                      <option value="uploader">Uploader</option>
                      <option value="full">Full access</option>
                    </select>
                    <label
                      title="Can download files"
                      className="flex items-center gap-1 text-[11px] text-[#9A9DA0] shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={p.can_download}
                        onChange={(e) =>
                          handleUpdatePerson(idx, "can_download", e.target.checked)
                        }
                        className="rounded border-[#424344]"
                      />
                      DL
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemovePerson(idx)}
                      className="text-[#9A9DA0] hover:text-red-400 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#424344]/60">
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
              className="rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3b66df] disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
