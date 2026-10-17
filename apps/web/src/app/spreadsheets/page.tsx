"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  FileSpreadsheet,
  Plus,
  Search,
  Loader2,
  Building2,
  FolderOpen,
  Calendar,
  Layers,
  Upload,
  ArrowRight,
  Sparkles,
  X,
  AlertCircle,
} from "@/components/ui/icon";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { ProjectSelect } from "@/components/ui/project-select";
import { toast } from "@/lib/toast";
import { SpreadsheetCard } from "@/components/spreadsheets/spreadsheet-card";
import { ClientPickerDialog, ClientPickerTrigger } from "@/components/clients/client-picker-dialog";

interface SpreadsheetItem {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
  client_id: string;
  client_name: string;
  row_count: number;
  col_count: number;
  cell_count: number;
  updated_at: string;
  created_at: string;
  is_starred: boolean;
  can_edit: boolean;
  is_tracker?: boolean;
}

interface ClientChip {
  id: string;
  name: string;
  count: number;
}

export default function SpreadsheetsPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { user, company, isClient, isLoading: authLoading } = useAuth();

  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [newlyCreatedSheetId, setNewlyCreatedSheetId] = useState<string | null>(null);

  // New Spreadsheet Dialog
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [creating, setCreating] = useState(false);

  // Import Dialog
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      if (!authLoading) setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ spreadsheets: SpreadsheetItem[] }>("/spreadsheets");
      setSpreadsheets(res?.spreadsheets || []);

      // Also fetch user's projects for creation modal
      const projRes = await apiRequest<{ projects: any[] }>("/projects");
      if (projRes && projRes.projects) {
        setProjects(projRes.projects);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load spreadsheets. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, loadData]);

  // Compute Client Chips
  const clientChips: ClientChip[] = useMemo(() => {
    const map = new Map<string, ClientChip>();
    spreadsheets.forEach((s) => {
      if (s.client_id && s.client_name) {
        const existing = map.get(s.client_id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(s.client_id, {
            id: s.client_id,
            name: s.client_name,
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [spreadsheets]);

  const selectedClient = useMemo(() => {
    if (selectedClientId === "all") return null;
    const found = clientChips.find((c) => c.id === selectedClientId);
    return found ? { id: found.id, name: found.name } : null;
  }, [clientChips, selectedClientId]);

  // Filter spreadsheets by search and client
  const filteredSpreadsheets = useMemo(() => {
    return spreadsheets.filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.project_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesClient =
        selectedClientId === "all" || s.client_id === selectedClientId;

      return matchesSearch && matchesClient;
    });
  }, [spreadsheets, searchQuery, selectedClientId]);

  const handleCreateSpreadsheet = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setCreating(true);
      const endpoint = selectedProjectId
        ? `/projects/${selectedProjectId}/spreadsheets`
        : `/spreadsheets`;

      const res = await apiRequest<{ id: string }>(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            title: newTitle.trim() || undefined,
            template: selectedTemplate,
          }),
        }
      );

      if (res && res.id) {
        setShowCreateModal(false);
        const selectedProj = projects.find((p) => p.id === selectedProjectId);
        const newSheetItem: SpreadsheetItem = {
          id: res.id,
          title: newTitle.trim() || "Untitled Spreadsheet",
          project_id: selectedProjectId || "",
          project_name: selectedProj?.name || "My documents",
          client_id: selectedProj?.client_id || "",
          client_name: selectedProj?.client_name || "",
          row_count: 30,
          col_count: 7,
          cell_count: 7,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          is_starred: false,
          can_edit: true,
        };
        setSpreadsheets((prev) => [newSheetItem, ...prev]);
        setNewlyCreatedSheetId(res.id);
        // Soft blue highlight for 1 second, then navigate to editor with title selected per Part C spec
        setTimeout(() => {
          router.push(`/sheet/${res.id}?new=1`);
        }, 1000);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to create spreadsheet.");
    } finally {
      setCreating(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !importFile) return;

    try {
      setImporting(true);

      // 1. Create a blank spreadsheet
      const sheetName = importFile.name.replace(/\.[^/.]+$/, "");
      const res = await apiRequest<{ id: string }>(
        `/projects/${selectedProjectId}/spreadsheets`,
        {
          method: "POST",
          body: JSON.stringify({
            title: sheetName,
            template: "blank",
          }),
        }
      );

      if (!res || !res.id) throw new Error("Failed to create spreadsheet item");

      // 2. Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(importFile);
      const fileData = await base64Promise;

      // 3. Post to import endpoint
      await apiRequest(`/spreadsheets/${res.id}/import`, {
        method: "POST",
        body: JSON.stringify({
          filename: importFile.name,
          data: fileData,
        }),
      });

      setShowImportModal(false);
      router.push(`/sheet/${res.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to import file. Make sure it is a valid XLSX or CSV file.");
    } finally {
      setImporting(false);
    }
  };

  if (!authLoading && user && !company && !isClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-[var(--input)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--text-2)]">
          <FileSpreadsheet className="w-8 h-8 text-[var(--text-2)]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Spreadsheets</h2>
        <p className="text-sm text-[var(--text-2)] max-w-md">
          Your account isn&apos;t part of a team yet. Ask an Admin to invite you.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8 text-white font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4876F3]/10 text-[#4876F3] border border-[#4876F3]/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Spreadsheets & Trackers
              </h1>
              <p className="text-xs text-[var(--text-2)] mt-0.5">
                Real-time multi-sheet workbooks, video production budgets, and deliverables tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Action CTAs */}
        {!isClient && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 h-9 px-3.5 rounded-[10px] bg-[var(--input)] hover:bg-[var(--border)] text-xs font-medium text-white border border-[var(--border)] transition-colors"
            >
              <Upload className="h-3.5 w-3.5 text-[var(--text-3)]" />
              <span>Import (.xlsx, .csv)</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[#4876F3] hover:bg-[#3560D6] text-xs font-semibold text-white shadow transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>New Spreadsheet</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {!isClient && (
            <ClientPickerTrigger
              selectedClient={selectedClient}
              onOpenPicker={() => setShowClientPicker(true)}
              onClearSelection={() => setSelectedClientId("all")}
            />
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-3)]" />
          <input
            type="text"
            placeholder="Search sheets or projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-[10px] bg-[var(--input)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3]"
          />
        </div>
      </div>

      {/* Spreadsheets List Grid / Loading / Error / Empty States */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mb-3">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">Failed to load spreadsheets</h3>
          <p className="text-xs text-[var(--text-2)] max-w-sm mb-6">{error}</p>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[#4876F3] hover:bg-[#3560D6] text-xs font-semibold text-white transition-colors"
          >
            <span>Try again</span>
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-2)]">
          <Loader2 className="h-7 w-7 animate-spin text-[#4876F3] mb-3" />
          <span className="text-xs">Loading spreadsheets...</span>
        </div>
      ) : filteredSpreadsheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8">
          <div className="h-12 w-12 rounded-xl bg-[var(--input)] text-[var(--text-2)] flex items-center justify-center mb-3">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">No spreadsheets found</h3>
          <p className="text-xs text-[var(--text-2)] max-w-sm mb-6">
            Create a new spreadsheet or video tracker to manage deliverables, calculate budgets, and track reviews.
          </p>
          {!isClient && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[#4876F3] hover:bg-[#3560D6] text-xs font-semibold text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Spreadsheet</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredSpreadsheets.map((sheet) => (
            <SpreadsheetCard
              key={sheet.id}
              sheet={{
                id: sheet.id,
                title: sheet.title,
                project_name: sheet.project_name,
                client_name: sheet.client_name,
                updated_at: sheet.updated_at,
                is_tracker: sheet.is_tracker,
              }}
            />
          ))}
        </div>
      )}

      {/* Create Spreadsheet Modal with Framer Motion */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setShowCreateModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-overlay"
            >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-white">Create New Spreadsheet</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSpreadsheet} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Location (optional)
                </label>
                <ProjectSelect
                  projects={projects}
                  value={selectedProjectId}
                  onChange={(id) => setSelectedProjectId(id)}
                  allowMyDocuments
                  placeholder="My documents (private to me)"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Spreadsheet Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Video Tracker"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "blank", name: "Blank" },
                    { id: "tracker", name: "Tracker" },
                    { id: "creator_payments", name: "Creator payments" },
                    { id: "production_budget", name: "Budget" },
                    { id: "shot_schedule", name: "Shot schedule" },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`p-2.5 rounded-[10px] text-left border text-xs transition-colors ${
                        selectedTemplate === tpl.id
                          ? "border-[#4876F3] bg-[#4876F3]/10 text-white font-medium"
                          : "border-[var(--border)] bg-[var(--input)] text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)]"
                      }`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-[10px] text-xs font-medium text-[var(--text-2)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#3B67E0] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Create & Open</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-overlay relative">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-white">Import Spreadsheet</h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Target Project
                </label>
                <ProjectSelect
                  projects={projects}
                  value={selectedProjectId}
                  onChange={(id) => setSelectedProjectId(id)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Excel or CSV file (Max 25MB)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  required
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      if (file.size > 25 * 1024 * 1024) {
                        toast.error("File exceeds 25MB limit");
                        return;
                      }
                      setImportFile(file);
                    }
                  }}
                  className="w-full p-2 rounded-[10px] bg-[var(--input)] border border-[var(--border)] text-xs text-white file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#4876F3] file:text-white hover:file:bg-[#3560D6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3.5 py-2 rounded-[10px] text-xs font-medium text-[var(--text-2)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile || !selectedProjectId}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#4876F3] hover:bg-[#3560D6] text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Import File</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Picker Dialog */}
      <ClientPickerDialog
        isOpen={showClientPicker}
        onClose={() => setShowClientPicker(false)}
        selectedClientId={selectedClientId === "all" ? undefined : selectedClientId}
        onSelectClient={(client) => {
          setSelectedClientId(client ? client.id : "all");
        }}
        confirmLabel="Filter spreadsheets"
      />
    </div>
  );
}
