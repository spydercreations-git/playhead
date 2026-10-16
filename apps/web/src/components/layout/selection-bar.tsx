"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  MoreHorizontal,
  Link2,
  Download,
  Users,
  Trash2,
  FolderInput,
  Copy,
  FolderOutput,
} from "@/components/ui/icon";

interface SelectionBarProps {
  selectedCount: number;
  selectedBytes: number;
  selectedFolderCount: number;
  selectedFileCount: number;
  onClearSelection: () => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onManageAccess: () => void;
  onDelete: () => void;
  onMoveTo: () => void;
  onDuplicate: () => void;
  onCopyTo: () => void;
  canDownload?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function SelectionBar({
  selectedCount,
  selectedBytes,
  selectedFolderCount,
  selectedFileCount,
  onClearSelection,
  onCopyLink,
  onDownload,
  onManageAccess,
  onDelete,
  onMoveTo,
  onDuplicate,
  onCopyTo,
  canDownload = true,
}: SelectionBarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [moreMenuOpen]);

  if (selectedCount === 0) return null;

  // Format label: "1 folder selected · 0 B", "2 files selected · 12 MB", or "3 items selected · 12 MB"
  let itemTypeLabel = "item";
  if (selectedFolderCount > 0 && selectedFileCount === 0) {
    itemTypeLabel = selectedFolderCount === 1 ? "folder" : "folders";
  } else if (selectedFileCount > 0 && selectedFolderCount === 0) {
    itemTypeLabel = selectedFileCount === 1 ? "file" : "files";
  } else {
    itemTypeLabel = selectedCount === 1 ? "item" : "items";
  }

  const selectionText = `${selectedCount} ${itemTypeLabel} selected · ${formatBytes(selectedBytes)}`;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#212121] border border-[#2E2F34] px-4 py-2 rounded-xl shadow-overlay flex items-center justify-between gap-6 text-xs font-medium text-white z-50 animate-in fade-in slide-in-from-bottom-3 min-w-[420px] max-w-[90vw]">
      {/* Left side: X and "{n} {type} selected · {bytes}" */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClearSelection}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
          title="Deselect all"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="font-semibold text-white tracking-tight">{selectionText}</span>
      </div>

      {/* Right side: ⋯ (opens upward), Copy link, Download, Manage access */}
      <div className="flex items-center gap-2">
        {/* ⋯ Button with Upward Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              moreMenuOpen
                ? "bg-[#2A2B30] text-white"
                : "text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white"
            }`}
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Upward Dropdown Menu */}
          {moreMenuOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-[#2E2F34] bg-[#212121] p-1 shadow-overlay z-50 animate-in fade-in zoom-in-95">
              {/* Delete in red at top */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-rose-400 hover:bg-[#2A2B30] rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="h-px bg-[#2E2F34] my-1" />

              {/* Move to */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onMoveTo();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
              >
                <FolderInput className="w-3.5 h-3.5 text-[#A3A6AD]" />
                <span>Move to</span>
              </button>

              {/* Duplicate */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onDuplicate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-[#A3A6AD]" />
                <span>Duplicate</span>
              </button>

              {/* Copy to */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onCopyTo();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] rounded-lg transition-colors"
              >
                <FolderOutput className="w-3.5 h-3.5 text-[#A3A6AD]" />
                <span>Copy to</span>
              </button>
            </div>
          )}
        </div>

        {/* Copy link */}
        <button
          type="button"
          onClick={onCopyLink}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Copy link</span>
        </button>

        {/* Download */}
        {canDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        )}

        {/* Manage access */}
        <button
          type="button"
          onClick={onManageAccess}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium bg-[#2A2B30] text-white hover:bg-[#2E2F34] transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          <span>Manage access</span>
        </button>
      </div>
    </div>
  );
}
