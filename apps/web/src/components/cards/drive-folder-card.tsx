"use client";

import React from "react";
import { MoreHorizontal, VideoFileIcon, ImageFileIcon, PdfFileIcon, AudioFileIcon, Folder } from "@/components/ui/icon";

export interface DriveFolderCardProps {
  id: string;
  name: string;
  category?: "videos" | "images" | "documents" | "music" | "custom";
  fileCount: number | string;
  totalSize: string;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

const CATEGORY_STYLES = {
  videos: {
    color: "#FFFFFF",
    bg: "color-mix(in srgb, var(--accent) 22%, transparent)",
    icon: VideoFileIcon,
  },
  images: {
    color: "#FFFFFF",
    bg: "color-mix(in srgb, var(--accent) 22%, transparent)",
    icon: ImageFileIcon,
  },
  documents: {
    color: "#FFFFFF",
    bg: "color-mix(in srgb, var(--accent) 22%, transparent)",
    icon: PdfFileIcon,
  },
  music: {
    color: "#FFFFFF",
    bg: "color-mix(in srgb, var(--accent) 22%, transparent)",
    icon: AudioFileIcon,
  },
  custom: {
    color: "#FFFFFF",
    bg: "color-mix(in srgb, var(--accent) 22%, transparent)",
    icon: Folder,
  },
};

/**
 * Playhead My Drive Folder Card Component
 * Boards/02 Components:
 * - 300x88 (stretches), radius 12, fill var(--panel), border var(--border)
 * - 40x40 icon badge rx 10
 * - Motion: hover scale 1.015, border var(--border-strong)
 */
export function DriveFolderCard({
  id: _id,
  name,
  category = "custom",
  fileCount,
  totalSize,
  onOpen,
  onContextMenu,
  className = "",
}: DriveFolderCardProps) {
  const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.custom;
  const IconComponent = style.icon;

  const isZero = fileCount === 0 || fileCount === "0" || fileCount === "Empty";
  const countText = isZero
    ? "Empty"
    : typeof fileCount === "number"
    ? `${fileCount} ${fileCount === 1 ? "file" : "files"}`
    : fileCount;

  const subtitleText = isZero
    ? "Empty"
    : totalSize
    ? `${countText}  ·  ${totalSize}`
    : countText;

  return (
    <div
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className={`group flex items-center justify-between h-[88px] w-full rounded-[12px] bg-[var(--panel)] border border-[var(--border)] hover:border-[var(--border-strong)] p-4 select-none cursor-pointer transition-all duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] ${className}`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* 40x40 Icon Badge */}
        <div
          className="flex items-center justify-center h-10 w-10 rounded-[10px] shrink-0"
          style={{ backgroundColor: style.bg, color: style.color }}
        >
          <IconComponent size={20} />
        </div>

        {/* Texts */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
            {subtitleText}
          </p>
        </div>
      </div>

      {/* More Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu?.(e);
        }}
        className="rounded-[6px] p-1.5 text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors shrink-0"
        aria-label="Folder options"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
