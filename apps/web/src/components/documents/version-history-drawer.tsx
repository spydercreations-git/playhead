"use client";

import React, { useState } from "react";
import {
  History,
  X,
  RotateCcw,
  Tag,
  Check,
  Clock,
  User,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiRequest } from "@/lib/api";

export interface DocumentVersionItem {
  id: string;
  document_id: string;
  name?: string;
  is_named: boolean;
  content_json: any;
  plain_text?: string;
  word_count?: number;
  created_by?: string;
  creator_name?: string;
  created_at: string;
}

interface VersionHistoryDrawerProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  versions: DocumentVersionItem[];
  selectedVersionId: string | null;
  onSelectVersion: (version: DocumentVersionItem | null) => void;
  onVersionRestored: (newVersionNumber: number) => void;
  canEdit: boolean;
}

export function VersionHistoryDrawer({
  documentId,
  isOpen,
  onClose,
  versions,
  selectedVersionId,
  onSelectVersion,
  onVersionRestored,
  canEdit,
}: VersionHistoryDrawerProps) {
  const [namingVersionId, setNamingVersionId] = useState<string | null>(null);
  const [versionNameInput, setVersionNameInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restoreTargetVersion, setRestoreTargetVersion] = useState<DocumentVersionItem | null>(null);

  if (!isOpen) return null;

  async function handleSaveVersionName(versionId: string) {
    if (!versionNameInput.trim()) return;
    try {
      setIsSubmitting(true);
      await apiRequest(`/documents/${documentId}/versions/${versionId}/name`, {
        method: "POST",
        body: JSON.stringify({ name: versionNameInput.trim() }),
      });
      // Update locally
      const found = versions.find((v) => v.id === versionId);
      if (found) {
        found.name = versionNameInput.trim();
        found.is_named = true;
      }
      setNamingVersionId(null);
      setVersionNameInput("");
      toast.success("Version renamed");
    } catch (err) {
      console.error("Failed to rename version", err);
      toast.error("Failed to rename version");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeRestoreVersion(version: DocumentVersionItem) {
    if (!canEdit) return;
    try {
      setIsSubmitting(true);
      const res = await apiRequest<{ new_version_number: number }>(
        `/documents/${documentId}/restore`,
        {
          method: "POST",
          body: JSON.stringify({ version_id: version.id }),
        }
      );
      toast.success(`Restored "${version.name || `version ${version.id.slice(0, 7)}`}"`);
      onSelectVersion(null); // exit historical preview
      onVersionRestored(res.new_version_number);
      onClose();
    } catch (err: any) {
      console.error("Failed to restore version", err);
      toast.error("Failed to restore version. Please check permissions.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-card border-l border-border shadow-overlay z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Version history</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelectVersion(null);
            onClose();
          }}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Previewing Alert */}
      {selectedVersionId && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-primary font-medium">
            Viewing past snapshot (read-only)
          </span>
          <button
            type="button"
            onClick={() => onSelectVersion(null)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Exit preview
          </button>
        </div>
      )}

      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {versions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No historical versions recorded yet.</p>
            <p className="text-xs mt-1 text-muted-foreground/80">
              Versions are created automatically during editing and upon naming.
            </p>
          </div>
        ) : (
          versions.map((ver, idx) => {
            const isSelected = selectedVersionId === ver.id;
            const isCurrent = idx === 0 && !selectedVersionId;
            const formattedDate = new Date(ver.created_at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={ver.id}
                className={`p-3.5 rounded-xl border transition-all text-left relative ${
                  isSelected
                    ? "bg-primary/10 border-primary shadow-sm"
                    : isCurrent
                    ? "bg-card border-border/80 shadow-sm"
                    : "bg-card/40 border-border/40 hover:bg-card/80 hover:border-border"
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => onSelectVersion(isSelected ? null : ver)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {ver.name ? (
                        <>
                          <Tag className="w-3 h-3 text-primary" />
                          <span className="truncate max-w-[160px]">{ver.name}</span>
                        </>
                      ) : idx === 0 ? (
                        "Current version"
                      ) : (
                        `Version snapshot ${versions.length - idx}`
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formattedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="truncate">{ver.creator_name || "Team member"}</span>
                    {ver.word_count !== undefined && (
                      <span className="text-xs ml-auto">
                        {ver.word_count} words
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline naming or action buttons */}
                {namingVersionId === ver.id ? (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Name this version..."
                      value={versionNameInput}
                      onChange={(e) => setVersionNameInput(e.target.value)}
                      className="flex-1 bg-muted/60 border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={isSubmitting || !versionNameInput.trim()}
                      onClick={() => handleSaveVersionName(ver.id)}
                      className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNamingVersionId(null)}
                      className="p-1.5 rounded-md bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between">
                    {canEdit && !ver.name && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNamingVersionId(ver.id);
                          setVersionNameInput("");
                        }}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        <Tag className="w-3 h-3" />
                        <span>Name version</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRestoreTargetVersion(ver);
                        }}
                        className="ml-auto text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={!!restoreTargetVersion}
        onOpenChange={(open) => !open && setRestoreTargetVersion(null)}
        title="Restore version"
        description={`Restore "${restoreTargetVersion?.name || "this version"}"? A new version will be created with its contents without deleting any newer history.`}
        confirmLabel="Restore version"
        variant="primary"
        loading={isSubmitting}
        onConfirm={() => restoreTargetVersion && executeRestoreVersion(restoreTargetVersion)}
      />
    </div>
  );
}
