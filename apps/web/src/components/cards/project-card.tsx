"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { MoreHorizontal, Folder, Check } from "@/components/ui/icon";

interface ProjectCardProps {
  id: string;
  name: string;
  clientName?: string;
  videoCount?: number;
  totalBytes?: number;
  waitingReviewCount?: number;
  members?: { id?: string; email?: string; name?: string; color?: string }[];
  thumbnails?: string[];
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onOpenMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
  isSelected = false,
  onToggleSelect,
  onContextMenu,
  onOpenMenu,
}: ProjectCardProps) {
  const displayMembers = members;

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

  const clientInitial = clientName ? clientName.trim()[0].toUpperCase() : "P";
  const isInternal = clientName?.toLowerCase().includes("idyll");
  const badgeColor = isInternal ? "bg-[var(--panel-raised)] text-[var(--text-2)]" : "bg-[#4876F3]/20 text-[#4876F3]";

  return (
    <div
      ref={containerRef}
      className="group relative h-[290px] w-full select-none"
    >
      <Link
        href={`/library/${id}`}
        onContextMenu={onContextMenu}
        className="block relative h-full w-full pt-[28px] px-3 pb-3 flex flex-col justify-between cursor-pointer"
      >
        {/* SVG Background (Continuous folder silhouette outline) */}
        <svg
          className="absolute top-0 left-0 w-full h-[290px] pointer-events-none overflow-visible"
          fill="none"
        >
          <path d={bodyPath} fill="var(--panel)" />
          <path d={tabPath} fill="var(--panel-raised)" />
          <path
            d={bodyPath}
            fill="none"
            stroke={isSelected ? "#4876F3" : "var(--border)"}
            strokeWidth={isSelected ? "2" : "1"}
            className="transition-colors group-hover:stroke-[var(--border-strong)]"
          />
        </svg>

        {/* Preview Container: 3 Slots matching L1 */}
        <div className="relative h-[150px] w-full">
          <div className="h-[150px] w-full flex gap-1.5">
            {/* Big Slot */}
            <div className="flex-1 h-[150px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
              {thumbnails[0] ? (
                <img
                  src={thumbnails[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                  <Folder size={24} />
                </div>
              )}
            </div>

            {/* Small Slots */}
            <div className="w-[36%] h-[150px] flex flex-col gap-1.5">
              <div className="h-[72px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
                {thumbnails[1] ? (
                  <img
                    src={thumbnails[1]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                    <Folder size={16} />
                  </div>
                )}
              </div>
              <div className="h-[72px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
                {thumbnails[2] ? (
                  <img
                    src={thumbnails[2]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                    <Folder size={16} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selection Checkbox (Top-left of preview) */}
          {onToggleSelect && (
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect();
              }}
              className={`absolute top-2 left-2 h-5 w-5 rounded-[6px] flex items-center justify-center transition-colors z-20 ${
                isSelected
                  ? "bg-[#4876F3] border border-[#4876F3] text-white"
                  : "border border-[var(--border-strong)] bg-[var(--panel)] hover:border-white text-transparent opacity-0 group-hover:opacity-100"
              }`}
            >
              <Check size={16} className={isSelected ? "text-white" : "opacity-0"} />
            </button>
          )}
        </div>

        {/* Card Footer matching Screenshot L1 */}
        <div className="relative z-10 pt-3 px-0.5 flex flex-col justify-between flex-1 min-h-[96px]">
          <div>
            <h3 className="text-base font-semibold text-white group-hover:text-[#4876F3] transition-colors truncate">
              {name}
            </h3>
            <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-2)] truncate mt-1">
              {clientName && (
                <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-xs font-bold ${badgeColor} shrink-0`}>
                  {clientInitial}
                </span>
              )}
              <span className="truncate">
                {clientName ? `${clientName} · ` : ""}
                {videoCount} {videoCount === 1 ? "file" : "files"}
                {totalBytes > 0 && ` · ${formatBytes(totalBytes)}`}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {/* Member Avatars */}
            <div className="flex -space-x-1.5 overflow-hidden">
              {displayMembers.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id || idx}
                  style={{ backgroundColor: m.color || (idx === 0 ? "#FFBB56" : idx === 1 ? "#FA457B" : "#4876F3") }}
                  className="inline-flex h-[22px] w-[22px] rounded-full ring-2 ring-[var(--panel)] text-xs font-bold text-white items-center justify-center"
                >
                  {(m.name || m.email || "U").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>

            {/* Middle Badge: 🟡 3 to review */}
            {waitingReviewCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--panel-raised)] border border-[#FFBB56]/30 text-[#FFBB56] text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FFBB56]" />
                <span>{waitingReviewCount} to review</span>
              </div>
            )}

            {/* ⋯ Dots Menu */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onOpenMenu) {
                  onOpenMenu(e);
                } else if (onContextMenu) {
                  onContextMenu(e);
                }
              }}
              className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
      </Link>
    </div>
  );
}
