"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { MoreHorizontal } from "@/components/ui/icon";

export interface DocumentListItem {
  id: string;
  title: string;
  project_id?: string;
  project_name?: string;
  client_id?: string;
  client_name?: string;
  plain_text_snippet?: string;
  word_count?: number;
  updated_at?: string;
  created_at?: string;
  author_name?: string;
  members?: { id?: string; name?: string; color?: string }[];
}

interface DocumentCardProps {
  document: DocumentListItem;
  isNew?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function DocumentCard({
  document,
  isNew = false,
  onContextMenu,
}: DocumentCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(232);

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

  const authorDate = document.author_name
    ? `${document.author_name}  ·  ${formatDate(document.updated_at)}`
    : document.updated_at
    ? formatDate(document.updated_at)
    : "Oct 12";

  const members = document.members || [];

  // SVG path matching shape-document.svg with dynamic width (fold fixed at 28px top-right)
  const foldSize = 28;
  const w = width;
  const h = 272;
  const bodyPath = `M12 0 H${w - foldSize} L${w} ${foldSize} V${h - 12} q0 12 -12 12 H12 q-12 0 -12 -12 V12 q0 -12 12 -12z`;
  const foldPath = `M${w - foldSize} 0 V20 q0 8 8 8 H${w}z`;

  return (
    <div
      ref={containerRef}
      className={`group relative h-[272px] w-full select-none transition-transform duration-150 hover:scale-[1.015] ${
        isNew ? "ring-2 ring-[#4876F3] shadow-[0_0_24px_rgba(72,118,243,0.35)] rounded-[12px]" : ""
      }`}
    >
      <Link
        href={`/d/${document.id}`}
        onContextMenu={onContextMenu}
        className="block relative h-full w-full pt-3 px-3 pb-3 flex flex-col justify-between cursor-pointer"
      >
        {/* SVG Document Shape Background (from shape-document.svg: folded top-right corner, 28px) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          fill="none"
        >
          <path
            d={bodyPath}
            fill="var(--panel)"
            stroke="var(--border)"
            strokeWidth="1"
            className="transition-colors group-hover:stroke-[var(--border-strong)]"
          />
          <path
            d={foldPath}
            fill="var(--border)"
            stroke="var(--border)"
            strokeLinejoin="round"
            className="transition-colors group-hover:stroke-[var(--border-strong)]"
          />
        </svg>

        {/* Document Preview (from New Cards/document-card.svg: #2E2F34 dark preview, #4876F3 title lines, #C9C4BA body lines) */}
        <div className="relative z-10 h-[150px] w-full rounded-[6px] bg-[#2E2F34] p-3 flex flex-col justify-between overflow-hidden shadow-sm">
          <div>
            {/* Title Bars (#4876F3) */}
            <div className="h-[4px] w-[50px] rounded-[2px] bg-[#4876F3]" />
            <div className="h-[4px] w-[128px] rounded-[2px] bg-[#4876F3] mt-2.5" />

            {/* Paragraph Text Lines (#C9C4BA) */}
            <div className="space-y-2 mt-3">
              <div className="h-[3.5px] w-[118px] rounded-[2px] bg-[#C9C4BA]" />
              <div className="h-[3.5px] w-[125px] rounded-[2px] bg-[#C9C4BA]" />
              <div className="h-[3.5px] w-[82px] rounded-[2px] bg-[#C9C4BA]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-[3.5px] w-[122px] rounded-[2px] bg-[#C9C4BA]" />
            <div className="h-[3.5px] w-[112px] rounded-[2px] bg-[#C9C4BA]" />
            <div className="h-[3.5px] w-[62px] rounded-[2px] bg-[#C9C4BA]" />
          </div>
        </div>

        {/* Card Footer (title 14, project 13, author/date 12, avatars, dots menu) */}
        <div className="relative z-10 pt-2 px-0.5 flex flex-col justify-between flex-1 min-h-[92px]">
          <div>
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-sm font-semibold text-white group-hover:text-[#4876F3] transition-colors truncate">
                {document.title || "Untitled Document"}
              </h4>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onContextMenu) onContextMenu(e);
                }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors shrink-0"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
            <p className="text-[13px] text-[var(--text-2)] truncate mt-0.5">
              {document.project_name || document.client_name || "My Drive"}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-[var(--text-3)] truncate">
              {authorDate}
            </p>

            {/* Member Avatars */}
            <div className="flex -space-x-1.5 overflow-hidden shrink-0">
              {members.slice(0, 3).map((m, idx) => (
                <div
                  key={m.id || idx}
                  style={{ backgroundColor: m.color || "#4876F3" }}
                  className="inline-flex h-5 w-5 rounded-full ring-2 ring-[var(--panel)] text-xs font-semibold text-white items-center justify-center"
                >
                  {(m.name || "U").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
