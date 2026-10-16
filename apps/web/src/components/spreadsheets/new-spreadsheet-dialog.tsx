"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  X,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { ProjectSelect, ProjectOption } from "@/components/ui/project-select";

interface NewSpreadsheetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onSpreadsheetCreated?: (newSheet: any) => void;
}

const TEMPLATES = [
  { id: "blank", name: "Blank" },
  { id: "tracker", name: "Tracker" },
  { id: "creator_payments", name: "Creator payments" },
  { id: "production_budget", name: "Budget" },
  { id: "shot_schedule", name: "Shot schedule" },
];

export function NewSpreadsheetDialog({
  isOpen,
  onClose,
  defaultProjectId,
  onSpreadsheetCreated,
}: NewSpreadsheetDialogProps) {
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
        ? `/projects/${selectedProjectId}/spreadsheets`
        : `/spreadsheets`;

      const res = await apiRequest<{ id: string }>(
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
        if (onSpreadsheetCreated) {
          const selectedProj = projects.find((p) => p.id === selectedProjectId);
          onSpreadsheetCreated({
            id: res.id,
            title: title.trim() || "Untitled Spreadsheet",
            project_id: selectedProjectId || "",
            project_name: selectedProj?.name || "My documents",
            row_count: 30,
            col_count: 7,
            cell_count: 0,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        } else {
          router.push(`/sheet/${res.id}?new=1`);
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err: any) {
      console.error("Failed to create spreadsheet", err);
      setError(err.message || "Failed to create spreadsheet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#212121] border border-[#2E2F34] rounded-xl max-w-md w-full p-6 shadow-overlay relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-white mb-1">
          Create new spreadsheet
        </h2>
        <p className="text-xs text-[#A3A6AD] mb-5">
          Select a template and choose where to save this spreadsheet.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
              Spreadsheet title
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 Video Tracker"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] px-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
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

          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
              Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tmpl.id)}
                    className={`p-2.5 rounded-[10px] text-left border text-xs transition-colors ${
                      isSelected
                        ? "bg-[#4876F3]/10 border-[#4876F3] text-white font-medium"
                        : "border-[#2E2F34] bg-[#2A2B30] text-[#A3A6AD] hover:text-white hover:border-[#424344]"
                    }`}
                  >
                    {tmpl.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#2E2F34] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[10px] text-xs font-medium text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-[10px] text-xs font-semibold bg-[#3B67E0] text-white hover:bg-[#3B67E0] disabled:opacity-50 flex items-center gap-1.5 shadow transition-colors"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Spreadsheet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
