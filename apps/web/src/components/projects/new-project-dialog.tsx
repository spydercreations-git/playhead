"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { X, Info, Folder, Loader2, Square, Clapperboard } from "@/components/ui/icon";
import { ClientAvatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";

export interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
  defaultClientId?: string;
  clientName?: string;
  onSuccess?: (newProject: any) => void;
  onClientCreatedPrompt?: () => void;
}

export function NewProjectDialog({
  isOpen,
  onClose,
  clientId: propClientId,
  defaultClientId,
  clientName: initialClientName,
  onSuccess,
  onClientCreatedPrompt,
}: NewProjectDialogProps) {
  const router = useRouter();
  const clientId = propClientId || defaultClientId || "";

  const [name, setName] = useState("");
  const [template, setTemplate] = useState<"blank" | "video">("blank");
  const [clientName, setClientName] = useState(initialClientName || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Fetch client details if name wasn't provided
  useEffect(() => {
    if (isOpen && clientId && !clientName) {
      apiRequest<{ client?: { name: string }; name?: string }>(`/clients/${clientId}`)
        .then((res) => {
          setClientName(res.client?.name || res.name || "Client");
        })
        .catch(() => {
          setClientName("Client");
        });
    } else if (initialClientName) {
      setClientName(initialClientName);
    }
  }, [isOpen, clientId, clientName, initialClientName]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setTemplate("blank");
      setError(null);
      setSubmitting(false);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (!name.trim() || !clientId || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        client_id: clientId,
        template: template, // "blank" or "video"
      };

      const res = await apiRequest<{ id?: string; project?: any }>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const newProj = res.project || res;
      onSuccess?.(newProj);
      onClose();

      const projId = newProj.id || res.id;
      if (projId) {
        router.push(`/projects/${projId}`);
      }
    } catch (err: any) {
      setError(err?.message || err?.error || "Failed to create project");
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isCreateDisabled = !name.trim() || submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[680px] h-[536px] max-w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl flex flex-col justify-between overflow-hidden select-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-7 pb-2 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white tracking-tight">New project</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[13px] text-[var(--text-3)] font-medium">in</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--panel-raised)] border border-[var(--border)] text-xs text-white">
                <ClientAvatar id={clientId} name={clientName} size={16} />
                <span className="font-semibold text-white truncate max-w-[240px]">
                  {clientName || "Client"}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors shrink-0"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mx-8 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-400 shrink-0">
            {error}
          </div>
        )}

        {/* Content Body */}
        <div className="px-8 py-3 flex-1 flex flex-col justify-center gap-5 overflow-hidden">
          {/* Project Name Field */}
          <div className="flex flex-col">
            <label className="block text-[13px] font-semibold text-[var(--text-2)] mb-2">
              Project name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              required
              autoFocus
              placeholder={clientName ? `e.g. ${clientName} campaign` : "e.g. November campaign"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreateDisabled) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              className="h-[52px] w-full rounded-xl bg-[var(--input)] border border-[var(--border)] px-4 text-[17px] text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
            />
          </div>

          {/* Start with Option Cards (Side by Side) */}
          <div className="flex flex-col">
            <div className="text-[13px] font-semibold text-[var(--text-2)] mb-2.5">
              Start with
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Option 1: Blank Project */}
              <div
                onClick={() => setTemplate("blank")}
                className={`group relative flex flex-col justify-between p-5 rounded-xl border h-[168px] transition-colors cursor-pointer select-none ${
                  template === "blank"
                    ? "border-[#4876F3] bg-[var(--panel-raised)] ring-1 ring-[#4876F3]"
                    : "border-[var(--border)] bg-[var(--panel-raised)]/50 hover:bg-[var(--panel-raised)] hover:border-[var(--border-strong)]"
                }`}
              >
                {/* Top Row: Icon + Checkbox */}
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[var(--hover)] flex items-center justify-center shrink-0">
                    <Square size={16} className="text-[var(--text-2)]" />
                  </div>
                  <Checkbox
                    checked={template === "blank"}
                    onCheckedChange={() => setTemplate("blank")}
                  />
                </div>

                {/* Bottom Row: Title + Tag + Description */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Blank project</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--hover)] text-xs font-semibold text-[var(--text-3)]">
                      Default
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-3)] mt-1">
                    Empty. Add your own folders.
                  </p>
                </div>
              </div>

              {/* Option 2: Video Project */}
              <div
                onClick={() => setTemplate("video")}
                className={`group relative flex flex-col justify-between p-5 rounded-xl border h-[168px] transition-colors cursor-pointer select-none ${
                  template === "video"
                    ? "border-[#4876F3] bg-[var(--panel-raised)] ring-1 ring-[#4876F3]"
                    : "border-[var(--border)] bg-[var(--panel-raised)]/50 hover:bg-[var(--panel-raised)] hover:border-[var(--border-strong)]"
                }`}
              >
                {/* Top Row: Icon + Checkbox */}
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[var(--hover)] flex items-center justify-center shrink-0">
                    <Clapperboard size={18} className="text-[var(--text-2)]" />
                  </div>
                  <Checkbox
                    checked={template === "video"}
                    onCheckedChange={() => setTemplate("video")}
                  />
                </div>

                {/* Bottom Row: Title + Folders preview chips */}
                <div>
                  <span className="text-sm font-semibold text-white">Video project</span>
                  <p className="text-xs text-[var(--text-3)] mt-1 mb-2">
                    Starts with two folders:
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs font-medium text-white">
                      <Folder size={14} className="text-[var(--text-2)]" />
                      <span>Raw files</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs font-medium text-white">
                      <Folder size={14} className="text-[var(--text-2)]" />
                      <span>Edited files</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-[var(--border)] bg-[var(--panel)] shrink-0">
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
            <Info size={16} className="text-[var(--text-3)] shrink-0" />
            <span>
              {template === "blank"
                ? "Starts empty. You can add folders any time."
                : "Creates the Raw files and Edited files folders."}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreateDisabled}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              <span>Create project</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
