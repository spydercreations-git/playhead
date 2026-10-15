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
  Folder,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

interface ProjectOption {
  id: string;
  name: string;
  client_name?: string;
}

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
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
          if (!selectedProjectId && res.projects.length > 0) {
            setSelectedProjectId(res.projects[0].id);
          }
        }
      } catch (e) {
        console.warn("Failed to load projects", e);
      } finally {
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, [isOpen, selectedProjectId]);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) {
      setError("Please select a target project for this document.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await apiRequest<{ id: string }>(
        `/projects/${selectedProjectId}/documents`,
        {
          method: "POST",
          body: JSON.stringify({
            name: title.trim() || undefined,
            template: selectedTemplate,
          }),
        }
      );

      onClose();
      router.push(`/d/${res.id}`);
    } catch (err: any) {
      console.error("Failed to create document", err);
      setError(err.message || "Failed to create document.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-foreground mb-1">
          Create new document
        </h2>
        <p className="text-xs text-muted-foreground mb-5">
          Select a template and choose which project this document belongs to.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Document Title */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Document title
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Brand Commercial Brief"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-muted/60 border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Project Selector */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Project</span>
            </label>
            {loadingProjects ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Loading available projects...</span>
              </div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-muted/60 border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.client_name ? `(${p.client_name})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Template Selection Cards */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">
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
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      isSelected
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-muted/30 border-border/60 hover:bg-muted/60 hover:border-border"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {tmpl.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                        {tmpl.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedProjectId}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
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
