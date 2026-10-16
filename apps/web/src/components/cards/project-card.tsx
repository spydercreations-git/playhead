"use client";

import React from "react";
import Link from "next/link";
import { Folder, MoreHorizontal, Lock, Film } from "lucide-react";

interface ProjectCardProps {
  id: string;
  name: string;
  clientName?: string;
  videoCount?: number;
  totalBytes?: number;
  isRestricted?: boolean;
  waitingReviewCount?: number;
  members?: { id?: string; email?: string; name?: string }[];
  thumbnails?: string[];
  onContextMenu?: (e: React.MouseEvent) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function ProjectCard({
  id,
  name,
  clientName = "Client",
  videoCount = 0,
  totalBytes = 0,
  isRestricted = false,
  waitingReviewCount = 0,
  members = [],
  thumbnails = [],
  onContextMenu,
}: ProjectCardProps) {
  const isEmpty = videoCount === 0 && thumbnails.length === 0;

  return (
    <Link
      href={`/projects/${id}`}
      onContextMenu={onContextMenu}
      className="group relative pt-3.5 select-none block cursor-pointer"
    >
      {/* Top Left Folder Tab */}
      <div className="absolute top-0 left-0 h-4 w-28 rounded-t-[8px] bg-[#212121] border-t border-l border-r border-[#2E2F34] group-hover:border-[#424344] transition-colors z-10">
        <div className="absolute -bottom-0.5 left-0 right-0 h-1 bg-[#212121]" />
      </div>

      {/* Main Folder Body */}
      <div className="relative rounded-[12px] rounded-tl-none border border-[#2E2F34] p-3 bg-[#212121] group-hover:border-[#424344] group-hover:shadow-lg transition-all">
        {/* Preview Container: 1 large + 2 small thumbnail slots */}
        <div className="relative h-32 w-full rounded-[8px] bg-[#181818] p-1.5 flex gap-1.5 overflow-hidden mb-3">
          {isEmpty ? (
            <div className="w-full h-full rounded-[6px] bg-[#212121] flex items-center justify-center">
              <Film className="w-8 h-8 text-[#2E2F34]" />
            </div>
          ) : (
            <>
              {/* Left Slot: 1 Large Thumbnail */}
              <div className="flex-1 h-full rounded-[6px] bg-[#2E2F34] overflow-hidden flex items-center justify-center relative">
                {thumbnails[0] ? (
                  <img
                    src={thumbnails[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="w-7 h-7 text-[#7C7F87]" />
                )}
              </div>

              {/* Right Column: 2 Small Thumbnails */}
              <div className="w-[34%] h-full flex flex-col gap-1.5">
                <div className="flex-1 rounded-[6px] bg-[#2E2F34] overflow-hidden flex items-center justify-center relative">
                  {thumbnails[1] ? (
                    <img
                      src={thumbnails[1]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Film className="w-4 h-4 text-[#7C7F87]" />
                  )}
                </div>
                <div className="flex-1 rounded-[6px] bg-[#2E2F34] overflow-hidden flex items-center justify-center relative">
                  {thumbnails[2] ? (
                    <img
                      src={thumbnails[2]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Film className="w-4 h-4 text-[#7C7F87]" />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Badges on preview: Restricted Lock badge */}
          {isRestricted && (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 border border-amber-500/30 text-amber-400 text-xs font-semibold z-20">
              <Lock className="w-3 h-3" />
              <span>Restricted</span>
            </div>
          )}

          {/* Amber "3 to review" Chip if waiting review */}
          {waitingReviewCount > 0 && (
            <div className="absolute bottom-2.5 right-2.5 rounded-md bg-amber-500/20 backdrop-blur-sm px-2 py-0.5 border border-amber-500/40 text-amber-300 text-xs font-semibold z-20">
              {waitingReviewCount} to review
            </div>
          )}
        </div>

        {/* Project Details */}
        <div className="flex items-center justify-between min-h-[36px]">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="text-xs font-semibold text-white truncate leading-tight">
              {name}
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] text-[#A3A6AD] truncate mt-0.5">
              <span className="font-medium text-[#4876F3]">{clientName}</span>
              <span>·</span>
              <span>
                {videoCount} {videoCount === 1 ? "video" : "videos"}
              </span>
              {totalBytes > 0 && (
                <>
                  <span>·</span>
                  <span>{formatBytes(totalBytes)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Member Avatars */}
            {members.length > 0 && (
              <div className="flex -space-x-1.5 overflow-hidden">
                {members.slice(0, 3).map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className="inline-block h-5 w-5 rounded-full ring-2 ring-[#212121] bg-[#4876F3] text-xs font-bold text-white flex items-center justify-center "
                  >
                    {(m.name || m.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            {/* ⋯ button bottom right */}
            {onContextMenu && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(e);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
