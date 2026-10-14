"use client";

import React, { useState, useEffect } from "react";

export interface ViewerItem {
  id: string;
  name: string;
  kind: string;
  mime: string;
  size_bytes: number;
  version_number: number;
  created_at: string;
  created_by_name?: string;
  storage_key?: string;
  is_video?: boolean;
}

interface FileViewerProps {
  item: ViewerItem | null;
  itemsList: ViewerItem[];
  canDownload: boolean;
  onClose: () => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FileViewer({
  item,
  itemsList,
  canDownload,
  onClose,
  onSelectNext,
  onSelectPrev,
}: FileViewerProps) {
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [loadingUrl, setLoadingUrl] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  useEffect(() => {
    if (!item) return;

    // Fetch signed download URL
    if (canDownload) {
      setLoadingUrl(true);
      fetch(`/api/v1/items/${item.id}/download`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.download_url) {
            setDownloadUrl(data.download_url);
          }
        })
        .finally(() => setLoadingUrl(false));
    }
  }, [item, canDownload]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onSelectNext();
      if (e.key === "ArrowLeft") onSelectPrev();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onSelectNext, onSelectPrev]);

  if (!item) return null;

  const mime = item.mime?.toLowerCase() || "";
  const name = item.name.toLowerCase();
  const isVideo =
    mime.startsWith("video/") ||
    name.endsWith(".mp4") ||
    name.endsWith(".mov") ||
    name.endsWith(".webm") ||
    item.is_video;
  const isAudio =
    mime.startsWith("audio/") ||
    name.endsWith(".mp3") ||
    name.endsWith(".wav") ||
    name.endsWith(".aac");
  const isImage =
    mime.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".gif") ||
    name.endsWith(".webp");
  const isPDF = mime.includes("pdf") || name.endsWith(".pdf");
  const isText =
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".json") ||
    name.endsWith(".md") ||
    name.endsWith(".js") ||
    name.endsWith(".ts");

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121212]/95 backdrop-blur-md text-white font-sans animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex h-14 items-center justify-between border-b border-[#424344]/60 px-6 bg-[#181818]">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white transition-colors"
            title="Close (Esc)"
          >
            ←
          </button>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm max-w-md truncate" title={item.name}>
              {item.name}
            </span>
            <span className="rounded bg-[#2E2F34] px-1.5 py-0.5 text-[10px] font-mono text-[#9A9DA0]">
              v{item.version_number || 1}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* Previous / Next Arrows */}
          <div className="flex items-center bg-[#2E2F34] rounded-lg p-0.5">
            <button
              onClick={onSelectPrev}
              title="Previous file (Left Arrow)"
              className="px-2.5 py-1 text-xs text-[#9A9DA0] hover:text-white transition-colors"
            >
              ◀
            </button>
            <span className="text-xs text-[#424344]">|</span>
            <button
              onClick={onSelectNext}
              title="Next file (Right Arrow)"
              className="px-2.5 py-1 text-xs text-[#9A9DA0] hover:text-white transition-colors"
            >
              ▶
            </button>
          </div>

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E2F34] text-xs font-medium text-[#9A9DA0] hover:text-white transition-colors"
          >
            <span>🔗</span>
            <span>{copiedLink ? "Copied!" : "Copy link"}</span>
          </button>

          {canDownload && downloadUrl && (
            <a
              href={downloadUrl}
              download={item.name}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3b66df] transition-colors"
            >
              <span>↓</span>
              <span>Download</span>
            </a>
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs transition-colors ${
              showDetails
                ? "bg-[#4876F3] text-white"
                : "bg-[#2E2F34] text-[#9A9DA0] hover:text-white"
            }`}
            title="Toggle Details"
          >
            ℹ
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-[#181818]/50">
          {isVideo && (
            <div className="max-w-4xl w-full flex flex-col items-center">
              {downloadUrl ? (
                <video
                  src={downloadUrl}
                  controls
                  autoPlay
                  className="w-full max-h-[75vh] rounded-xl shadow-2xl bg-black border border-[#424344]"
                />
              ) : (
                <div className="p-8 text-center text-[#9A9DA0]">
                  Loading video stream...
                </div>
              )}
            </div>
          )}

          {isImage && (
            <div className="max-w-5xl max-h-[80vh] flex items-center justify-center overflow-hidden">
              {downloadUrl ? (
                <img
                  src={downloadUrl}
                  alt={item.name}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl border border-[#424344]"
                />
              ) : (
                <div className="text-[#9A9DA0]">Loading image...</div>
              )}
            </div>
          )}

          {isAudio && (
            <div className="max-w-md w-full bg-[#212121] border border-[#424344] rounded-2xl p-8 shadow-2xl text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-[#2E2F34] flex items-center justify-center text-3xl">
                🎵
              </div>
              <div>
                <h3 className="font-semibold text-white text-base truncate">{item.name}</h3>
                <p className="text-xs text-[#9A9DA0] mt-1">{formatBytes(item.size_bytes)}</p>
              </div>
              {downloadUrl ? (
                <audio src={downloadUrl} controls className="w-full" autoPlay />
              ) : (
                <p className="text-xs text-[#9A9DA0]">Loading audio...</p>
              )}
            </div>
          )}

          {isPDF && (
            <div className="w-full h-full max-w-5xl bg-[#212121] border border-[#424344] rounded-xl overflow-hidden shadow-2xl">
              {downloadUrl ? (
                <iframe
                  src={downloadUrl}
                  className="w-full h-full min-h-[75vh]"
                  title={item.name}
                />
              ) : (
                <div className="p-8 text-center text-[#9A9DA0]">Loading PDF...</div>
              )}
            </div>
          )}

          {!isVideo && !isImage && !isAudio && !isPDF && (
            <div className="max-w-sm w-full bg-[#212121] border border-[#424344] rounded-2xl p-8 text-center space-y-6 shadow-2xl">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-[#2E2F34] flex items-center justify-center text-4xl">
                📄
              </div>
              <div>
                <h3 className="font-semibold text-white text-base truncate">{item.name}</h3>
                <p className="text-xs text-[#9A9DA0] mt-1">
                  {formatBytes(item.size_bytes)} • {item.mime || "Generic File"}
                </p>
              </div>

              {canDownload && downloadUrl ? (
                <a
                  href={downloadUrl}
                  download={item.name}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3b66df] transition-colors"
                >
                  <span>↓</span>
                  <span>Download file</span>
                </a>
              ) : (
                <p className="text-xs text-[#747678]">
                  {!canDownload ? "Download restricted by permissions" : "Preparing file..."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Details Panel */}
        {showDetails && (
          <div className="w-80 border-l border-[#424344]/60 bg-[#1e1e1e] p-6 space-y-6 overflow-y-auto">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A9DA0]">
                File Details
              </h3>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-[#9A9DA0] block">Name</span>
                <span className="text-white font-medium break-all">{item.name}</span>
              </div>

              <div>
                <span className="text-[#9A9DA0] block">Size</span>
                <span className="text-white font-medium">{formatBytes(item.size_bytes)}</span>
              </div>

              <div>
                <span className="text-[#9A9DA0] block">Type</span>
                <span className="text-white font-mono break-all">{item.mime || "application/octet-stream"}</span>
              </div>

              <div>
                <span className="text-[#9A9DA0] block">Version</span>
                <span className="text-white font-medium">v{item.version_number || 1}</span>
              </div>

              {item.created_by_name && (
                <div>
                  <span className="text-[#9A9DA0] block">Uploaded by</span>
                  <span className="text-white font-medium">{item.created_by_name}</span>
                </div>
              )}

              <div>
                <span className="text-[#9A9DA0] block">Date added</span>
                <span className="text-white font-medium">
                  {item.created_at ? new Date(item.created_at).toLocaleString() : "Recently"}
                </span>
              </div>

              {item.storage_key && (
                <div>
                  <span className="text-[#9A9DA0] block">Storage Key (ID only)</span>
                  <span className="text-[#747678] font-mono text-[10px] break-all">{item.storage_key}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
