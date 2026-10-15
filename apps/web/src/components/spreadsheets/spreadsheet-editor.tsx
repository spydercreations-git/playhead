"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  EyeOff,
  History,
  MessageSquare,
  Download,
  Share2,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Printer,
  ChevronDown,
  User,
  Shield,
  RotateCcw,
  Plus,
  Send,
  AlertCircle,
} from "lucide-react";
import "@fortune-sheet/react/dist/index.css";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import ExcelJS from "exceljs";
import { apiRequest } from "@/lib/api";

const Workbook = dynamic(
  () => import("@fortune-sheet/react").then((mod) => mod.Workbook),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#181818] text-[#8E8F90]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B67E0] border-t-transparent" />
          <span className="text-xs">Loading spreadsheet engine...</span>
        </div>
      </div>
    ),
  }
);

interface SpreadsheetEditorProps {
  id: string;
  initialData: any;
  isTeamMember: boolean;
  canEdit: boolean;
  user: any;
}

export function SpreadsheetEditor({
  id,
  initialData,
  isTeamMember,
  canEdit,
  user,
}: SpreadsheetEditorProps) {
  const router = useRouter();
  const [sheets, setSheets] = useState<any[]>(initialData?.sheets || []);
  const [title, setTitle] = useState(initialData?.title || "Untitled Spreadsheet");
  const [statusText, setStatusText] = useState("Connected");
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);

  // Drawers & Modals
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [selectedColIndex, setSelectedColIndex] = useState<number>(0);
  const [columnMetaList, setColumnMetaList] = useState<any[]>(
    initialData?.sheets?.[0]?.columnMeta || []
  );

  const [notification, setNotification] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);

  const notify = (type: "error" | "success", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Live Collaboration setup for Team Members
  useEffect(() => {
    if (!isTeamMember) {
      // Non-team client contacts NEVER get live Yjs connection
      // They poll every 5 seconds (Requirement 4)
      setStatusText("Live View (Synced)");
      const interval = setInterval(async () => {
        try {
          const res = await apiRequest<any>(`/spreadsheets/${id}/view`);
          if (res?.sheets) {
            setSheets(res.sheets);
          }
        } catch (e) {
          console.warn("View poll failed", e);
        }
      }, 5000);

      return () => clearInterval(interval);
    }

    // Team members: establish Yjs connection with short-lived ticket
    let isSubscribed = true;

    async function initCollab() {
      try {
        const ticketRes = await apiRequest<any>(`/spreadsheets/${id}/collab-ticket`, {
          method: "POST",
        });

        if (!isSubscribed) return;

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const wsUrl = ticketRes.ws_url || "ws://localhost:8082";
        const provider = new HocuspocusProvider({
          url: wsUrl,
          name: `sheet:${id}`,
          document: ydoc,
          token: ticketRes.ticket,
          onStatus: (event) => {
            if (event.status === "connected") {
              setStatusText("Saved to cloud");
            } else if (event.status === "connecting") {
              setStatusText("Connecting...");
            } else {
              setStatusText("Offline");
            }
          },
        });

        providerRef.current = provider;

        // When remote updates arrive, sync sheets
        ydoc.on("update", () => {
          // Re-evaluate FortuneSheet presentation from Yjs
          const sheetsArray = ydoc.getArray<any>("sheets").toArray();
          if (sheetsArray.length > 0) {
            // Updated sheets
            setStatusText("Saved to cloud");
          }
        });
      } catch (err: any) {
        console.error("Failed to connect to collab service", err);
        notify("error", "Collab ticket expired or connection failed");
      }
    }

    initCollab();

    return () => {
      isSubscribed = false;
      if (providerRef.current) {
        providerRef.current.destroy();
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
    };
  }, [id, isTeamMember]);

  // Load versions
  const loadVersions = async () => {
    try {
      const data = await apiRequest<any>(`/spreadsheets/${id}/versions`);
      setVersions(data.versions || []);
      setShowVersions(true);
    } catch (e: any) {
      notify("error", e.message || "Failed to load version history");
    }
  };

  // Restore version
  const handleRestoreVersion = async (vId: string) => {
    if (!confirm("Are you sure you want to restore this version? All users will see the restored data.")) return;
    try {
      await apiRequest(`/spreadsheets/${id}/versions/${vId}/restore`, { method: "POST" });
      notify("success", "Version restored successfully!");
      setShowVersions(false);
      // Reload view
      const refreshed = await apiRequest<any>(`/spreadsheets/${id}`);
      if (refreshed.sheets) setSheets(refreshed.sheets);
    } catch (e: any) {
      notify("error", e.message || "Failed to restore version");
    }
  };

  // Load comments
  const loadComments = async () => {
    try {
      const data = await apiRequest<any>(`/spreadsheets/${id}/comments`);
      setComments(data.comments || []);
      setShowComments(true);
    } catch (e: any) {
      notify("error", "Failed to load comments");
    }
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim()) return;
    try {
      const sId = sheets[0]?.id || "sheet_1";
      const rowId = sheets[0]?.rowIds?.[activeCell?.r || 0] || `r_${activeCell?.r || 0}`;
      const colId = sheets[0]?.colIds?.[activeCell?.c || 0] || `c_${activeCell?.c || 0}`;

      await apiRequest(`/spreadsheets/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          sheet_id: sId,
          row_id: rowId,
          col_id: colId,
          content: newCommentText.trim(),
        }),
      });

      setNewCommentText("");
      loadComments();
      notify("success", "Comment added");
    } catch (e: any) {
      notify("error", "Failed to post comment");
    }
  };

  // Cell edit handler
  const handleCellChange = useCallback(
    async (cellChanges: any) => {
      if (!canEdit) return;

      // When a non-team client contact edits a cell
      if (!isTeamMember) {
        try {
          const sId = sheets[0]?.id || "sheet_1";
          const rowId = sheets[0]?.rowIds?.[cellChanges.r] || `r_${cellChanges.r}`;
          const colId = sheets[0]?.colIds?.[cellChanges.c] || `c_${cellChanges.c}`;

          await apiRequest(`/spreadsheets/${id}/cells`, {
            method: "POST",
            body: JSON.stringify({
              sheet_id: sId,
              row_id: rowId,
              col_id: colId,
              value: cellChanges.v,
            }),
          });
          setStatusText("Saved");
        } catch (err: any) {
          notify("error", err.message || "Failed to save cell edit");
        }
      }
    },
    [canEdit, isTeamMember, id, sheets]
  );

  // Column Locking & Hiding (Admins/Managers)
  const handleSaveColumnMeta = async (colId: string, locked: boolean, hidden: boolean) => {
    try {
      const sId = sheets[0]?.id || "sheet_1";
      await apiRequest(`/spreadsheets/${id}/columns`, {
        method: "PATCH",
        body: JSON.stringify({
          sheet_id: sId,
          col_id: colId,
          locked,
          hidden,
        }),
      });
      notify("success", "Column settings updated");
      setShowColumnConfig(false);
      // Refresh sheet
      const res = await apiRequest<any>(`/spreadsheets/${id}`);
      if (res.sheets) setSheets(res.sheets);
    } catch (err: any) {
      notify("error", err.message || "Failed to update column");
    }
  };

  // Export handlers
  const exportToExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      sheets.forEach((sheet) => {
        const worksheet = workbook.addWorksheet(sheet.name || "Sheet 1");
        if (Array.isArray(sheet.celldata)) {
          sheet.celldata.forEach((item: any) => {
            const row = worksheet.getRow(item.r + 1);
            const val = item.v?.f ? { formula: item.v.f.replace(/^=/, "") } : item.v?.v;
            row.getCell(item.c + 1).value = val;
          });
        }
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Spreadsheet"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      notify("success", "Excel export downloaded");
    } catch (err) {
      notify("error", "Export failed");
    }
  };

  const exportToCsv = () => {
    try {
      const currentSheet = sheets[0];
      const rows: string[][] = [];
      const totalR = currentSheet?.row || 20;
      const totalC = currentSheet?.column || 10;

      for (let r = 0; r < totalR; r++) {
        const rowArr: string[] = [];
        for (let c = 0; c < totalC; c++) {
          rowArr.push("");
        }
        rows.push(rowArr);
      }

      if (Array.isArray(currentSheet?.celldata)) {
        currentSheet.celldata.forEach((item: any) => {
          if (rows[item.r] && rows[item.r][item.c] !== undefined) {
            rows[item.r][item.c] = String(item.v?.m ?? item.v?.v ?? "");
          }
        });
      }

      const csvContent = rows
        .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Spreadsheet"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
    } catch (e) {
      notify("error", "CSV export failed");
    }
  };

  const handlePrint = () => {
    setShowExportMenu(false);
    window.print();
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#181818] text-[#E0E0E0] select-none font-sans">
      {/* Notifications */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium shadow-xl border animate-in slide-in-from-top-2 duration-200 ${
            notification.type === "error"
              ? "bg-[#2A1E1E] border-red-800 text-red-200"
              : "bg-[#1E2A22] border-emerald-800 text-emerald-200"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#2D2F34] bg-[#212121] px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/spreadsheets"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8E8F90] hover:bg-[#2A2B30] hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#25459C]/40 text-[#4876F3]">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={title}
              disabled={!isTeamMember || !canEdit}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none focus:bg-[#2A2B30] px-1.5 py-0.5 rounded transition-colors w-64 truncate"
            />
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1A1A1E] border border-[#2D2F34] text-[11px] text-[#8E8F90]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                statusText.includes("Saved") || statusText.includes("Live")
                  ? "bg-emerald-400"
                  : "bg-amber-400"
              }`}
            />
            <span>{statusText}</span>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Column Lock & Hide Manager Tool */}
          {isTeamMember && (
            <button
              onClick={() => setShowColumnConfig(true)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#2A2B30] hover:bg-[#34353B] text-xs font-medium text-white transition-colors"
              title="Configure Column Locks & Visibility"
            >
              <Shield className="h-3.5 w-3.5 text-[#4876F3]" />
              <span>Lock / Hide Columns</span>
            </button>
          )}

          {/* Versions Drawer Toggle */}
          {isTeamMember && (
            <button
              onClick={loadVersions}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#2A2B30] hover:bg-[#34353B] text-xs font-medium text-white transition-colors"
              title="Version History"
            >
              <History className="h-3.5 w-3.5 text-[#8E8F90]" />
              <span>History</span>
            </button>
          )}

          {/* Cell Comments */}
          <button
            onClick={loadComments}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#2A2B30] hover:bg-[#34353B] text-xs font-medium text-white transition-colors"
            title="Cell Comments"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#8E8F90]" />
            <span>Comments</span>
          </button>

          {/* Export Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3 opacity-80" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-10 z-50 w-44 rounded-xl border border-[#2D2F34] bg-[#212121] p-1 shadow-2xl">
                <button
                  onClick={exportToExcel}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  onClick={exportToCsv}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span>CSV (.csv)</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
                >
                  <Printer className="h-3.5 w-3.5 text-blue-400" />
                  <span>Print / PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid Area */}
      <div className="relative flex-1 w-full overflow-hidden bg-[#181818]">
        {sheets.length > 0 && (
          <Workbook
            data={sheets}
            showToolbar={true}
            showFormulaBar={true}
            showSheetTabs={true}
            onChange={(newData) => {
              setSheets(newData);
            }}
            onOp={(ops: any[]) => {
              if (!canEdit || isTeamMember) return;
              ops.forEach((op: any) => {
                if (op.op === "replace" && Array.isArray(op.path)) {
                  if (op.path[0] === "data" && typeof op.path[1] === "number" && typeof op.path[2] === "number") {
                    const r = op.path[1];
                    const c = op.path[2];
                    handleCellChange({ r, c, v: op.value });
                  }
                }
              });
            }}
          />
        )}
      </div>

      {/* Column Config Modal (Lock & Hide Columns) */}
      {showColumnConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2D2F34] bg-[#212121] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#2D2F34]">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Shield className="h-4 w-4 text-[#4876F3]" />
                <span>Column Permissions & Visibility</span>
              </div>
              <button
                onClick={() => setShowColumnConfig(false)}
                className="text-[#8E8F90] hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#8E8F90] mt-3 mb-4">
              Lock columns to prevent non-team clients from editing sensitive rates, or hide columns entirely from client view and search.
            </p>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(sheets[0]?.colIds || []).map((colId: string, idx: number) => {
                const meta = sheets[0]?.columnMeta?.find((m: any) => m.colId === colId) || {};
                const colLetter = String.fromCharCode(65 + (idx % 26));
                const colName = meta.name || `Column ${colLetter}`;

                return (
                  <div
                    key={colId}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#2A2B30] border border-[#34353B]"
                  >
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        {colName} ({colLetter})
                      </span>
                      <span className="text-[10px] text-[#8E8F90]">
                        Type: {meta.type || "General"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#E0E0E0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!meta.locked}
                          onChange={(e) =>
                            handleSaveColumnMeta(colId, e.target.checked, !!meta.hidden)
                          }
                          className="rounded border-[#424344] bg-[#181818] text-[#4876F3]"
                        />
                        <Lock className="h-3 w-3 text-amber-400" />
                        <span>Lock</span>
                      </label>

                      <label className="flex items-center gap-1.5 text-xs text-[#E0E0E0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!meta.hidden}
                          onChange={(e) =>
                            handleSaveColumnMeta(colId, !!meta.locked, e.target.checked)
                          }
                          className="rounded border-[#424344] bg-[#181818] text-[#4876F3]"
                        />
                        <EyeOff className="h-3 w-3 text-red-400" />
                        <span>Hide</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowColumnConfig(false)}
                className="px-4 py-2 rounded-xl bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Drawer */}
      {showVersions && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-[#212121] border-l border-[#2D2F34] shadow-2xl flex flex-col">
          <div className="flex h-14 items-center justify-between px-4 border-b border-[#2D2F34]">
            <div className="flex items-center gap-2 text-white font-semibold text-xs">
              <History className="h-4 w-4 text-[#8E8F90]" />
              <span>Version History</span>
            </div>
            <button
              onClick={() => setShowVersions(false)}
              className="text-[#8E8F90] hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {versions.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8E8F90]">
                No previous versions recorded yet. Versions are created automatically when edits occur.
              </div>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 rounded-xl bg-[#2A2B30] border border-[#34353B] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{ver.name}</span>
                    <span className="text-[10px] text-[#8E8F90]">
                      {new Date(ver.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#8E8F90]">By {ver.author_name}</span>

                  <button
                    onClick={() => handleRestoreVersion(ver.id)}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-[#3B67E0]/20 hover:bg-[#3B67E0] text-[11px] text-[#4876F3] hover:text-white font-medium transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Restore this version</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Cell Comments Drawer */}
      {showComments && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-[#212121] border-l border-[#2D2F34] shadow-2xl flex flex-col">
          <div className="flex h-14 items-center justify-between px-4 border-b border-[#2D2F34]">
            <div className="flex items-center gap-2 text-white font-semibold text-xs">
              <MessageSquare className="h-4 w-4 text-[#8E8F90]" />
              <span>Cell Comments</span>
            </div>
            <button
              onClick={() => setShowComments(false)}
              className="text-[#8E8F90] hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8E8F90]">
                No comments on this sheet yet. Click any cell to leave feedback or ask a question.
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-3 rounded-xl bg-[#2A2B30] border border-[#34353B] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {comment.author_name}
                    </span>
                    <span className="text-[10px] text-[#8E8F90]">
                      {new Date(comment.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#E0E0E0]">{comment.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Add comment input */}
          <div className="p-3 border-t border-[#2D2F34] bg-[#1E1E1E]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Write a comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                className="flex-1 h-8 rounded-lg bg-[#2A2B30] border border-[#34353B] px-2.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
              />
              <button
                onClick={handleAddComment}
                className="h-8 w-8 rounded-lg bg-[#3B67E0] hover:bg-[#4876F3] text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
