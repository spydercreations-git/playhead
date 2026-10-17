"use client";

import React from "react";
import { MoreHorizontal, ChatBubble, VideoFileIcon, ImageFileIcon, PdfFileIcon, AudioFileIcon } from "@/components/ui/icon";
import { Checkbox } from "@/components/ui/checkbox";

export interface FileCardItem {
  id: string;
  name: string;
  type: string;
  size_bytes?: number;
  size_formatted?: string;
  thumbnail_url?: string | null;
  duration_seconds?: number;
  duration_formatted?: string;
  version?: number | string;
  comment_count?: number;
  updated_at?: string;
  badge_color?: string;
}

export interface FileCardProps {
  file: FileCardItem;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent | HTMLElement) => void;
  className?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDuration(sec?: number): string {
  if (!sec || sec === 0) return "00:00";
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins.toString().padStart(2, "0")}:${remSec.toString().padStart(2, "0")}`;
}

/**
 * Playhead File Card Component
 * Boards/02 Components:
 * - 232x224 (stretches), radius 12, fill var(--panel), border var(--border)
 * - Thumbnail: 136px height, radius 8
 * - Motion: hover scale 1.015, border var(--border-strong)
 */
export function FileCard({
  file,
  isSelected = false,
  onToggleSelect,
  onOpen,
  onContextMenu,
  className = "",
}: FileCardProps) {
  const normType = (file.type || "").toLowerCase();
  const isVideo = normType.includes("video") || normType.includes("mp4") || normType.includes("mov");
  const isImage = normType.includes("image") || normType.includes("png") || normType.includes("jpg");
  const isAudio = normType.includes("audio") || normType.includes("mp3") || normType.includes("wav");

  const sizeText = file.size_formatted || formatBytes(file.size_bytes);
  const durationText = file.duration_formatted || (file.duration_seconds ? formatDuration(file.duration_seconds) : null);
  const versionText = file.version ? (typeof file.version === "number" ? `v${file.version}` : file.version) : null;

  return (
    <div
      onDoubleClick={onOpen}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".file-menu-btn")) return;
        if ((e.target as HTMLElement).closest(".file-checkbox")) return;
        onToggleSelect?.();
      }}
      onContextMenu={onContextMenu}
      className={`group relative flex flex-col justify-between h-[224px] w-full rounded-[12px] bg-[var(--panel)] border p-2 select-none cursor-pointer transition-all duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] ${
        isSelected
          ? "border-[#4876F3] ring-1 ring-[#4876F3]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      } ${className}`}
    >
      {/* Thumbnail Area (136px height, rx 8) */}
      <div className="relative h-[136px] w-full rounded-[8px] bg-[var(--bg)] overflow-hidden flex items-center justify-center">
        {file.thumbnail_url ? (
          <img
            src={file.thumbnail_url}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[var(--text-3)]">
            {isVideo && <VideoFileIcon size={36} className="text-[#FFBB56]" />}
            {isImage && <ImageFileIcon size={36} className="text-[#FA457B]" />}
            {isAudio && <AudioFileIcon size={36} className="text-[#9787FF]" />}
            {!isVideo && !isImage && !isAudio && <PdfFileIcon size={36} className="text-[#4876F3]" />}
          </div>
        )}

        {/* Checkbox overlay top-left */}
        <div
          className={`file-checkbox absolute top-2 left-2 transition-opacity duration-150 ${
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.()}
            ariaLabel={`Select ${file.name}`}
          />
        </div>

        {/* Comment count badge top-right */}
        {Boolean(file.comment_count && file.comment_count > 0) && (
          <div className="absolute top-2 right-2 flex items-center gap-1 h-[22px] px-2 rounded-[6px] bg-black/70 backdrop-blur-sm text-xs font-medium text-white">
            <ChatBubble size={12} />
            <span>{file.comment_count}</span>
          </div>
        )}

        {/* Version badge bottom-left */}
        {versionText && (
          <div className="absolute bottom-2 left-2 flex items-center h-5 px-1.5 rounded-[5px] bg-black/70 backdrop-blur-sm text-xs font-semibold text-white">
            {versionText}
          </div>
        )}

        {/* Duration badge bottom-right */}
        {durationText && (
          <div className="absolute bottom-2 right-2 flex items-center h-5 px-1.5 rounded-[5px] bg-black/70 backdrop-blur-sm text-xs font-medium text-white font-mono tabular-nums">
            {durationText}
          </div>
        )}
      </div>

      {/* Footer Info Area */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-sm font-semibold text-white truncate" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
            {normType.split("/").pop()?.toUpperCase() || "FILE"}  ·  {sizeText}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu?.(e.currentTarget);
          }}
          className="file-menu-btn rounded-[6px] p-1 text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
