"use client";

import React from "react";

export interface CheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Playhead Standard Checkbox Component
 * Boards/02 Components:
 * - 18x18, radius 5
 * - Off: stroke #7C7F87 (1.5px)
 * - On: fill #4876F3 with checkmark
 * - Indeterminate: fill #4876F3 with minus bar
 */
export function Checkbox({
  checked,
  onCheckedChange,
  className = "",
  ariaLabel,
  disabled = false,
}: CheckboxProps) {
  const isChecked = checked === true;
  const isIndeterminate = checked === "indeterminate";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndeterminate ? "mixed" : isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) {
          onCheckedChange?.(!isChecked);
        }
      }}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4876F3]/50 disabled:opacity-45 disabled:pointer-events-none ${
        isChecked || isIndeterminate
          ? "bg-[#4876F3] text-white"
          : "border-[1.5px] border-[#7C7F87] bg-transparent hover:border-[#A3A6AD]"
      } ${className}`}
    >
      {isChecked && (
        <svg
          width="11"
          height="9"
          viewBox="0 0 11 9"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 4.5L4 7.5L10 1.5"
            stroke="white"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {isIndeterminate && (
        <div className="h-[2px] w-[9px] rounded-[1px] bg-white" />
      )}
    </button>
  );
}

