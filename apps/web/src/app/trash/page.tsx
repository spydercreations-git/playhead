"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Trash2,
  Folder,
  FileVideo,
  FileAudio,
  FileImage,
  FileText,
  File,
  RotateCcw,
  AlertTriangle,
  Search,
} from "lucide-react";

interface TrashItem {
  id: string;
  project_id: string;
  name: string;
  type: string;
  bytes: number;
  deleted_at: string;
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ items: TrashItem[] }>({
    queryKey: ["trash-items"],
    queryFn: () => apiRequest<{ items: TrashItem[] }>("/trash"),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/trash/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash-items"] });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/trash/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["trash-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-storage-stats"] });
    },
  });

  const items = data?.items || [];
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const idx = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(1))} ${sizes[idx]}`;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getItemIcon(type: string, name: string) {
    if (type === "folder") return <Folder className="h-5 w-5 text-amber-400" />;
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["mp4", "mov", "mkv", "avi", "webm", "prores"].includes(ext)) {
      return <FileVideo className="h-5 w-5 text-sky-400" />;
    }
    if (["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) {
      return <FileAudio className="h-5 w-5 text-emerald-400" />;
    }
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
      return <FileImage className="h-5 w-5 text-purple-400" />;
    }
    if (["pdf", "txt", "doc", "docx"].includes(ext)) {
      return <FileText className="h-5 w-5 text-rose-400" />;
    }
    return <File className="h-5 w-5 text-neutral-400" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <Trash2 className="h-6 w-6 text-neutral-400" />
            Trash
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Items in trash still consume storage quota until permanently deleted.
          </p>
        </div>

        {items.length > 0 && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#7C7F87]" />
            <input
              type="text"
              placeholder="Search trash..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] py-2 pl-9 pr-3 text-xs text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-[#383838] bg-[#1a1a1a]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-sm font-medium text-red-400">Failed to load trash items.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#383838] bg-[#141414] py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 mb-4">
            <Trash2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-white">
            {search ? "No matching items in trash" : "Trash is empty"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-400">
            {search
              ? "Try adjusting your search keywords."
              : "Items you delete will be moved here and can be restored anytime."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#141414]">
          <div className="grid grid-cols-12 border-b border-[#2a2a2a] px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
            <div className="col-span-5 sm:col-span-5">Name</div>
            <div className="hidden col-span-2 sm:block">Size</div>
            <div className="col-span-4 sm:col-span-3">Deleted</div>
            <div className="col-span-3 sm:col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-[#222]">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[#1a1a1a] transition-colors group"
              >
                <div className="col-span-5 flex items-center gap-3 min-w-0 pr-2">
                  {getItemIcon(item.type, item.name)}
                  <span className="truncate text-sm font-medium text-white">{item.name}</span>
                </div>
                <div className="hidden col-span-2 text-xs text-neutral-400 sm:block">
                  {item.type === "folder" ? "-" : formatBytes(item.bytes)}
                </div>
                <div className="col-span-4 sm:col-span-3 text-xs text-neutral-400">
                  {formatDate(item.deleted_at)}
                </div>
                <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => restoreMutation.mutate(item.id)}
                    disabled={restoreMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white hover:bg-[#252525] transition-colors"
                    title="Restore item"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-neutral-300" />
                    <span className="hidden sm:inline">Restore</span>
                  </button>
                  <button
                    onClick={() => setDeletingId(item.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#383838] bg-[#1a1a1a] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold text-white">Permanently delete?</h3>
            </div>
            <p className="text-sm text-neutral-300 mb-6">
              This action cannot be undone. All versions and storage objects will be removed immediately from cloud storage.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="rounded-lg border border-[#383838] px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-[#252525]"
              >
                Cancel
              </button>
              <button
                onClick={() => permanentDeleteMutation.mutate(deletingId)}
                disabled={permanentDeleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {permanentDeleteMutation.isPending ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
