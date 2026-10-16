"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Download, Loader2, Check, FileText, Table, Eye, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { apiRequest } from "@/lib/api";

export interface PdfExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "document" | "spreadsheet";
  itemId: string;
  title: string;
  isTeamMember: boolean;
  getExportHtml?: () => string;
}

const BG_PRESETS = [
  { id: "white", label: "White", hex: "#ffffff", dark: false },
  { id: "light_grey", label: "Light grey", hex: "#f8f9fa", dark: false },
  { id: "dark", label: "Dark", hex: "#181818", dark: true },
  { id: "custom", label: "Custom", hex: "#212121", dark: true },
];

const THEME_PRESETS = [
  { hex: "#3B67E0", label: "Classic Blue" },
  { hex: "#4876F3", label: "Playhead Blue" },
  { hex: "#10B981", label: "Emerald" },
  { hex: "#8B5CF6", label: "Violet" },
  { hex: "#F59E0B", label: "Amber" },
  { hex: "#EF4444", label: "Crimson" },
  { hex: "#181818", label: "Monochrome" },
];

export function PdfExportDialog({
  open,
  onOpenChange,
  itemType,
  itemId,
  title,
  isTeamMember,
  getExportHtml,
}: PdfExportDialogProps) {
  // Config state
  const [bgChoice, setBgChoice] = useState<string>("white");
  const [customBg, setCustomBg] = useState<string>("#212121");
  const [themeColor, setThemeColor] = useState<string>("#3B67E0");
  const [pageSize, setPageSize] = useState<"A4" | "Letter">("A4");
  const [margins, setMargins] = useState<"normal" | "narrow">("normal");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    itemType === "spreadsheet" ? "landscape" : "portrait"
  );
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);
  const [includeTeamNotes, setIncludeTeamNotes] = useState<boolean>(false);

  // Preview & Export state
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const previewAbortRef = useRef<AbortController | null>(null);

  const activeBgHex = useMemo(() => {
    if (bgChoice === "custom") return customBg;
    const found = BG_PRESETS.find((p) => p.id === bgChoice);
    return found ? found.hex : "#ffffff";
  }, [bgChoice, customBg]);

  // Fetch or generate preview HTML
  useEffect(() => {
    if (!open) return;

    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    previewAbortRef.current = abortCtrl;

    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const clientHtml = getExportHtml ? getExportHtml() : "";
        const endpoint =
          itemType === "document"
            ? `/documents/${itemId}/preview-pdf-html`
            : `/spreadsheets/${itemId}/preview-pdf-html`;

        const resp = await apiRequest<{ html: string }>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            html: clientHtml,
            title,
            background: activeBgHex,
            theme_color: themeColor,
            size: pageSize,
            margins,
            orientation,
            fit_to_width: fitToWidth,
            include_team_notes: isTeamMember ? includeTeamNotes : false,
          }),
        });

        if (!abortCtrl.signal.aborted) {
          setPreviewHtml(resp.html);
        }
      } catch (err: any) {
        if (!abortCtrl.signal.aborted) {
          console.error("Preview load failed:", err);
        }
      } finally {
        if (!abortCtrl.signal.aborted) {
          setLoadingPreview(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [
    open,
    itemId,
    itemType,
    title,
    activeBgHex,
    themeColor,
    pageSize,
    margins,
    orientation,
    fitToWidth,
    includeTeamNotes,
    isTeamMember,
    getExportHtml,
  ]);

  // Export PDF Handler
  async function handleDownloadPdf() {
    setIsExporting(true);
    try {
      const clientHtml = getExportHtml ? getExportHtml() : "";
      const endpoint =
        itemType === "document"
          ? `/api/v1/documents/${itemId}/export/pdf`
          : `/api/v1/spreadsheets/${itemId}/export/pdf`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          html: clientHtml,
          title,
          background: activeBgHex,
          theme_color: themeColor,
          size: pageSize,
          margins,
          orientation,
          fit_to_width: fitToWidth,
          include_team_notes: isTeamMember ? includeTeamNotes : false,
        }),
      });

      if (!response.ok) {
        throw new Error(`PDF generation failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || (itemType === "document" ? "document" : "spreadsheet")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Download PDF failed:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-5xl h-[88vh] max-h-[850px] bg-[#181818] border border-[#2A2B30] p-0 flex flex-col overflow-hidden text-white rounded-xl shadow-overlay relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2A2B30] flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#4876F3]/10 border border-[#4876F3]/20 flex items-center justify-center text-[#4876F3]">
              {itemType === "document" ? (
                <FileText className="w-4 h-4" />
              ) : (
                <Table className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Download as PDF
              </h2>
              <p className="text-xs text-[#A3A6AD] mt-0.5 truncate max-w-md">
                {title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-[#4876F3] hover:bg-[#3B67E0] disabled:opacity-50 text-white text-xs font-medium rounded-[10px] transition-colors shadow-sm"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Split Layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Controls Sidebar */}
          <div className="w-[330px] border-r border-[#2A2B30] p-6 overflow-y-auto space-y-6 flex-shrink-0 bg-[#181818]/50">
            {/* Page Background */}
            <div>
              <label className="block text-xs font-semibold text-[#A3A6AD]  mb-2.5">
                Page Background
              </label>
              <div className="grid grid-cols-2 gap-2">
                {BG_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setBgChoice(preset.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[10px] border text-xs font-medium transition-all ${
                      bgChoice === preset.id
                        ? "border-[#4876F3] bg-[#4876F3]/10 text-white"
                        : "border-[#2A2B30] bg-[#181818] text-[#A3A6AD] hover:border-[#2E2F34] hover:text-white"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 flex-shrink-0"
                      style={{ backgroundColor: preset.hex }}
                    />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
              {bgChoice === "custom" && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="color"
                    value={customBg}
                    onChange={(e) => setCustomBg(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-[#2A2B30] bg-transparent cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={customBg}
                    onChange={(e) => setCustomBg(e.target.value)}
                    placeholder="#212121"
                    className="flex-1 px-3 py-1.5 text-xs bg-[#181818] border border-[#2A2B30] rounded-lg text-white font-mono focus:outline-none focus:border-[#4876F3]"
                  />
                </div>
              )}
            </div>

            {/* Theme Color */}
            <div>
              <label className="block text-xs font-semibold text-[#A3A6AD]  mb-1">
                Theme Color
              </label>
              <p className="text-xs text-[#A3A6AD] mb-2.5">
                Headings, links, and table headers
              </p>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((t) => (
                  <button
                    key={t.hex}
                    type="button"
                    onClick={() => setThemeColor(t.hex)}
                    title={t.label}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      themeColor.toLowerCase() === t.hex.toLowerCase()
                        ? "ring-2 ring-[#4876F3] ring-offset-2 ring-offset-[#181818] scale-[1.015]"
                        : "hover:scale-[1.015]"
                    }`}
                    style={{ backgroundColor: t.hex }}
                  >
                    {themeColor.toLowerCase() === t.hex.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                ))}
                <div className="flex items-center ml-1">
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    title="Custom theme color"
                    className="w-7 h-7 rounded-full border border-[#2A2B30] bg-transparent cursor-pointer p-0.5"
                  />
                </div>
              </div>
            </div>

            {/* Page Size & Margins */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#A3A6AD]  mb-2">
                  Page Size
                </label>
                <div className="flex rounded-lg border border-[#2A2B30] p-0.5 bg-[#181818]">
                  <button
                    type="button"
                    onClick={() => setPageSize("A4")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                      pageSize === "A4"
                        ? "bg-[#4876F3] text-white shadow-sm"
                        : "text-[#A3A6AD] hover:text-white"
                    }`}
                  >
                    A4
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSize("Letter")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                      pageSize === "Letter"
                        ? "bg-[#4876F3] text-white shadow-sm"
                        : "text-[#A3A6AD] hover:text-white"
                    }`}
                  >
                    Letter
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#A3A6AD]  mb-2">
                  Margins
                </label>
                <div className="flex rounded-lg border border-[#2A2B30] p-0.5 bg-[#181818]">
                  <button
                    type="button"
                    onClick={() => setMargins("normal")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                      margins === "normal"
                        ? "bg-[#4876F3] text-white shadow-sm"
                        : "text-[#A3A6AD] hover:text-white"
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setMargins("narrow")}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                      margins === "narrow"
                        ? "bg-[#4876F3] text-white shadow-sm"
                        : "text-[#A3A6AD] hover:text-white"
                    }`}
                  >
                    Narrow
                  </button>
                </div>
              </div>
            </div>

            {/* Spreadsheet Specific: Orientation & Fit to Width */}
            {itemType === "spreadsheet" && (
              <div className="space-y-4 pt-2 border-t border-[#2A2B30]/60">
                <div>
                  <label className="block text-xs font-semibold text-[#A3A6AD]  mb-2">
                    Orientation
                  </label>
                  <div className="flex rounded-lg border border-[#2A2B30] p-0.5 bg-[#181818]">
                    <button
                      type="button"
                      onClick={() => setOrientation("landscape")}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        orientation === "landscape"
                          ? "bg-[#4876F3] text-white shadow-sm"
                          : "text-[#A3A6AD] hover:text-white"
                      }`}
                    >
                      Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation("portrait")}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        orientation === "portrait"
                          ? "bg-[#4876F3] text-white shadow-sm"
                          : "text-[#A3A6AD] hover:text-white"
                      }`}
                    >
                      Portrait
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={fitToWidth}
                    onChange={(e) => setFitToWidth(e.target.checked)}
                    className="w-4 h-4 rounded border-[#2A2B30] text-[#4876F3] bg-[#181818] focus:ring-[#4876F3] focus:ring-offset-0"
                  />
                  <span className="text-xs text-white">Fit tables to width</span>
                </label>
              </div>
            )}

            {/* Team Notes Toggle (strictly team members only) */}
            {isTeamMember && (
              <div className="pt-2 border-t border-[#2A2B30]/60">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeTeamNotes}
                    onChange={(e) => setIncludeTeamNotes(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-[#2A2B30] text-[#4876F3] bg-[#181818] focus:ring-[#4876F3] focus:ring-offset-0"
                  />
                  <div>
                    <span className="text-xs font-medium text-white block">
                      Include team notes
                    </span>
                    <span className="text-xs text-[#A3A6AD] leading-tight block mt-0.5">
                      Renders internal team note callouts (hidden from clients)
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Live Preview Panel */}
          <div className="flex-1 bg-[#181818] p-6 flex flex-col items-center justify-center overflow-auto relative">
            <div className="absolute top-4 left-6 flex items-center gap-2 text-xs text-[#A3A6AD]">
              <Eye className="w-3.5 h-3.5" />
              <span>Live Page Preview</span>
            </div>

            {loadingPreview && (
              <div className="absolute inset-0 bg-[#181818]/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181818] border border-[#2A2B30] text-xs text-[#A3A6AD]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4876F3]" />
                  <span>Updating preview...</span>
                </div>
              </div>
            )}

            {/* Simulated Paper Sheet */}
            <div
              className={`rounded shadow-overlay transition-all duration-200 overflow-hidden border border-[#2A2B30]/80 ${
                orientation === "landscape"
                  ? "w-full max-w-[800px] aspect-[1.414/1]"
                  : "w-full max-w-[550px] aspect-[1/1.414]"
              }`}
              style={{ backgroundColor: activeBgHex }}
            >
              {previewHtml ? (
                <iframe
                  title="PDF Preview"
                  srcDoc={previewHtml}
                  className="w-full h-full border-0 select-none pointer-events-none"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#A3A6AD]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Generating preview...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
