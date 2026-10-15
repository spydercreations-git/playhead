"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
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
  Video,
  Calendar,
  X,
  Check,
} from "lucide-react";
import "@fortune-sheet/react/dist/index.css";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import ExcelJS from "exceljs";
import { apiRequest } from "@/lib/api";
import {
  buildSheetsFromYDoc,
  populateYDocIfEmpty,
  applyFortuneSheetOpsToYDoc,
} from "./yjs-sheet-binding";

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

// 6 Status colors and chip styles per spec Section 6.11
export const STATUS_OPTIONS = [
  { name: "Not started", bg: "#2A2B30", border: "#3F4045", text: "#9CA3AF", dot: "#6B7280" },
  { name: "Editing", bg: "#1E293B", border: "#2563EB", text: "#60A5FA", dot: "#3B82F6" },
  { name: "Needs review", bg: "#451A03", border: "#D97706", text: "#FBBF24", dot: "#F59E0B" },
  { name: "Changes requested", bg: "#450A0A", border: "#DC2626", text: "#F87171", dot: "#EF4444" },
  { name: "Approved", bg: "#064E3B", border: "#059669", text: "#34D399", dot: "#10B981" },
  { name: "Delivered", bg: "#2E1065", border: "#7C3AED", text: "#C084FC", dot: "#8B5CF6" },
];

