"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import { File, Film, Image as ImageIcon, Music, Search, X, Loader2 } from "@/components/ui/icon";

interface LibraryItem {
  id: string;
  name: string;
  kind: string;
  mime?: string;
  project_id?: string;
  project_name?: string;
}

interface SelectLibraryFileDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: { id: string; name: string }) => void;
}

export function SelectLibraryFileDialog({
  open,
  onClose,
  onSelect,
}: SelectLibraryFileDialogProps) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiRequest<{ items: LibraryItem[] }>("/drive/items?kind=file")
      .then((res) => {
        setItems(res.items || []);
      })
      .catch(() => {
        setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  if (!open || !mounted) return null;

  const filtered = items.filter((it) =>
    it.name.toLowerCase().includes(search.toLowerCase())
  );

  function getItemIcon(mime?: string, kind?: string) {
    if (kind === "folder") return <File className="w-4 h-4 text-amber-400" />;
    if (mime?.startsWith("video/")) return <Film className="w-4 h-4 text-blue-400" />;
    if (mime?.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-purple-400" />;
    if (mime?.startsWith("audio/")) return <Music className="w-4 h-4 text-emerald-400" />;
    return <File className="w-4 h-4 text-[var(--text-3)]" />;
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-white">Select file from Playhead</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Choose a file from your projects to link to this task.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border)] bg-[var(--panel)]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-9 pr-3 py-1.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border)]/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-3)] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              Loading library files...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-3)]">
              No files found in your accessible library.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect({ id: item.id, name: item.name });
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--hover)] text-left transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {getItemIcon(item.mime, item.kind)}
                  <span className="text-xs font-medium text-[var(--text)] group-hover:text-white truncate">
                    {item.name}
                  </span>
                </div>
                {item.project_name && (
                  <span className="text-[12px] text-[var(--text-3)] shrink-0 ml-2">
                    {item.project_name}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
