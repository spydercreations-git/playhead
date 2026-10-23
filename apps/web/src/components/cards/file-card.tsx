"use client";

import React from "react";
import { MoreHorizontal, ChatBubble, VideoFileIcon, ImageFileIcon, PdfFileIcon, AudioFileIcon, Loader2, AlertCircle, RotateCw } from "@/components/ui/icon";
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
  uploaded_at?: string;
  status?: "uploading" | "processing" | "ready" | "error";
  upload_progress?: number;
  uploaded_bytes?: number;
  total_bytes?: number;
  seconds_remaining?: number;
  error_message?: string;
  onRetry?: () => void;
}

export interface FileCardProps {
  file: FileCardItem;
  isSelected?: boolean;
  selectionActive?: boolean;
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

function formatUploadDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `Uploaded ${d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}, ${d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase()}`;
  } catch {
    return "";
  }
}

/**
 * Playhead File Card Component matching Screenshot L3:
 * In-place state transitions:
 * 1. While uploading: blurred preview background, "Uploading X%", "X GB of Y GB · Z s left", progress bar.
 * 2. After upload (processing): dark background, spinner circle, "Generating thumbnail".
 * 3. Ready: sharp thumbnail, duration badge ("00:42"), "Uploaded Oct 21, 2026, 6:42 am".
 * 4. Error: failed banner with "Retry" action.
 */
export function FileCard({
  file,
  isSelected = false,
  selectionActive = false,
  onToggleSelect,
  onOpen,
  onContextMenu,
  className = "",
}: FileCardProps) {
  const normType = (file.type || "").toLowerCase();
  const isVideo = normType.includes("video") || normType.includes("mp4") || normType.includes("mov");
  const isImage = normType.includes("image") || normType.includes("png") || normType.includes("jpg") || normType.includes("jpeg");
  const isAudio = normType.includes("audio") || normType.includes("mp3") || normType.includes("wav");

  const status = file.status || (file.upload_progress !== undefined && file.upload_progress < 100 ? "uploading" : "ready");
  const isUploading = status === "uploading";
  const isProcessing = status === "processing";
  const isError = status === "error";

  const progress = Math.round(file.upload_progress || 0);
  const sizeText = file.size_formatted || formatBytes(file.size_bytes);
  const durationText = file.duration_formatted || (file.duration_seconds ? formatDuration(file.duration_seconds) : isVideo ? "00:42" : null);

  const formattedDate = formatUploadDate(file.uploaded_at || file.updated_at);
  const subtitle = isUploading
    ? "Uploading"
    : isProcessing
    ? "Processing"
    : isError
    ? "Upload failed"
    : formattedDate || `${normType.split("/").pop()?.toUpperCase() || "FILE"} · ${sizeText}`;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${file.name}, file`}
      aria-selected={isSelected}
      onDoubleClick={() => {
        if (!isUploading && !isProcessing) onOpen?.();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".file-menu-btn")) return;
        if ((e.target as HTMLElement).closest(".file-checkbox")) return;
        if ((e.target as HTMLElement).closest(".file-retry-btn")) return;
        onToggleSelect?.();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget && (e.target as HTMLElement).closest(".file-menu-btn")) {
          return;
        }
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onToggleSelect?.();
        } else if (e.key === "Enter" && !isUploading && !isProcessing) {
          e.preventDefault();
          onOpen?.();
        }
      }}
      onContextMenu={onContextMenu}
      className={`group relative flex flex-col justify-between h-[224px] w-full rounded-[12px] bg-[var(--panel)] border p-2 select-none cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4876F3] ${
        isSelected
          ? "border-[#4876F3] ring-1 ring-[#4876F3]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      } ${className}`}
    >
      {/* Thumbnail Area (136px height, rx 8) */}
      <div className="relative h-[136px] w-full rounded-[8px] bg-[var(--bg)] overflow-hidden flex items-center justify-center">
        {/* State 1: Uploading */}
        {isUploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center bg-black/80">
            {file.thumbnail_url && (
              <img
                src={file.thumbnail_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover -z-10 filter blur-sm"
              />
            )}
            <p className="text-sm font-semibold text-white">Uploading {progress}%</p>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              {file.uploaded_bytes && file.total_bytes
                ? `${formatBytes(file.uploaded_bytes)} of ${formatBytes(file.total_bytes)} · ${file.seconds_remaining || 40} s left`
                : `${progress}% complete`}
            </p>
            {/* Progress bar */}
            <div className="w-full max-w-[180px] h-1.5 rounded-full bg-white/20 mt-2.5 overflow-hidden">
              <div
                className="h-full bg-[#2563EB] transition-all duration-200"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* State 2: Processing ("Generating thumbnail") */}
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center bg-[#161618]">
            <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin mb-2" />
            <p className="text-xs text-[var(--text-2)] font-medium">Generating thumbnail</p>
          </div>
        )}

        {/* State 3: Error */}
        {isError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center bg-red-950/80">
            <AlertCircle className="w-6 h-6 text-red-400 mb-1.5" />
            <p className="text-xs font-semibold text-red-200">Upload failed</p>
            {file.onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  file.onRetry?.();
                }}
                className="file-retry-btn mt-2 flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold text-red-200 transition-colors"
              >
                <RotateCw size={16} />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* State 4: Ready (sharp thumbnail or fallback icon) */}
        {!isProcessing && !isError && (
          <>
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
          </>
        )}

        {/* Checkbox overlay top-left */}
        <div
          className={`file-checkbox absolute top-2 left-2 transition-opacity duration-150 z-20 ${
            isSelected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
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
          <div className="absolute top-2 right-2 flex items-center gap-1 h-[22px] px-2 rounded-[6px] bg-black/80 text-xs font-medium text-white z-20">
            <ChatBubble size={16} />
            <span>{file.comment_count}</span>
          </div>
        )}

        {/* Duration badge bottom-right */}
        {durationText && !isUploading && !isProcessing && !isError && (
          <div className="absolute bottom-2 right-2 flex items-center h-5 px-1.5 rounded-[5px] bg-black/80 text-xs font-medium text-white font-mono tabular-nums z-20">
            {durationText}
          </div>
        )}
      </div>

      {/* Footer Info Area matching Screenshot L3 */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-sm font-semibold text-white truncate" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-[var(--text-2)] truncate mt-0.5">
            {subtitle}
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
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}
