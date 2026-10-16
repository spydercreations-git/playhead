"use client";

import React from "react";

export interface ToggleProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Playhead Standard Toggle Component
 * Boards/02 Components:
 * - 36px wide, 20px high, radius 10 (rounded-full)
 * - Off: #424344 with #A3A6AD knob
 * - On: #4876F3 with #FFFFFF knob
 * - Motion: 150ms smooth transition
 */
export function Toggle({
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
  ariaLabel,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onCheckedChange?.(!checked);
        }
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4876F3]/60 disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? "bg-[#4876F3]" : "bg-[#424344]"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition duration-150 ease-in-out my-auto absolute top-[3px] ${
          checked
            ? "translate-x-[19px] bg-white"
            : "translate-x-[3px] bg-[#A3A6AD]"
        }`}
      />
    </button>
  );
}
