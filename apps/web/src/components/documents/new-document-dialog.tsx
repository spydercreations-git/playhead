"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  X,
  FilePlus,
  Clapperboard,
  ClipboardList,
  MessageSquare,
  Loader2,
} from "@/components/ui/icon";
import { apiRequest } from "@/lib/api";
import { ProjectSelect, ProjectOption } from "@/components/ui/project-select";
import { toast } from "@/lib/toast";

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onDocumentCreated?: (newDoc: any) => void;
}

const TEMPLATES = [
  {
    id: "blank",
    title: "Blank",
    desc: "Start with a clean page",
    icon: FileText,
  },
  {
    id: "brief",
    title: "Brief",
    desc: "Objectives, deliverables & timelines",
    icon: FilePlus,
  },
  {
    id: "script",
    title: "Script",
    desc: "Two-column AV table, action & dialogue",
    icon: Clapperboard,
  },
  {
    id: "shot_list",
    title: "Shot list",
    desc: "Call times, angles, descriptions & status",
    icon: ClipboardList,
  },
  {
    id: "creator_notes",
    title: "Creator notes",
    desc: "UGC guidelines, hooks & concepts",
    icon: MessageSquare,
  },
];

export function NewDocumentDialog({
  isOpen,
  onClose,
  defaultProjectId,
  onDocumentCreated,
}: NewDocumentDialogProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId || "");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    async function loadProjects() {
      try {
        setLoadingProjects(true);
        const res = await apiRequest<{ projects: ProjectOption[] }>("/projects");
        if (res && res.projects) {
          setProjects(res.projects);
        }
      } catch (e) {
        console.warn("Failed to load projects", e);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);

      const endpoint = selectedProjectId
        ? `/projects/${selectedProjectId}/documents`
        : `/documents`;

      const res = await apiRequest<{ id: string; title?: string }>(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim() || undefined,
            template: selectedTemplate,
          }),
        }
      );

      if (res && res.id) {
        onClose();
        if (onDocumentCreated) {
          const selectedProj = projects.find((p) => p.id === selectedProjectId);
          onDocumentCreated({
            id: res.id,
            title: title.trim() || "Untitled Document",
            project_id: selectedProjectId || "",
            project_name: selectedProj?.name || "My documents",
            word_count: 0,
            character_count: 0,
            reading_time_seconds: 0,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        } else {
          router.push(`/d/${res.id}?new=1`);
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err: any) {
      console.error("Failed to create document", err);
      const errMsg = err?.message || "Failed to create document.";
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/80"
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 bg-[var(--panel)] border border-[var(--border)] rounded-xl max-w-xl w-full p-6 shadow-overlay"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-white mb-1">
          Create new document
        </h2>
        <p className="text-xs text-[var(--text-2)] mb-5">
          Select a template and choose where to save this document.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Document Title */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Document title
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Brand Commercial Brief"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 bg-[var(--input)] border border-[var(--border)] rounded-[10px] px-3 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
              autoFocus
            />
          </div>

          {/* Location Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
              Location (optional)
            </label>
            <ProjectSelect
              projects={projects}
              value={selectedProjectId}
              onChange={(id) => setSelectedProjectId(id)}
              disabled={loadingProjects}
              allowMyDocuments
              placeholder="My documents (private to me)"
            />
          </div>

          {/* Template Selection Cards */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-2">
              Choose template
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={`p-3 rounded-[10px] border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isSelected
                        ? "bg-[#4876F3]/10 border-[#4876F3] text-white"
                        : "bg-[var(--input)] border-[var(--border)] text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-[#4876F3] text-white"
                          : "bg-[var(--panel)] text-[var(--text-3)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        {tmpl.title}
                      </div>
                      <div className="text-xs text-[var(--text-3)] line-clamp-1 mt-0.5">
                        {tmpl.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[10px] text-xs font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-[10px] text-xs font-semibold bg-[#3B67E0] text-white hover:bg-[#3B67E0] disabled:opacity-50 flex items-center gap-1.5 shadow transition-colors"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Document</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
