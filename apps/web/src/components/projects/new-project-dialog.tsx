"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { X, Image as ImageIcon, Info, Folder, Loader2 } from "@/components/ui/icon";
import { ClientAvatar } from "@/components/ui/avatar";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

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
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setCoverUrl(null);
      setCoverFile(null);
      setError(null);
      setSubmitting(false);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

  const handleSelectCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError("Cover image exceeds 20 MB limit.");
      return;
    }

    setCoverFile(file);
    setShowCropDialog(true);
    e.target.value = "";
  };

  const handleCropComplete = async (croppedBlob: Blob, croppedDataUrl: string) => {
    setCoverUrl(croppedDataUrl);
    setShowCropDialog(false);
  };

  const handleRemoveCover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCoverUrl(null);
    setCoverFile(null);
  };

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
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-[880px] h-[600px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl flex flex-col overflow-hidden select-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between px-8 pt-7 pb-4">
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-white tracking-tight">New project</h2>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[13px] text-[var(--text-3)] font-medium">in</span>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--panel-raised)] border border-[var(--border)] text-xs text-white">
                  <ClientAvatar id={clientId} name={clientName} size={16} />
                  <span className="font-semibold text-white truncate max-w-[200px]">
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
            <div className="mx-8 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {/* Two-Column Body */}
          <div className="flex-1 grid grid-cols-2 gap-8 px-8 py-2 overflow-hidden">
            {/* LEFT COLUMN: Start with */}
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-[var(--text-2)] mb-3">
                Start with
              </span>

              <div className="space-y-3">
                {/* 1. Blank project (Default) */}
                <div
                  onClick={() => setTemplate("blank")}
                  className={`group relative flex items-start justify-between p-4 rounded-xl border transition-colors cursor-pointer ${
                    template === "blank"
                      ? "border-[var(--accent)] bg-[var(--panel-raised)]"
                      : "border-[var(--border)] bg-[var(--panel-raised)]/50 hover:bg-[var(--panel-raised)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-start gap-3.5 pr-4">
                    <div className="w-9 h-9 rounded-lg bg-[var(--hover)] flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-4 h-4 rounded-[3px] border border-[var(--text-2)]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Blank project</span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--hover)] text-xs font-semibold text-[var(--text-3)]">
                          Default
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--text-3)] mt-0.5">
                        An empty project. Add your own folders.
                      </p>
                    </div>
                  </div>

                  {/* Radio tick indicator */}
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 transition-colors ${
                      template === "blank"
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border-strong)] bg-transparent"
                    }`}
                  >
                    {template === "blank" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>

                {/* 2. Video project */}
                <div
                  onClick={() => setTemplate("video")}
                  className={`group relative flex items-start justify-between p-4 rounded-xl border transition-colors cursor-pointer ${
                    template === "video"
                      ? "border-[var(--accent)] bg-[var(--panel-raised)]"
                      : "border-[var(--border)] bg-[var(--panel-raised)]/50 hover:bg-[var(--panel-raised)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-start gap-3.5 pr-4">
                    <div className="w-9 h-9 rounded-lg bg-[var(--hover)] flex items-center justify-center shrink-0 mt-0.5">
                      <Folder size={18} className="text-[var(--text-2)]" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-white">Video project</span>
                      <p className="text-[13px] text-[var(--text-3)] mt-0.5">
                        Starts with two folders:
                      </p>

                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs font-medium text-white">
                          <Folder size={14} className="text-[var(--text-2)]" />
                          <span>Raw files</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs font-medium text-white">
                          <Folder size={14} className="text-[var(--text-2)]" />
                          <span>Edited files</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Radio tick indicator */}
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-1 transition-colors ${
                      template === "video"
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border-strong)] bg-transparent"
                    }`}
                  >
                    {template === "video" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Cover & Project Name */}
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[13px] font-semibold text-[var(--text-2)]">Cover</span>
                <span className="text-[13px] text-[var(--text-3)]">Optional</span>
              </div>

              {/* Fixed 16:9 Cover Box */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSelectCoverFile}
              />

              <div className="w-full h-[184px] rounded-xl overflow-hidden shrink-0 relative bg-[var(--panel-raised)]">
                {coverUrl ? (
                  <div className="relative w-full h-full group">
                    <img
                      src={coverUrl}
                      alt="Project cover preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute right-3 bottom-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-xs font-semibold text-white transition-colors"
                      >
                        <ImageIcon size={14} />
                        <span>Change</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveCover}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-xs font-semibold text-white transition-colors"
                      >
                        <X size={14} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full border-2 border-dashed border-[var(--border-strong)] rounded-xl flex flex-col items-center justify-center p-4 hover:border-[var(--accent)] hover:bg-[var(--hover)]/30 transition-colors text-center cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--hover)] flex items-center justify-center mb-2">
                      <ImageIcon size={20} className="text-[var(--text-2)]" />
                    </div>
                    <span className="text-sm font-semibold text-white">Upload a cover image</span>
                    <span className="text-xs text-[var(--text-3)] mt-0.5">
                      16:9, PNG, JPG or WebP. You crop it next.
                    </span>
                  </button>
                )}
              </div>

              {/* Project Name Input */}
              <div className="mt-5 flex flex-col">
                <label className="text-[13px] font-semibold text-[var(--text-2)] mb-2">
                  Project name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder={clientName ? `e.g. ${clientName} campaign` : "e.g. November campaign"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isCreateDisabled) {
                      e.preventDefault();
                      handleCreate();
                    }
                  }}
                  className="h-[52px] w-full rounded-xl bg-[var(--input)] border border-[var(--border)] px-4 text-base text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-8 py-5 border-t border-[var(--border)] bg-[var(--panel)] shrink-0">
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

      {/* 16:9 Cover Cropper */}
      {showCropDialog && coverFile && (
        <ImageCropDialog
          isOpen={showCropDialog}
          onClose={() => setShowCropDialog(false)}
          imageFile={coverFile}
          shape="rect"
          aspect={16 / 9}
          title="Crop project cover"
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  );
}
