"use client";

import React, { useRef } from "react";
import { useUploadStore, UploadItem } from "@/lib/upload-store";
import {
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  VideoFileIcon as Film,
  Music,
  ImageFileIcon as ImageIcon,
  FileText,
  Folder as FolderArchive,
} from "@/components/ui/icon";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "--";
  return formatBytes(bytesPerSec) + "/s";
}

function formatTimeLeft(bytesLeft: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0 || bytesLeft <= 0) return "--";
  const sec = Math.ceil(bytesLeft / bytesPerSec);
  if (sec < 60) return `${sec}s left`;
  const min = Math.ceil(sec / 60);
  return `${min} min left`;
}

function getFileIcon(item: UploadItem) {
  const mime = item.mime.toLowerCase();
  const name = item.filename.toLowerCase();

  if (item.previewUrl) {
    return (
      <img
        src={item.previewUrl}
        alt=""
        className="w-full h-full object-cover rounded-[6px]"
      />
    );
  }

  if (mime.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".mkv")) {
    return <Film size={20} className="text-[#4876F3]" />;
  }
  if (mime.startsWith("audio/") || name.endsWith(".mp3") || name.endsWith(".wav") || name.endsWith(".aac")) {
    return <Music size={20} className="text-[#9787FF]" />;
  }
  if (mime.startsWith("image/") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp")) {
    return <ImageIcon size={20} className="text-[#FFBB56]" />;
  }
  if (name.endsWith(".zip") || name.endsWith(".tar") || name.endsWith(".gz") || name.endsWith(".rar")) {
    return <FolderArchive size={20} className="text-[var(--text-2)]" />;
  }
  return <FileText size={20} className="text-[var(--text-2)]" />;
}