export function SpreadsheetEditor({
  id,
  initialData,
  isTeamMember,
  canEdit,
  user,
}: SpreadsheetEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheets, setSheets] = useState<any[]>(initialData?.sheets || []);
  const [title, setTitle] = useState(initialData?.title || "Untitled Spreadsheet");
  const [statusText, setStatusText] = useState("Connected");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select title when spreadsheet is newly created per Part C spec
  useEffect(() => {
    const isNew = searchParams?.get("new") === "1" || initialData?.title === "Untitled Spreadsheet";
    if (isNew && canEdit) {
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 150);
    }
  }, [searchParams, initialData?.title, canEdit]);
  const [activeSheetId, setActiveSheetId] = useState<string>(
    initialData?.sheets?.[0]?.id || "sheet_1"
  );
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);

  // Project context for Person & File link cells
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [projectVideos, setProjectVideos] = useState<any[]>([]);

  // Drawers & Modals
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Custom cell interactive popup
  const [cellPopup, setCellPopup] = useState<{
    visible: boolean;
    type: "status" | "person" | "file" | "date";
    r: number;
    c: number;
    x: number;
    y: number;
  } | null>(null);

  const [notification, setNotification] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const workbookRef = useRef<any>(null);
  const isApplyingRemoteUpdate = useRef<boolean>(false);

  const notify = (type: "error" | "success", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load project members and video files for Editor & File link cells
  useEffect(() => {
    const projectId = initialData?.project_id;
    if (!projectId) return;

    // Load members
    apiRequest<any>(`/projects/${projectId}`)
      .then((data) => {
        if (data?.people) {
          setProjectMembers(data.people);
        }
      })
      .catch(() => {});

    // Load project items (videos)
    apiRequest<any>(`/projects/${projectId}/items`)
      .then((data) => {
        if (Array.isArray(data?.items)) {
          const videos = data.items.filter((it: any) => it.kind === "video");
          setProjectVideos(videos);
        }
      })
      .catch(() => {});
  }, [initialData?.project_id]);

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
          onSynced: () => {
            // Once synced with cloud, populate initial template if doc was empty
            if (ydoc.getArray("sheets").length === 0 && initialData?.sheets) {
              populateYDocIfEmpty(ydoc, initialData.sheets);
            }
            // Build sheets from Y.Doc
            const fromYDoc = buildSheetsFromYDoc(ydoc, false);
            if (fromYDoc.length > 0) {
              setSheets(fromYDoc);
            }
          },
        });

        providerRef.current = provider;

        // When remote updates arrive from other team members
        ydoc.on("update", (update: Uint8Array, origin: any) => {
          if (origin === "team_local_op") {
            // Skip our own local edit echo
            return;
          }

          // Remote update received! Apply to FortuneSheet without echo loops
          isApplyingRemoteUpdate.current = true;
          try {
            const updated = buildSheetsFromYDoc(ydoc, false);
            if (updated.length > 0) {
              setSheets(updated);
            }
            setStatusText("Saved to cloud");
          } finally {
            setTimeout(() => {
              isApplyingRemoteUpdate.current = false;
            }, 50);
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
      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
      const sId = currentSheet?.id || "sheet_1";
      const rowId = currentSheet?.rowIds?.[activeCell?.r || 0] || `r_${activeCell?.r || 0}`;
      const colId = currentSheet?.colIds?.[activeCell?.c || 0] || `c_${activeCell?.c || 0}`;

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

  // Team & Client Op Handler
  const handleFortuneSheetOps = useCallback(
    async (ops: any[]) => {
      if (!canEdit) return;
      if (isApplyingRemoteUpdate.current) return;

      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];

      // A. TEAM MEMBERS: Write to live Y.Doc with stable row & col IDs
      if (isTeamMember && ydocRef.current) {
        applyFortuneSheetOpsToYDoc(ydocRef.current, ops, currentSheet?.id || "sheet_1");
        setStatusText("Saved to cloud");
        return;
      }

      // B. CLIENT MEMBERS (Non-team): Forward through server sanitized API
      // Requirement 2 & 4: Use the sheet the client is actually editing!
      if (!isTeamMember) {
        for (const op of ops) {
          if (op.op === "replace" && Array.isArray(op.path) && op.path[0] === "data") {
            const r = op.path[1];
            const c = op.path[2];
            const targetSheetId = op.id || activeSheetId;
            const targetSheet = sheets.find((s) => s.id === targetSheetId) || currentSheet;

            const rowId = targetSheet?.rowIds?.[r] || `r_${r}`;
            const colId = targetSheet?.colIds?.[c] || `c_${c}`;

            try {
              await apiRequest(`/spreadsheets/${id}/cells`, {
                method: "POST",
                body: JSON.stringify({
                  sheet_id: targetSheet?.id || targetSheetId,
                  row_id: rowId,
                  col_id: colId,
                  value: op.value,
                }),
              });
              setStatusText("Saved");
            } catch (err: any) {
              notify("error", err.message || "Failed to save cell edit");
            }
          }
        }
      }
    },
    [canEdit, isTeamMember, id, sheets, activeSheetId]
  );

  // Column Locking & Hiding (Admins/Managers)
  const handleSaveColumnMeta = async (colId: string, locked: boolean, hidden: boolean) => {
    try {
      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
      const sId = currentSheet?.id || "sheet_1";

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

  // Set Custom Cell Value (from dropdowns/popups)
  const setCustomCellValue = (value: any) => {
    if (!cellPopup) return;
    const { r, c } = cellPopup;
    setCellPopup(null);

    // If FortuneSheet API is available, update cell directly
    if (workbookRef.current?.setCellValue) {
      workbookRef.current.setCellValue(r, c, value);
    }

    // Trigger op flow
    handleFortuneSheetOps([
      {
        op: "replace",
        id: activeSheetId,
        path: ["data", r, c],
        value: typeof value === "object" ? value : { v: value, m: String(value) },
      },
    ]);
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
      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
      if (!currentSheet) return;

      const maxR = currentSheet.row || 30;
      const maxC = currentSheet.column || 10;
      const matrix: string[][] = Array.from({ length: maxR }, () =>
        Array.from({ length: maxC }, () => "")
      );

      if (Array.isArray(currentSheet.celldata)) {
        currentSheet.celldata.forEach((item: any) => {
          if (item.r < maxR && item.c < maxC) {
            matrix[item.r][item.c] = String(item.v?.m ?? item.v?.v ?? "");
          }
        });
      }

      const csvContent = matrix
        .map((row) =>
          row
            .map((val) => {
              const escaped = String(val).replace(/"/g, '""');
              return `"${escaped}"`;
            })
            .join(",")
        )
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Spreadsheet"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportMenu(false);
      notify("success", "CSV downloaded");
    } catch (err) {
      notify("error", "Failed to export CSV");
    }
  };

  const handlePrint = () => {
    setShowExportMenu(false);
    window.print();
  };

  // Canvas Custom Cell Rendering Hooks
  const hooks = {
    afterActivateSheet: (sheetId: string) => {
      setActiveSheetId(sheetId);
    },

    afterCellMouseDown: (cell: any, cellInfo: any) => {
      if (!canEdit) return;
      const { row, column, startX, startY } = cellInfo;
      setActiveCell({ r: row, c: column });

      if (row === 0) return; // Header row

      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
      const colMeta = currentSheet?.columnMeta?.[column];
      const colName = colMeta?.name || "";

      if (colName === "Status" || colMeta?.type === "dropdown") {
        setCellPopup({
          visible: true,
          type: "status",
          r: row,
          c: column,
          x: Math.min(window.innerWidth - 200, Math.max(20, startX + 60)),
          y: Math.min(window.innerHeight - 260, startY + 100),
        });
      } else if (colName === "Editor" || colMeta?.type === "person") {
        setCellPopup({
          visible: true,
          type: "person",
          r: row,
          c: column,
          x: Math.min(window.innerWidth - 220, Math.max(20, startX + 60)),
          y: Math.min(window.innerHeight - 260, startY + 100),
        });
      } else if (colName === "File" || colMeta?.type === "file") {
        setCellPopup({
          visible: true,
          type: "file",
          r: row,
          c: column,
          x: Math.min(window.innerWidth - 240, Math.max(20, startX + 60)),
          y: Math.min(window.innerHeight - 260, startY + 100),
        });
      } else if (colName === "Due date" || colMeta?.type === "date") {
        setCellPopup({
          visible: true,
          type: "date",
          r: row,
          c: column,
          x: Math.min(window.innerWidth - 200, Math.max(20, startX + 60)),
          y: Math.min(window.innerHeight - 200, startY + 100),
        });
      } else {
        setCellPopup(null);
      }
    },

    afterRenderCell: (cell: any, cellInfo: any, ctx: CanvasRenderingContext2D) => {
      const { row, column, startX, startY, endX, endY } = cellInfo;
      if (row === 0 || !cell?.v) return;

      const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
      const colMeta = currentSheet?.columnMeta?.[column];
      const colName = colMeta?.name || "";
      const rawVal = typeof cell.v === "object" ? cell.v.v : cell.v;
      const strVal = String(rawVal || "").trim();

      const w = endX - startX;
      const h = endY - startY;

      // 1. Render Status Chips with exact 6 colors
      if (colName === "Status" || colMeta?.type === "dropdown") {
        const matched = STATUS_OPTIONS.find(
          (opt) => opt.name.toLowerCase() === strVal.toLowerCase()
        );
        if (matched) {
          // Clear cell background on canvas
          ctx.fillStyle = "#181818";
          ctx.fillRect(startX + 1, startY + 1, w - 2, h - 2);

          const chipW = Math.min(w - 12, 130);
          const chipH = 22;
          const chipX = startX + 6;
          const chipY = startY + (h - chipH) / 2;

          // Draw chip pill
          ctx.beginPath();
          ctx.roundRect(chipX, chipY, chipW, chipH, 6);
          ctx.fillStyle = matched.bg;
          ctx.fill();
          ctx.strokeStyle = matched.border;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Dot
          ctx.beginPath();
          ctx.arc(chipX + 10, chipY + 11, 3, 0, Math.PI * 2);
          ctx.fillStyle = matched.dot;
          ctx.fill();

          // Text
          ctx.fillStyle = matched.text;
          ctx.font = "bold 11px sans-serif";
          ctx.textBaseline = "middle";
          ctx.fillText(matched.name, chipX + 18, chipY + 11);
        }
      }

      // 2. Render Person Cell with Avatar
      else if (colName === "Editor" || colMeta?.type === "person") {
        if (strVal) {
          ctx.fillStyle = "#181818";
          ctx.fillRect(startX + 1, startY + 1, w - 2, h - 2);

          const circleX = startX + 14;
          const circleY = startY + h / 2;
          ctx.beginPath();
          ctx.arc(circleX, circleY, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#3B67E0";
          ctx.fill();

          const initial = strVal.charAt(0).toUpperCase();
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initial, circleX, circleY);

          ctx.textAlign = "left";
          ctx.fillStyle = "#E0E0E0";
          ctx.font = "11px sans-serif";
          ctx.fillText(strVal, circleX + 12, circleY);
        }
      }

      // 3. Render File Link Cell with Thumbnail & Version
      else if (colName === "File" || colMeta?.type === "file") {
        if (strVal) {
          ctx.fillStyle = "#181818";
          ctx.fillRect(startX + 1, startY + 1, w - 2, h - 2);

          const hasAccess = !strVal.toLowerCase().includes("no access");
          if (hasAccess) {
            // Video Play Icon
            ctx.fillStyle = "#4876F3";
            ctx.font = "10px sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillText("▶", startX + 8, startY + h / 2);

            ctx.fillStyle = "#E0E0E0";
            ctx.font = "11px sans-serif";
            const displayName = strVal.length > 16 ? strVal.slice(0, 14) + "..." : strVal;
            ctx.fillText(displayName, startX + 22, startY + h / 2);

            // Version badge
            ctx.fillStyle = "#2A2B30";
            ctx.beginPath();
            ctx.roundRect(endX - 34, startY + (h - 16) / 2, 26, 16, 4);
            ctx.fill();
            ctx.fillStyle = "#8E8F90";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("v1", endX - 21, startY + h / 2);
            ctx.textAlign = "left";
          } else {
            // No access locked card
            ctx.fillStyle = "#EF4444";
            ctx.font = "bold 11px sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillText("Locked (No access)", startX + 8, startY + h / 2);
          }
        }
      }
    },
  };

  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];

  return (
    <div className="flex h-screen w-screen flex-col bg-[#181818] text-[#E0E0E0] select-none font-sans">
      {/* Notification Toast */}
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
              ref={titleInputRef}
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
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#3B67E0] hover:bg-[#4876F3] text-xs font-medium text-white transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 rounded-xl border border-[#2D2F34] bg-[#212121] p-1 shadow-2xl z-50">
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
      <div className="relative flex-1 w-full overflow-hidden bg-[#181818] tabular-nums">
        {sheets.length > 0 && (
          <Workbook
            ref={workbookRef}
            data={sheets}
            showToolbar={true}
            showFormulaBar={true}
            showSheetTabs={true}
            hooks={hooks}
            onChange={(newData) => {
              if (isApplyingRemoteUpdate.current) return;
              setSheets(newData);
            }}
            onOp={(ops: any[]) => {
              handleFortuneSheetOps(ops);
            }}
          />
        )}

        {/* Custom Cell Floating Popups */}
        {cellPopup?.visible && (
          <div
            className="fixed z-50 rounded-xl border border-[#2D2F34] bg-[#212121] p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150 w-52"
            style={{ top: cellPopup.y, left: cellPopup.x }}
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#2D2F34]">
              <span className="text-[11px] font-semibold text-[#8E8F90] uppercase tracking-wider">
                Select {cellPopup.type}
              </span>
              <button
                onClick={() => setCellPopup(null)}
                className="text-[#8E8F90] hover:text-white p-1 rounded hover:bg-[#2A2B30] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 1. Status selector with 6 colors */}
            {cellPopup.type === "status" && (
              <div className="space-y-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.name}
                    onClick={() =>
                      setCustomCellValue({
                        v: opt.name,
                        m: opt.name,
                        bg: opt.bg,
                        fc: opt.text,
                      })
                    }
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2A2B30] transition-colors"
                    style={{ color: opt.text }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: opt.dot }}
                    />
                    <span>{opt.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 2. Person selector */}
            {cellPopup.type === "person" && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {projectMembers.length > 0 ? (
                  projectMembers.map((member: any) => (
                    <button
                      key={member.user_id || member.email}
                      onClick={() =>
                        setCustomCellValue({
                          v: member.name || member.email,
                          m: member.name || member.email,
                          editor_id: member.user_id,
                        })
                      }
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white hover:bg-[#2A2B30] transition-colors text-left"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3B67E0] text-[10px] font-bold text-white">
                        {(member.name || member.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <span className="block truncate font-medium">
                          {member.name || member.email}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-3 text-center text-xs text-[#8E8F90]">
                    No members found
                  </div>
                )}
              </div>
            )}

            {/* 3. File selector */}
            {cellPopup.type === "file" && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {projectVideos.length > 0 ? (
                  projectVideos.map((vid: any) => (
                    <button
                      key={vid.id}
                      onClick={() =>
                        setCustomCellValue({
                          v: vid.name,
                          m: vid.name,
                          item_id: vid.id,
                          version: "v1",
                          status: vid.review_status || "needs_review",
                        })
                      }
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white hover:bg-[#2A2B30] transition-colors text-left"
                    >
                      <Video className="h-3.5 w-3.5 text-[#4876F3] shrink-0" />
                      <span className="truncate">{vid.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="space-y-1">
                    <button
                      onClick={() =>
                        setCustomCellValue({
                          v: "Brand_Film_v2.mp4",
                          m: "Brand_Film_v2.mp4",
                          version: "v2",
                          status: "Approved",
                        })
                      }
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-white hover:bg-[#2A2B30] transition-colors"
                    >
                      <Video className="h-3.5 w-3.5 text-[#4876F3]" />
                      <span>Brand_Film_v2.mp4</span>
                    </button>
                    <button
                      onClick={() =>
                        setCustomCellValue({
                          v: "No access",
                          m: "No access",
                          no_access: true,
                        })
                      }
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-[#2A2B30] transition-colors"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>No access</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 4. Date selector */}
            {cellPopup.type === "date" && (
              <div className="p-1">
                <input
                  type="date"
                  autoFocus
                  onChange={(e) => {
                    if (e.target.value) {
                      setCustomCellValue(e.target.value);
                    }
                  }}
                  className="w-full rounded bg-[#2A2B30] border border-[#34353B] text-white text-xs px-2 py-1.5 focus:outline-none focus:border-[#4876F3]"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Column Config Modal (Lock & Hide Columns) */}
      {showColumnConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2D2F34] bg-[#212121] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#2D2F34]">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Shield className="h-4 w-4 text-[#4876F3]" />
                <span>Column Permissions & Visibility</span>
              </div>
              <button
                onClick={() => setShowColumnConfig(false)}
                className="text-[#8E8F90] hover:text-white p-1 rounded hover:bg-[#2A2B30] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-[#8E8F90] mt-3 mb-4">
              Lock columns to prevent non-team clients from editing sensitive rates, or hide columns entirely from client view and search.
            </p>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(activeSheet?.colIds || []).map((colId: string, idx: number) => {
                const meta = activeSheet?.columnMeta?.find((m: any) => m.colId === colId) || {};
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
                        <EyeOff className="h-3 w-3 text-rose-400" />
                        <span>Hide</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Version History Drawer */}
      {showVersions && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 border-l border-[#2D2F34] bg-[#212121] p-5 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2F34]">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <History className="h-4 w-4 text-[#4876F3]" />
              <span>Version History</span>
            </div>
            <button
              onClick={() => setShowVersions(false)}
              className="text-[#8E8F90] hover:text-white p-1 rounded hover:bg-[#2A2B30] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {versions.map((ver) => (
              <div
                key={ver.id}
                className="p-3 rounded-xl bg-[#2A2B30] border border-[#34353B] flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    {ver.name || "Automatic version"}
                  </span>
                  <span className="text-[10px] text-[#8E8F90]">
                    {new Date(ver.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[#8E8F90]">
                    {ver.created_by_name || "Team Member"}
                  </span>
                  <button
                    onClick={() => handleRestoreVersion(ver.id)}
                    className="flex items-center gap-1 text-[11px] text-[#4876F3] hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Restore</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cell Comments Drawer */}
      {showComments && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 border-l border-[#2D2F34] bg-[#212121] p-5 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2F34]">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <MessageSquare className="h-4 w-4 text-[#4876F3]" />
              <span>Cell Comments</span>
            </div>
            <button
              onClick={() => setShowComments(false)}
              className="text-[#8E8F90] hover:text-white p-1 rounded hover:bg-[#2A2B30] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {comments.map((comm) => (
              <div
                key={comm.id}
                className="p-3 rounded-xl bg-[#2A2B30] border border-[#34353B] space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white">
                    {comm.author_name || "Collaborator"}
                  </span>
                  <span className="text-[#8E8F90]">
                    {new Date(comm.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-[#E0E0E0]">{comm.content}</p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#2D2F34] flex gap-2">
            <input
              type="text"
              placeholder="Add comment..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
              className="flex-1 rounded-lg bg-[#2A2B30] px-3 py-1.5 text-xs text-white border border-[#34353B] focus:outline-none focus:border-[#4876F3]"
            />
            <button
              onClick={handleAddComment}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B67E0] text-white hover:bg-[#4876F3]"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
