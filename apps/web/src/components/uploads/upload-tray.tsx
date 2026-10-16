"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "@/lib/toast";

export interface UploadItem {
  id: string; // client upload tracking id
  uploadId: string; // server uploads table id
  itemId?: string;
  projectId: string;
  parentId?: string | null;
  file?: File;
  filename: string;
  sizeBytes: number;
  mime: string;
  storageKey: string;
  partSizeBytes: number;
  totalParts: number;
  parts: Array<{ part_number: number; url: string }>;
  completedParts: Array<{ part_number: number; etag: string }>;
  progressPercent: number;
  speedBytesPerSec: number;
  status: "pending" | "uploading" | "paused" | "completed" | "error" | "aborted";
  errorMsg?: string;
}

interface UploadTrayProps {
  uploads: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onClearCompleted: () => void;
  onAttachFile?: (id: string, file: File) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
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
  return `${min}m left`;
}

export function UploadTray({
  uploads,
  onPause,
  onResume,
  onCancel,
  onClearCompleted,
  onAttachFile,
}: UploadTrayProps) {
  const [minimized, setMinimized] = useState(false);

  if (uploads.length === 0) {
    return null;
  }

  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending"
  ).length;
  const completedCount = uploads.filter((u) => u.status === "completed").length;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-[#424344] bg-[#212121] shadow-overlay overflow-hidden font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#424344]/60">
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <div className="w-2.5 h-2.5 rounded-full bg-[#4876F3] animate-pulse" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          )}
          <span className="text-xs font-semibold text-white">
            {activeCount > 0
              ? `Uploading ${activeCount} item${activeCount > 1 ? "s" : ""}`
              : `Uploads complete (${completedCount})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {completedCount > 0 && activeCount === 0 && (
            <button
              onClick={onClearCompleted}
              className="text-[11px] text-[#A3A6AD] hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setMinimized(!minimized)}
            className="text-xs text-[#A3A6AD] hover:text-white px-1"
          >
            {minimized ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Content List */}
      {!minimized && (
        <div className="max-h-72 overflow-y-auto divide-y divide-[#424344]/30 p-2 space-y-2">
          {uploads.map((item) => {
            const bytesUploaded = (item.sizeBytes * item.progressPercent) / 100;
            const bytesLeft = item.sizeBytes - bytesUploaded;

            return (
              <div key={item.id} className="p-2 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate flex-1">
                    <p className="font-medium text-white truncate" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="text-[11px] text-[#A3A6AD] mt-0.5">
                      {formatBytes(bytesUploaded)} of {formatBytes(item.sizeBytes)} •{" "}
                      {item.status === "uploading" && (
                        <>
                          <span className="text-emerald-400 font-mono">
                            {formatSpeed(item.speedBytesPerSec)}
                          </span>{" "}
                          • {formatTimeLeft(bytesLeft, item.speedBytesPerSec)}
                        </>
                      )}
                      {item.status === "paused" && (
                        <span className="text-amber-400">
                          {!item.file ? "Waiting for file selection" : "Paused"}
                        </span>
                      )}
                      {item.status === "completed" && (
                        <span className="text-emerald-400">Completed</span>
                      )}
                      {item.status === "error" && (
                        <span className="text-red-400">{item.errorMsg || "Failed"}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!item.file && item.status !== "completed" ? (
                      <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#4876F3] text-white text-[11px] font-semibold hover:bg-[#3B67E0] transition-colors shrink-0">
                        <span>Select file to resume</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const picked = e.target.files?.[0];
                            if (!picked) return;
                            if (picked.name !== item.filename || picked.size !== item.sizeBytes) {
                              toast.error(
                                `Selected file "${picked.name}" (${formatBytes(picked.size)}) does not match "${item.filename}" (${formatBytes(item.sizeBytes)}).`
                              );
                              return;
                            }
                            onAttachFile?.(item.id, picked);
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        {item.status === "uploading" && (
                          <button
                            onClick={() => onPause(item.id)}
                            title="Pause"
                            className="px-2 py-0.5 rounded bg-[#2E2F34] text-[#A3A6AD] hover:text-white hover:bg-[#2E2F34]"
                          >
                            ⏸
                          </button>
                        )}
                        {item.status === "paused" && (
                          <button
                            onClick={() => onResume(item.id)}
                            title="Resume"
                            className="px-2 py-0.5 rounded bg-[#2E2F34] text-emerald-400 hover:text-white hover:bg-[#2E2F34]"
                          >
                            ▶
                          </button>
                        )}
                      </>
                    )}
                    {item.status !== "completed" && (
                      <button
                        onClick={() => onCancel(item.id)}
                        title="Cancel"
                        className="p-1 rounded bg-[#2E2F34] text-[#A3A6AD] hover:text-red-400 hover:bg-[#2E2F34]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[#2E2F34] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      item.status === "completed"
                        ? "bg-emerald-400"
                        : item.status === "error"
                        ? "bg-red-400"
                        : item.status === "paused"
                        ? "bg-amber-400"
                        : "bg-[#4876F3]"
                    }`}
                    style={{ width: `${Math.max(2, item.progressPercent)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
