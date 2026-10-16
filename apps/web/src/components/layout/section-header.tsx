"use client";

import React from "react";
import { ChevronDown, Check, Minus } from "lucide-react";

interface SectionHeaderProps {
  title?: string;
  count: number;
  totalBytes?: number;
  unitSingular: string;
  unitPlural: string;
  selectedCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleSelectAll: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function SectionHeader({
  count,
  totalBytes = 0,
  unitSingular,
  unitPlural,
  selectedCount,
  isCollapsed,
  onToggleCollapse,
  onToggleSelectAll,
}: SectionHeaderProps) {
  const isAllSelected = count > 0 && selectedCount === count;
  const isPartlySelected = selectedCount > 0 && selectedCount < count;

  const unit = count === 1 ? unitSingular : unitPlural;
  const text = `${count} ${unit}${totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ""}`;

  return (
    <div className="flex items-center gap-2.5 py-1.5 select-none">
      {/* Select-All Checkbox (minus sign when partly selected) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelectAll();
        }}
        className={`h-4.5 w-4.5 rounded-[5px] flex items-center justify-center transition-all ${
          isAllSelected || isPartlySelected
            ? "bg-[#4876F3] border border-[#4876F3] text-white"
            : "border border-[#7C7F87]/60 bg-transparent hover:border-white text-transparent"
        }`}
        title={isAllSelected ? "Deselect all" : "Select all"}
      >
        {isAllSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        {isPartlySelected && <Minus className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>

      {/* Collapse chevron */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center justify-center h-5 w-5 rounded text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            isCollapsed ? "-rotate-90" : "rotate-0"
          }`}
        />
      </button>

      {/* Label: e.g. "4 folders · 21.18 GB" */}
      <span
        onClick={onToggleCollapse}
        className="text-xs font-semibold text-[#A3A6AD] hover:text-white cursor-pointer transition-colors"
      >
        {text}
      </span>
    </div>
  );
}
