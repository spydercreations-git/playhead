"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  Loader2,
  Building2,
  FolderOpen,
  Calendar,
  Layers,
  ChevronDown,
  Upload,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

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
}

interface ClientChip {
  id: string;
  name: string;
  count: number;
}

export default function SpreadsheetsPage() {
  const router = useRouter();
  const { user, isClient, isLoading: authLoading } = useAuth();

  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");

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

  useEffect(() => {
    if (authLoading || !user) return;

    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const res = await apiRequest<{ spreadsheets: SpreadsheetItem[] }>("/spreadsheets");
        if (isMounted && res && res.spreadsheets) {
          setSpreadsheets(res.spreadsheets);
        }

        // Also fetch user's projects for creation modal
        const projRes = await apiRequest<any>("/projects");
        if (isMounted && projRes && projRes.projects) {
          setProjects(projRes.projects);
          if (projRes.projects.length > 0) {
            setSelectedProjectId(projRes.projects[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load spreadsheets", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

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
    if (!selectedProjectId) return;

    try {
      setCreating(true);
      const res = await apiRequest<any>(`/projects/${selectedProjectId}/spreadsheets`, {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim() || "Untitled Spreadsheet",
          template: selectedTemplate,
        }),
      });

      setShowCreateModal(false);
      router.push(`/sheet/${res.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to create spreadsheet");
    } finally {
      setCreating(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !selectedProjectId) return;

    try {
      setImporting(true);
      // 1. Create spreadsheet record first
      const createRes = await apiRequest<any>(`/projects/${selectedProjectId}/spreadsheets`, {
        method: "POST",
        body: JSON.stringify({
          title: importFile.name.replace(/\.[^/.]+$/, ""),
          template: "blank",
        }),
      });

      // 2. Upload file to import endpoint (25MB limit)
      const formData = new FormData();
      formData.append("file", importFile);

      const token = localStorage.getItem("token") || "";
      const uploadResp = await fetch(
        `http://localhost:8080/api/v1/spreadsheets/${createRes.id}/import`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!uploadResp.ok) {
        throw new Error("Failed to upload and parse Excel/CSV");
      }

      setShowImportModal(false);
      router.push(`/sheet/${createRes.id}`);
    } catch (err: any) {
      alert(err.message || "Failed to import spreadsheet");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppShell>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8 text-white font-sans">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2D2F34] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25459C]/30 text-[#4876F3] border border-[#25459C]/40">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Spreadsheets</h1>
                <p className="text-xs text-[#8E8F90]">
                  Video trackers, production budgets, creator rates, and collaborative sheets.
                </p>
              </div>
            </div>
          </div>

          {!isClient && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-[#34353B] bg-[#212121] hover:bg-[#2A2B30] text-xs font-semibold text-[#E0E0E0] transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-[#8E8F90]" />
                <span>Import (.xlsx / CSV)</span>
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 h-9 px-4 rounded-xl bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>New Spreadsheet</span>
              </button>
            </div>
          )}
        </div>

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
            <button
              onClick={() => setSelectedClientId("all")}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                selectedClientId === "all"
                  ? "bg-[#3B67E0] text-white"
                  : "bg-[#212121] text-[#8E8F90] hover:text-white border border-[#2D2F34]"
              }`}
            >
              All Clients ({spreadsheets.length})
            </button>
            {clientChips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSelectedClientId(chip.id)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedClientId === chip.id
                    ? "bg-[#3B67E0] text-white"
                    : "bg-[#212121] text-[#8E8F90] hover:text-white border border-[#2D2F34]"
                }`}
              >
                {chip.name} ({chip.count})
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8E8F90]" />
            <input
              type="text"
              placeholder="Search sheets or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#212121] border border-[#2D2F34] text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
            />
          </div>
        </div>

        {/* Spreadsheets List Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8E8F90]">
            <Loader2 className="h-7 w-7 animate-spin text-[#3B67E0] mb-3" />
            <span className="text-xs">Loading spreadsheets...</span>
          </div>
        ) : filteredSpreadsheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-[#2D2F34] bg-[#212121] p-8">
            <div className="h-12 w-12 rounded-xl bg-[#2A2B30] text-[#8E8F90] flex items-center justify-center mb-3">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No spreadsheets found</h3>
            <p className="text-xs text-[#8E8F90] max-w-sm mb-6">
              Create a new spreadsheet or video tracker to manage deliverables, calculate budgets, and track reviews.
            </p>
            {!isClient && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 h-8 px-3 rounded-lg bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Spreadsheet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSpreadsheets.map((sheet) => (
              <Link
                key={sheet.id}
                href={`/sheet/${sheet.id}`}
                className="group flex flex-col justify-between p-5 rounded-2xl bg-[#212121] border border-[#2D2F34] hover:border-[#3B67E0]/50 hover:bg-[#242528] transition-all duration-150"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25459C]/20 text-[#4876F3] group-hover:bg-[#25459C]/40 transition-colors">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-semibold text-white group-hover:text-[#4876F3] transition-colors line-clamp-1">
                        {sheet.title}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 text-xs text-[#8E8F90]">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3" />
                      <span className="truncate">{sheet.project_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" />
                      <span className="truncate">{sheet.client_name}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#2D2F34]/60 text-[11px] text-[#7C7F87]">
                  <span className="font-mono">
                    {sheet.row_count} rows × {sheet.col_count} cols
                  </span>
                  <div className="flex items-center gap-1 group-hover:text-white transition-colors">
                    <span>Open Sheet</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Spreadsheet Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-[#2D2F34] bg-[#212121] p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-[#2D2F34]">
                <h3 className="text-sm font-semibold text-white">Create New Spreadsheet</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-[#8E8F90] hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSpreadsheet} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#8E8F90] mb-1.5">
                    Project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    required
                    className="w-full h-9 rounded-xl bg-[#2A2B30] border border-[#34353B] px-3 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#8E8F90] mb-1.5">
                    Spreadsheet Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Q4 Video Tracker"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#2A2B30] border border-[#34353B] px-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#8E8F90] mb-1.5">
                    Template
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "blank", name: "Blank Sheet" },
                      { id: "tracker", name: "Video Tracker" },
                      { id: "creator_payments", name: "Creator Payments" },
                      { id: "production_budget", name: "Production Budget" },
                      { id: "shot_schedule", name: "Shot Schedule" },
                    ].map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`p-2.5 rounded-xl text-left border text-xs transition-colors ${
                          selectedTemplate === tpl.id
                            ? "border-[#3B67E0] bg-[#3B67E0]/15 text-white font-medium"
                            : "border-[#34353B] bg-[#2A2B30] text-[#8E8F90] hover:text-white"
                        }`}
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-[#2D2F34]">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#8E8F90] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white transition-colors"
                  >
                    {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Create & Open</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Import Modal (ExcelJS on Server, 25MB Limit) */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-[#2D2F34] bg-[#212121] p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-[#2D2F34]">
                <h3 className="text-sm font-semibold text-white">Import Spreadsheet</h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-[#8E8F90] hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleImportSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#8E8F90] mb-1.5">
                    Target Project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    required
                    className="w-full h-9 rounded-xl bg-[#2A2B30] border border-[#34353B] px-3 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#8E8F90] mb-1.5">
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
                          alert("File exceeds 25MB limit");
                          return;
                        }
                        setImportFile(file);
                      }
                    }}
                    className="w-full p-2.5 rounded-xl bg-[#2A2B30] border border-[#34353B] text-xs text-white file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#3B67E0] file:text-white hover:file:bg-[#4876F3]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-[#2D2F34]">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#8E8F90] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importing || !importFile}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Import File</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
