"use client";

import React from "react";

export type StatusChipVariant =
  | "approved"
  | "needs_review"
  | "changes_requested"
  | "in_progress"
  | "draft"
  | "team_only";

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

const STATUS_CONFIG: Record<StatusChipVariant, StatusConfig> = {
  approved: {
    label: "Approved",
    color: "#3FCF8E",
    bg: "rgba(63, 207, 142, 0.16)",
  },
  needs_review: {
    label: "Needs review",
    color: "#FFBB56",
    bg: "rgba(255, 187, 86, 0.16)",
  },
  changes_requested: {
    label: "Changes requested",
    color: "#F0506E",
    bg: "rgba(240, 80, 110, 0.16)",
  },
  in_progress: {
    label: "In progress",
    color: "#4876F3",
    bg: "rgba(72, 118, 243, 0.16)",
  },
  draft: {
    label: "Draft",
    color: "#7C7F87",
    bg: "rgba(124, 127, 135, 0.16)",
  },
  team_only: {
    label: "Team only",
    color: "#9787FF",
    bg: "rgba(151, 135, 255, 0.16)",
  },
};

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: StatusChipVariant;
  label?: string;
  className?: string;
}

/**
 * Status Chip Component
 * Boards/02 Components:
 * - Height 24px, radius 12, dot 7px, text 12 Medium
 */
export function StatusChip({ status = "draft", label, className = "", ...props }: ChipProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const displayLabel = label || config.label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium select-none ${className}`}
      style={{ backgroundColor: config.bg, color: config.color }}
      {...props}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: config.color }}
      />
      <span>{displayLabel}</span>
    </span>
  );
}

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
}

/**
 * Filter Chip Component
 * Boards/02 Components:
 * - Height 32px, radius 16, text 13 Medium
 */
export function FilterChip({
  active = false,
  count,
  children,
  className = "",
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] font-medium transition-all duration-150 select-none ${
        active
          ? "bg-[#2C2D33] text-white border border-[#424344]"
          : "bg-transparent text-[#A3A6AD] border border-[#2E2F34] hover:border-[#424344] hover:text-white"
      } ${className}`}
      {...props}
    >
      <span>{children}</span>
      {typeof count === "number" && (
        <span className={active ? "text-white/70" : "text-[#7C7F87]"}>{count}</span>
      )}
    </button>
  );
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {}

/**
 * Metadata Tag Component (MP4, 4K, v3)
 * Boards/02 Components:
 * - Height 24px, radius 6, bg #2A2B30, text 12 Medium #A3A6AD
 */
export function Tag({ children, className = "", ...props }: TagProps) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-[6px] bg-[#2A2B30] text-xs font-medium text-[#A3A6AD] select-none ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
