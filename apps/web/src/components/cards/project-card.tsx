"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { MoreHorizontal, Lock, Film, FolderOpen } from "@/components/ui/icon";

interface ProjectCardProps {
  id: string;
  name: string;
  clientName?: string;
  videoCount?: number;
  totalBytes?: number;
  waitingReviewCount?: number;
  members?: { id?: string; email?: string; name?: string; color?: string }[];
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
  clientName,
  videoCount = 0,
  totalBytes = 0,
  waitingReviewCount = 0,
  members = [],
  thumbnails = [],
  onContextMenu,
}: ProjectCardProps) {
  const displayMembers = members;

  const details: string[] = [];
  if (clientName) {
    details.push(clientName);
  }
  if (videoCount > 0 || details.length === 0) {
    details.push(`${videoCount} ${videoCount === 1 ? "file" : "files"}`);
  }
  if (totalBytes > 0) {
    details.push(formatBytes(totalBytes));
  }
  const fileText = details.join("  ·  ");

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(278);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          setWidth(Math.round(rect.width));
        }
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const W = width;
  const H = 290;
  const bodyPath = `M0.5 ${H - 12.5} V10.5 Q0.5 0.5 10.5 0.5 H88 C96 0.5 100 2.5 105 7.5 L111 13.5 C115 17.5 118 18.5 124 18.5 H${W - 12.5} Q${W - 0.5} 18.5 ${W - 0.5} 30.5 V${H - 12.5} Q${W - 0.5} ${H - 0.5} ${W - 12.5} ${H - 0.5} H12.5 Q0.5 ${H - 0.5} 0.5 ${H - 12.5} Z`;
  const tabPath = "M0.5 18.5 V10.5 Q0.5 0.5 10.5 0.5 H88 C96 0.5 100 2.5 105 7.5 L111 13.5 C115 17.5 118 18.5 124 18.5 Z";

  return (
    <div ref={containerRef} className="group relative h-[290px] w-full select-none transition-transform duration-150 hover:scale-[1.015]">
      <Link
        href={`/projects/${id}`}
        onContextMenu={onContextMenu}
        className="block relative h-full w-full pt-[28px] px-3 pb-3 flex flex-col justify-between cursor-pointer"
      >
        {/* SVG Background (from New Cards/project-card-shape.svg continuous outline) */}
        <svg
          className="absolute top-0 left-0 w-full h-[290px] pointer-events-none overflow-visible"
          fill="none"
        >
          <path d={bodyPath} fill="var(--panel)" />
          <path d={tabPath} fill="var(--panel-raised)" />
          <path
            d={bodyPath}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            className="transition-colors group-hover:stroke-[var(--border-strong)]"
          />
        </svg>

        {/* Preview Container: If no files, show Empty preview (folder icon on var(--hover)) as in Boards/02 Components Empty */}
        <div className="relative h-[150px] w-full">
          {thumbnails.length === 0 ? (
            <div className="relative z-10 h-[150px] w-full rounded-[8px] bg-[var(--hover)] flex items-center justify-center text-[var(--text-3)]">
              <FolderOpen size={36} className="text-[var(--text-3)]" />
            </div>
          ) : (
            <div className="relative z-10 h-[150px] w-full flex gap-1.5">
              {/* Big Thumbnail (Left Slot) */}
              <div className="flex-1 h-[150px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                {thumbnails[0] ? (
                  <img
                    src={thumbnails[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--hover)] flex items-center justify-center text-[var(--text-3)]">
                    <FolderOpen size={24} className="text-[var(--text-3)]" />
                  </div>
                )}
              </div>

              {/* Small Thumbnails (Right Column) */}
              <div className="w-[36%] h-[150px] flex flex-col gap-1.5">
                <div className="h-[72px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                  {thumbnails[1] ? (
                    <img
                      src={thumbnails[1]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[var(--hover)]" />
                  )}
                </div>
                <div className="h-[72px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                  {thumbnails[2] ? (
                    <img
                      src={thumbnails[2]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[var(--hover)]" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Review chip */}
          {waitingReviewCount > 0 && (
            <div className="absolute bottom-2 right-2 rounded-md bg-[#FFBB56]/20 backdrop-blur-sm px-2 py-0.5 border border-[#FFBB56]/40 text-[#FFBB56] text-xs font-semibold z-20">
              {waitingReviewCount} to review
            </div>
          )}
        </div>

        {/* Card Footer: Title 16, Project/files 13, Avatars & Dots menu */}
        <div className="relative z-10 pt-3 px-0.5 flex flex-col justify-between flex-1 min-h-[96px]">
          <div>
            <h3 className="text-base font-semibold text-white group-hover:text-[#4876F3] transition-colors truncate">
              {name}
            </h3>
            <p className="text-[13px] text-[var(--text-3)] truncate mt-0.5">
              {fileText}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            {/* Member Avatars */}
            <div className="flex -space-x-1.5 overflow-hidden">
              {displayMembers.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id || idx}
                  style={{ backgroundColor: m.color || "#4876F3" }}
                  className="inline-flex h-[22px] w-[22px] rounded-full ring-2 ring-[var(--panel)] text-xs font-semibold text-white items-center justify-center"
                >
                  {(m.name || m.email || "U").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>

            {/* ⋯ Dots Menu */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onContextMenu) onContextMenu(e);
              }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </Link>
    </div>
  );
}
