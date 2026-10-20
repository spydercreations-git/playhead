"use client";

import React, { useState, useEffect, useRef } from "react";
import { downloadZip } from "client-zip";
import {
  Download,
  FolderDown,
  Pause,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "@/components/ui/icon";

export interface DownloadFile {
  id: string;
  name: string;
  path: string;
  size_bytes: number;
  mime?: string;
  download_url: string;
}

export interface DownloadProgressItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  downloadedBytes: number;
  status: "pending" | "downloading" | "completed" | "paused" | "error";
}

export interface DownloadSession {
  id: string;
  name: string;
  mode: "zip" | "folder";
  totalBytes: number;
  downloadedBytes: number;
  speedBytesPerSec: number;
  status: "downloading" | "paused" | "completed" | "error" | "cancelled";
  files: DownloadProgressItem[];
  errorMsg?: string;
}

interface DownloadTrayProps {
  session: DownloadSession | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onClose: () => void;
}

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
  return `${min}m left`;
}

export function DownloadTray({
  session,
  onPause,
  onResume,
  onCancel,
  onClose,
}: DownloadTrayProps) {
  const [minimized, setMinimized] = useState(false);

  if (!session) return null;

  const progressPercent =
    session.totalBytes > 0
      ? Math.min(100, Math.round((session.downloadedBytes / session.totalBytes) * 100))
      : 0;

  const bytesLeft = Math.max(0, session.totalBytes - session.downloadedBytes);
  const activeCount = session.files.filter(
    (f) => f.status === "downloading" || f.status === "pending"
  ).length;
  const completedCount = session.files.filter((f) => f.status === "completed").length;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] shadow-overlay overflow-hidden font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg)] border-b border-[var(--border-strong)]/60">
        <div className="flex items-center gap-2 min-w-0">
          {session.status === "downloading" ? (
            <div className="w-2.5 h-2.5 rounded-full bg-[#4876F3] animate-pulse shrink-0" />
          ) : session.status === "completed" ? (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-white truncate">
            {session.status === "completed"
              ? `Download complete (${completedCount} files)`
              : session.status === "paused"
              ? `Download paused (${completedCount}/${session.files.length})`
              : session.mode === "folder"
              ? `Saving to folder (${completedCount}/${session.files.length})`
              : `Building zip download (${completedCount}/${session.files.length})`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {session.status === "completed" && (
            <button
              onClick={onClose}
              className="text-xs text-[var(--text-2)] hover:text-white px-1.5 py-0.5 rounded hover:bg-[var(--border)]"
            >
              Close
            </button>
          )}
          <button
            onClick={() => setMinimized(!minimized)}
            className="text-[var(--text-2)] hover:text-white p-1"
          >
            {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      {!minimized && (
        <div className="p-3 space-y-3">
          {/* Overall Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-medium">
                {formatBytes(session.downloadedBytes)} of {formatBytes(session.totalBytes)} ({progressPercent}%)
              </span>
              {session.status === "downloading" && (
                <span className="text-emerald-400 font-mono">
                  {formatSpeed(session.speedBytesPerSec)} • {formatTimeLeft(bytesLeft, session.speedBytesPerSec)}
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  session.status === "completed"
                    ? "bg-emerald-400"
                    : session.status === "paused"
                    ? "bg-amber-400"
                    : "bg-[#4876F3]"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Action buttons */}
          {session.status !== "completed" && (
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border-strong)]/40">
              <span className="text-xs text-[var(--text-2)]">
                {session.mode === "folder" ? "Saving directly into folder" : "Streaming zip directly to disk"}
              </span>
              <div className="flex items-center gap-2">
                {session.status === "downloading" ? (
                  <button
                    onClick={onPause}
                    className="flex items-center gap-1 rounded bg-[var(--border)] px-2 py-1 text-xs text-neutral-300 hover:text-white"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </button>
                ) : session.status === "paused" ? (
                  <button
                    onClick={onResume}
                    className="flex items-center gap-1 rounded bg-[#4876F3] px-2 py-1 text-xs text-white hover:bg-[#3B67E0]"
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </button>
                ) : null}
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Files List */}
          <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border)] space-y-1.5 pr-1">
            {session.files.map((file) => {
              const filePercent =
                file.sizeBytes > 0
                  ? Math.min(100, Math.round((file.downloadedBytes / file.sizeBytes) * 100))
                  : file.status === "completed"
                  ? 100
                  : 0;

              return (
                <div key={file.id} className="pt-1.5 first:pt-0 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-neutral-300 font-medium" title={file.path}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--text-2)]">
                      {file.status === "completed" ? (
                        <span className="text-emerald-400">Done</span>
                      ) : file.status === "downloading" ? (
                        `${filePercent}%`
                      ) : (
                        formatBytes(file.sizeBytes)
                      )}
                    </span>
                  </div>
                  {file.status === "downloading" && (
                    <div className="mt-1 h-1 w-full bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#4876F3] transition-all duration-150"
                        style={{ width: `${filePercent}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to run parallel downloads with 3 concurrent workers
export async function startBrowserDownload({
  manifest,
  mode,
  onProgress,
  isPausedRef,
  isCancelledRef,
}: {
  manifest: { files: DownloadFile[]; total_bytes: number };
  mode: "zip" | "folder";
  onProgress: (session: Partial<DownloadSession>) => void;
  isPausedRef: React.MutableRefObject<boolean>;
  isCancelledRef: React.MutableRefObject<boolean>;
}) {
  const files: DownloadProgressItem[] = manifest.files.map((f) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    sizeBytes: f.size_bytes,
    downloadedBytes: 0,
    status: "pending",
  }));

  let totalDownloaded = 0;
  let lastSpeedBytes = 0;
  let lastSpeedTime = Date.now();
  let currentSpeed = 0;

  function updateSession() {
    const now = Date.now();
    const timeDiff = (now - lastSpeedTime) / 1000;
    if (timeDiff >= 0.8) {
      currentSpeed = Math.round((totalDownloaded - lastSpeedBytes) / timeDiff);
      lastSpeedBytes = totalDownloaded;
      lastSpeedTime = now;
    }

    onProgress({
      totalBytes: manifest.total_bytes,
      downloadedBytes: totalDownloaded,
      speedBytesPerSec: currentSpeed,
      files: [...files],
    });
  }

  // MODE 1: Chrome and Edge "Download into a folder" (File System Access API)
  if (mode === "folder" && typeof window !== "undefined" && "showDirectoryPicker" in window) {
    const rootHandle = await (window as any).showDirectoryPicker({ mode: "readwrite" });

    // Concurrency queue with max 3 parallel downloads
    let nextIndex = 0;

    async function downloadWorker() {
      while (nextIndex < manifest.files.length) {
        if (isCancelledRef.current) break;

        // Pause loop
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (isCancelledRef.current) break;

        const idx = nextIndex++;
        const target = manifest.files[idx];
        const progressItem = files[idx];
        progressItem.status = "downloading";
        updateSession();

        try {
          // Resolve subfolder handles
          const parts = target.path.split("/");
          const filename = parts.pop() || target.name;
          let currentDir = rootHandle;
          for (const sub of parts) {
            if (sub && sub !== ".") {
              currentDir = await currentDir.getDirectoryHandle(sub, { create: true });
            }
          }

          const fileHandle = await currentDir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();

          const resp = await fetch(target.download_url);
          if (!resp.ok || !resp.body) {
            throw new Error(`Failed to download ${target.name}`);
          }

          const reader = resp.body.getReader();
          while (true) {
            if (isCancelledRef.current) {
              await writable.abort();
              break;
            }
            while (isPausedRef.current && !isCancelledRef.current) {
              await new Promise((r) => setTimeout(r, 200));
            }
            if (isCancelledRef.current) {
              await writable.abort();
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            await writable.write(value);
            progressItem.downloadedBytes += value.byteLength;
            totalDownloaded += value.byteLength;
            updateSession();
          }

          await writable.close();
          progressItem.status = "completed";
          updateSession();
        } catch (err: any) {
          progressItem.status = "error";
          updateSession();
        }
      }
    }

    // Run 3 workers in parallel
    const workers = [downloadWorker(), downloadWorker(), downloadWorker()];
    await Promise.all(workers);

    onProgress({
      status: isCancelledRef.current ? "cancelled" : "completed",
      speedBytesPerSec: 0,
      downloadedBytes: totalDownloaded,
      files: [...files],
    });
    return;
  }

  // MODE 2: Default in all browsers: One zip file built in browser using client-zip (store mode)
  // Stream files 3 at a time or in generator directly into client-zip
  let zipHandle: any = null;
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      zipHandle = await (window as any).showSaveFilePicker({
        suggestedName: "playhead-download.zip",
        types: [{ description: "ZIP Archive", accept: { "application/zip": [".zip"] } }],
      });
    } catch (e) {
      // User cancelled picker
      onProgress({ status: "cancelled" });
      return;
    }
  }

  // Concurrently fetch chunks for zip
  async function* makeZipEntries() {
    for (let i = 0; i < manifest.files.length; i++) {
      if (isCancelledRef.current) break;
      while (isPausedRef.current && !isCancelledRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (isCancelledRef.current) break;

      const file = manifest.files[i];
      const prog = files[i];
      prog.status = "downloading";
      updateSession();

      const resp = await fetch(file.download_url);
      if (!resp.ok || !resp.body) {
        prog.status = "error";
        updateSession();
        continue;
      }

      // Stream through progress reporter
      const reader = resp.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          if (isCancelledRef.current) {
            controller.close();
            return;
          }
          while (isPausedRef.current && !isCancelledRef.current) {
            await new Promise((r) => setTimeout(r, 200));
          }

          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            prog.status = "completed";
            updateSession();
            return;
          }

          prog.downloadedBytes += value.byteLength;
          totalDownloaded += value.byteLength;
          updateSession();
          controller.enqueue(value);
        },
      });

      yield {
        name: file.path,
        input: stream,
        size: file.size_bytes,
      };
    }
  }

  const zipResponse = downloadZip(makeZipEntries());

  if (zipHandle) {
    const writable = await zipHandle.createWritable();
    await zipResponse.body?.pipeTo(writable);
  } else {
    // Safari / Firefox / Fallback streaming to Blob
    const blob = await zipResponse.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playhead-download.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  onProgress({
    status: isCancelledRef.current ? "cancelled" : "completed",
    speedBytesPerSec: 0,
    downloadedBytes: totalDownloaded,
    files: [...files],
  });
}
