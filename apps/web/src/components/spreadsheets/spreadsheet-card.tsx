"use client";

import React from "react";
import Link from "next/link";
import { MoreHorizontal } from "@/components/ui/icon";

export interface SpreadsheetCardItem {
  id: string;
  title: string;
  project_name?: string;
  client_name?: string;
  updated_at?: string;
  author_name?: string;
  members?: { id?: string; name?: string; color?: string }[];
}

interface SpreadsheetCardProps {
  sheet: SpreadsheetCardItem;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function SpreadsheetCard({ sheet, onContextMenu }: SpreadsheetCardProps) {
  const authorDate = sheet.author_name
    ? `${sheet.author_name}  ·  ${formatDate(sheet.updated_at)}`
    : sheet.updated_at
    ? formatDate(sheet.updated_at)
    : "Recently";

  const members = sheet.members && sheet.members.length > 0
    ? sheet.members
    : [
        { id: "1", name: "Harsh", color: "#C2410C" },
        { id: "2", name: "Rohit", color: "#7C3AED" },
        { id: "3", name: "Kunal", color: "#0F766E" },
      ];

  return (
    <Link
      href={`/sheet/${sheet.id}`}
      onContextMenu={onContextMenu}
      className="group relative flex flex-col justify-between h-[272px] w-full rounded-[12px] bg-[#212121] border border-[#2E2F34] hover:border-[#424344] hover:scale-[1.015] transition-all p-3 select-none cursor-pointer"
    >
      {/* Mini Sheet Preview (150 high, radius 6, header #3FCF8E at 22%, grid lines #2E2F34) */}
      <div className="relative h-[150px] w-full rounded-[6px] bg-[#1B1C20] border border-[#2E2F34] overflow-hidden flex flex-col">
        {/* Header Row */}
        <div className="h-[21.4px] bg-[#3FCF8E]/[0.22] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-[5px] w-10 bg-[#3FCF8E] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-[5px] w-6 bg-[#3FCF8E] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-[5px] w-10 bg-[#3FCF8E] rounded-[2px]" />
          </div>
        </div>

        {/* Row 1 */}
        <div className="h-[21.4px] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-8 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-6 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-12 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>

        {/* Row 2 */}
        <div className="h-[21.4px] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-10 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-7 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-8 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>

        {/* Row 3 */}
        <div className="h-[21.4px] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-12 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-5 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-10 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>

        {/* Row 4 */}
        <div className="h-[21.4px] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-8 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-6 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-12 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>

        {/* Row 5 */}
        <div className="h-[21.4px] border-b border-[#2E2F34] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-10 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-7 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-8 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>

        {/* Row 6 */}
        <div className="h-[21.4px] flex items-center px-2.5 divide-x divide-[#2E2F34]">
          <div className="w-[38%] pr-2">
            <div className="h-1 w-12 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="w-[24%] px-2">
            <div className="h-1 w-5 bg-[#3A3C44] rounded-[2px]" />
          </div>
          <div className="flex-1 pl-2">
            <div className="h-1 w-10 bg-[#3A3C44] rounded-[2px]" />
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="pt-2 px-0.5 flex flex-col justify-between flex-1 min-h-[92px]">
        <div>
          <div className="flex items-center justify-between gap-1">
            <h4 className="text-sm font-semibold text-white group-hover:text-[#4876F3] transition-colors truncate">
              {sheet.title}
            </h4>
            {onContextMenu && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(e);
                }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors shrink-0"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          </div>
          <p className="text-[13px] text-[#A3A6AD] truncate mt-0.5">
            {sheet.project_name || sheet.client_name || "Drive"}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[#7C7F87] truncate">
            {authorDate}
          </p>

          {/* Member Avatars */}
          <div className="flex -space-x-1.5 overflow-hidden shrink-0">
            {members.slice(0, 3).map((m, idx) => (
              <div
                key={m.id || idx}
                style={{ backgroundColor: m.color || "#4876F3" }}
                className="inline-flex h-5 w-5 rounded-full ring-2 ring-[#212121] text-xs font-semibold text-white items-center justify-center"
              >
                {(m.name || "U").slice(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Sep 30";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Sep 30";
  }
}
