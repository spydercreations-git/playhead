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
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { ProjectSelect, ProjectOption } from "@/components/ui/project-select";

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
      setError("Please select a project.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await apiRequest<{ id: string; redirect_url?: string }>(
        `/projects/${selectedProjectId}/documents`,
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
        router.push(`/doc/${res.id}`);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err: any) {
      console.error("Failed to create document", err);
      setError(err.message || "Failed to create document.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#212121] border border-[#2E2F34] rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-white mb-1">
          Create new document
        </h2>
        <p className="text-xs text-[#9A9DA0] mb-5">
          Select a template and choose which project this document belongs to.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Document Title */}
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
              Document title
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Brand Commercial Brief"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] px-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
              autoFocus
            />
          </div>

          {/* Project Selector */}
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
              Project
            </label>
            <ProjectSelect
              projects={projects}
              value={selectedProjectId}
              onChange={(id) => setSelectedProjectId(id)}
              disabled={loadingProjects}
              required
            />
          </div>

          {/* Template Selection Cards */}
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-2">
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
                        : "bg-[#2A2B30] border-[#2E2F34] text-[#9A9DA0] hover:text-white hover:border-[#424344]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "bg-[#4876F3] text-white"
                          : "bg-[#212121] text-[#7C7F87]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        {tmpl.title}
                      </div>
                      <div className="text-[11px] text-[#7C7F87] line-clamp-1 mt-0.5">
                        {tmpl.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-[#2E2F34] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[10px] text-xs font-medium text-[#9A9DA0] hover:text-white hover:bg-[#2A2B30] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedProjectId}
              className="px-5 py-2 rounded-[10px] text-xs font-semibold bg-[#4876F3] text-white hover:bg-[#3B66D6] disabled:opacity-50 flex items-center gap-1.5 shadow transition-colors"
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