export function UploadPanel() {
  const {
    uploads,
    isOpen,
    isMinimized,
    toggleOpen,
    setOpen,
    toggleMinimized,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearCompleted,
    attachFile,
  } = useUploadStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachIdRef = useRef<string | null>(null);

  if (!isOpen || uploads.length === 0) {
    return null;
  }

  const activeUploads = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending"
  );
  const totalBytes = uploads.reduce((acc, u) => acc + u.sizeBytes, 0);
  const loadedBytes = uploads.reduce((acc, u) => acc + u.uploadedBytes, 0);
  const totalSpeed = activeUploads.reduce((acc, u) => acc + u.speedBytesPerSec, 0);
  const remainingBytes = Math.max(0, totalBytes - loadedBytes);

  const completedCount = uploads.filter((u) => u.status === "completed").length;
  const failedCount = uploads.filter((u) => u.status === "error").length;
  const overallPercent =
    totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;

  // Handle re-attaching a file for resume
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = pendingAttachIdRef.current;
    if (file && id) {
      attachFile(id, file);
      resumeUpload(id, file);
    }
    pendingAttachIdRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Collapsed Pill View (from Boards/02 Components y=3923)
  if (isMinimized) {
    // Circumference for r=11 is ~69.1
    const radius = 11;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (circumference * overallPercent) / 100;

    return (
      <aside
        aria-label="Upload progress"
        className="fixed bottom-6 right-6 z-50 w-[320px] h-[48px] rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay flex items-center px-3.5 gap-3 select-none"
      >
        {/* Circular Progress Ring */}
        <div className="relative w-6 h-6 shrink-0 flex items-center justify-center">
          <svg className="w-6 h-6 -rotate-90" viewBox="0 0 28 28">
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="2.5"
            />
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke="#4876F3"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
        </div>

        <span className="text-[13px] font-medium text-white truncate flex-1">
          {activeUploads.length > 0
            ? `Uploading ${activeUploads.length} of ${uploads.length} · ${overallPercent}%`
            : `Uploads complete (${completedCount})`}
        </span>

        {/* Expand button */}
        <button
          onClick={toggleMinimized}
          title="Expand"
          className="p-1 rounded text-[var(--text-2)] hover:text-white transition-colors"
        >
          <ChevronUp size={20} />
        </button>

        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          title="Close"
          className="p-1 rounded text-[var(--text-2)] hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </aside>
    );
  }

  // Expanded View (matching P04 Home New menu and uploads.svg)
  return (
    <aside
      aria-label="Uploads panel"
      className="fixed bottom-6 right-6 z-50 w-[384px] max-w-[calc(100vw-32px)] rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay overflow-hidden font-sans select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFilePicked}
      />

      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white tracking-tight">
            {activeUploads.length > 0
              ? `Uploading ${activeUploads.length} of ${uploads.length}`
              : `Uploads complete (${completedCount})`}
          </h2>

          <div className="flex items-center gap-1">
            {completedCount > 0 && activeUploads.length === 0 && (
              <button
                onClick={clearCompleted}
                className="text-[12px] font-medium text-[var(--text-3)] hover:text-white px-1.5 py-0.5 rounded transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={toggleMinimized}
              title="Minimize"
              className="p-1 rounded text-[var(--text-2)] hover:text-white transition-colors"
            >
              <ChevronDown size={20} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="p-1 rounded text-[var(--text-2)] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <p className="text-[12px] text-[var(--text-3)] mt-0.5">
          {activeUploads.length > 0 ? (
            <>
              {formatTimeLeft(remainingBytes, totalSpeed)} · {formatSpeed(totalSpeed)}
            </>
          ) : failedCount > 0 ? (
            `${failedCount} item${failedCount > 1 ? "s" : ""} failed`
          ) : (
            "All files saved"
          )}
        </p>

        {/* Global Progress Bar under header */}
        <div className="h-[3px] w-full bg-[var(--input)] rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-[#4876F3] transition-all duration-300"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Upload Items List */}
      <div className="max-h-[340px] overflow-y-auto divide-y divide-[var(--border)] px-3 py-1">
        {uploads.map((item) => {
          const isUploading = item.status === "uploading";
          const isPaused = item.status === "paused";
          const isCompleted = item.status === "completed";
          const isError = item.status === "error";

          const bytesLeft = Math.max(0, item.sizeBytes - item.uploadedBytes);

          return (
            <div key={item.id} className="py-2.5 px-1 flex items-center gap-3">
              {/* Thumbnail / Type Icon */}
              <div className="w-10 h-10 rounded-[6px] bg-[var(--hover)] flex items-center justify-center shrink-0 overflow-hidden">
                {getFileIcon(item)}
              </div>

              {/* Item Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate" title={item.filename}>
                  {item.filename}
                </p>

                {/* Status line */}
                {isUploading && (
                  <>
                    <p className="text-[12px] text-[#4876F3] font-medium mt-0.5">
                      {item.progressPercent}% · {formatTimeLeft(bytesLeft, item.speedBytesPerSec)}
                    </p>
                    <div className="h-[3px] w-full bg-[var(--input)] rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-[#4876F3] transition-all duration-300"
                        style={{ width: `${Math.max(2, item.progressPercent)}%` }}
                      />
                    </div>
                  </>
                )}

                {item.status === "pending" && (
                  <p className="text-[12px] text-[var(--text-3)] font-medium mt-0.5">
                    Waiting
                  </p>
                )}

                {isCompleted && (
                  <p className="text-[12px] text-[#3FCF8E] font-medium mt-0.5">
                    Done
                  </p>
                )}

                {isPaused && (
                  <>
                    <p className="text-[12px] text-[#FFBB56] font-medium mt-0.5">
                      {item.errorMsg || "Paused, reconnecting"}
                    </p>
                    <div className="h-[3px] w-full bg-[var(--input)] rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-[#FFBB56]"
                        style={{ width: `${Math.max(2, item.progressPercent)}%` }}
                      />
                    </div>
                  </>
                )}

                {isError && (
                  <p className="text-[12px] text-[#F0506E] font-medium mt-0.5 leading-tight">
                    {item.errorMsg?.startsWith("Failed:") ? item.errorMsg : `Failed: ${item.errorMsg || "Upload failed"}`}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="shrink-0 flex items-center gap-1">
                {isUploading && (
                  <button
                    onClick={() => pauseUpload(item.id)}
                    title="Pause"
                    className="p-1 rounded text-[var(--text-2)] hover:text-white transition-colors"
                  >
                    <Pause size={16} />
                  </button>
                )}

                {isPaused && (
                  <button
                    onClick={() => {
                      if (!item.file) {
                        pendingAttachIdRef.current = item.id;
                        fileInputRef.current?.click();
                      } else {
                        resumeUpload(item.id);
                      }
                    }}
                    title="Resume"
                    className="p-1 rounded text-[#3FCF8E] hover:text-white transition-colors"
                  >
                    <Play size={16} />
                  </button>
                )}

                {isCompleted && (
                  <div className="p-1 text-[#3FCF8E]" title="Completed">
                    <CheckCircle2 size={16} />
                  </div>
                )}

                {isError && (
                  <button
                    onClick={() => {
                      if (!item.file) {
                        pendingAttachIdRef.current = item.id;
                        fileInputRef.current?.click();
                      } else {
                        resumeUpload(item.id);
                      }
                    }}
                    title="Retry"
                    className="p-1 rounded text-[#FFBB56] hover:text-white transition-colors"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}

                {!isCompleted && (
                  <button
                    onClick={() => cancelUpload(item.id)}
                    title="Cancel"
                    className="p-1 rounded text-[var(--text-2)] hover:text-[#F0506E] transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
