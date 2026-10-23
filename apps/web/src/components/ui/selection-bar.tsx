"use client";

import React from "react";
import { Close, Download, DriveFolderUpload, Star, Share, Trash } from "@/components/ui/icon";

export interface SelectionBarProps {
  count: number;
  onClear: () => void;
  onDownload?: () => void;
  onMove?: () => void;
  onStar?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Playhead Floating Selection Bar
 * Boards/02 Components:
 * - Height 52px, radius 12, fill var(--panel-raised), border var(--border), shadow
 * - Motion: 0.98 to 1 scale in
 */
export function SelectionBar({
  count,
  onClear,
  onDownload,
  onMove,
  onStar,
  onShare,
  onDelete,
  actions,
  className = "",
}: SelectionBarProps) {
  if (count <= 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center h-[52px] px-4 gap-3.5 rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] select-none animate-in fade-in-0 duration-150 ${className}`}
    >
      {/* Clear button */}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="text-[var(--text-2)] hover:text-white transition-colors p-1 -ml-1 rounded-[6px]"
      >
        <Close size={20} />
      </button>

      {/* Selected count */}
      <span className="text-sm font-semibold text-white whitespace-nowrap">
        {count} selected
      </span>

      {/* Divider */}
      <div className="h-5 w-[1px] bg-[var(--border)]" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {actions || (
          <>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-all"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
            )}

            {onMove && (
              <button
                type="button"
                onClick={onMove}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-all"
              >
                <DriveFolderUpload size={16} />
                <span>Move</span>
              </button>
            )}

            {onStar && (
              <button
                type="button"
                onClick={onStar}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-all"
              >
                <Star size={16} />
                <span>Star</span>
              </button>
            )}

            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-all"
              >
                <Share size={16} />
                <span>Share</span>
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-xs font-semibold text-[#F0506E] hover:bg-[#F0506E]/15 transition-all ml-1"
              >
                <Trash size={16} />
                <span>Delete</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
