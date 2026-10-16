"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Star,
  Folder,
  FileVideo,
  FileAudio,
  FileImage,
  FileText,
  File,
  ExternalLink,
  Search,
} from "@/components/ui/icon";

interface StarredItem {
  id: string;
  project_id: string;
  name: string;
  type: string;
  parent_id: string | null;
  current_version: number;
  bytes: number;
  created_at: string;
  updated_at: string;
}

export default function StarredPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ items: StarredItem[] }>({
    queryKey: ["starred-items"],
    queryFn: () => apiRequest<{ items: StarredItem[] }>("/starred"),
  });

  const unstarMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/items/${id}/star`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["starred-items"] });
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
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            Starred
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Quick access to your starred files and folders across all projects.
          </p>
        </div>

        {items.length > 0 && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#7C7F87]" />
            <input
              type="text"
              placeholder="Search starred..."
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
              className="h-16 animate-pulse rounded-xl border border-[#2E2F34] bg-[#181818]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-sm font-medium text-red-400">Failed to load starred items.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2E2F34] bg-[#181818] py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 mb-4">
            <Star className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-white">
            {search ? "No matching starred items" : "No starred items yet"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-neutral-400">
            {search
              ? "Try adjusting your search keywords."
              : "Click the star icon on any file or folder to keep it easily accessible here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#212121] bg-[#181818]">
          <div className="grid grid-cols-12 border-b border-[#212121] px-4 py-3 text-xs font-medium  text-neutral-400">
            <div className="col-span-6 sm:col-span-6">Name</div>
            <div className="hidden col-span-2 sm:block">Size</div>
            <div className="hidden col-span-2 sm:block">Modified</div>
            <div className="col-span-6 sm:col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-[#212121]">
            {filtered.map((item) => {
              const projectLink = `/projects/${item.project_id}${
                item.type === "folder"
                  ? `?folder=${item.id}`
                  : item.parent_id
                  ? `?folder=${item.parent_id}`
                  : ""
              }`;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[#181818] transition-colors group"
                >
                  <div className="col-span-6 flex items-center gap-3 min-w-0 pr-2">
                    {getItemIcon(item.type, item.name)}
                    <Link
                      href={projectLink}
                      className="truncate text-sm font-medium text-white hover:text-[#4876F3] transition-colors"
                    >
                      {item.name}
                    </Link>
                  </div>
                  <div className="hidden col-span-2 text-xs text-neutral-400 sm:block">
                    {item.type === "folder" ? "-" : formatBytes(item.bytes)}
                  </div>
                  <div className="hidden col-span-2 text-xs text-neutral-400 sm:block">
                    {formatDate(item.updated_at)}
                  </div>
                  <div className="col-span-6 sm:col-span-2 flex items-center justify-end gap-2">
                    <Link
                      href={projectLink}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-[#212121]"
                      title="Open in project"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Open</span>
                    </Link>
                    <button
                      onClick={() => unstarMutation.mutate(item.id)}
                      className="rounded-md p-1.5 text-amber-400 hover:bg-[#212121] transition-colors"
                      title="Remove from starred"
                    >
                      <Star className="h-4 w-4 fill-amber-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
