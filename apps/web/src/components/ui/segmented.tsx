"use client";

import React from "react";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Playhead Segmented Control (View toggle)
 * Boards/02 Components:
 * - Container: height 32px, radius 8, fill var(--input)
 * - Active segment: radius 6, fill #3A3C44, white text/icon
 * - Inactive: transparent fill, var(--text-2) text/icon, hover white
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      className={`inline-flex items-center h-8 p-1 rounded-[8px] bg-[var(--input)] select-none ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            aria-label={opt.ariaLabel || opt.label}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center h-6 px-2.5 rounded-[6px] text-xs font-medium transition-all duration-150 outline-none ${
              isActive
                ? "bg-[#3A3C44] text-white shadow-sm"
                : "text-[var(--text-2)] hover:text-white"
            }`}
          >
            {opt.icon}
            {opt.label && <span className={opt.icon ? "ml-1.5" : ""}>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
