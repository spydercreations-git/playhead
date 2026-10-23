"use client";

import React, { useRef } from "react";

export interface CheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  tabIndex?: number;
}

/**
 * Playhead Standard Checkbox Component
 * - 18x18px, radius 5px
 * - Unchecked: transparent, 1.5px border var(--border-strong); hover: border var(--text-3)
 * - Checked: background var(--accent), white check mark (2px stroke, rounded ends)
 * - Mixed: var(--accent) with white horizontal dash
 * - Smooth 120ms fill transition
 * - Hidden input for accessibility (space toggle, screen readers)
 * - Focus ring only for keyboard users (:focus-visible), 2px accent at 40%
 */
export function Checkbox({
  checked,
  onCheckedChange,
  className = "",
  ariaLabel,
  disabled = false,
  id,
  tabIndex = 0,
}: CheckboxProps) {
  const isChecked = checked === true;
  const isIndeterminate = checked === "indeterminate";
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className={`relative inline-flex items-center justify-center cursor-pointer select-none shrink-0 ${
        disabled ? "opacity-45 cursor-not-allowed pointer-events-none" : ""
      } ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="checkbox"
        id={id}
        tabIndex={-1}
        disabled={disabled}
        checked={isChecked}
        aria-checked={isIndeterminate ? "mixed" : isChecked}
        aria-label={ariaLabel}
        onChange={(e) => {
          if (!disabled) {
            onCheckedChange?.(e.target.checked);
          }
        }}
        className="sr-only"
      />
      <div
        role="checkbox"
        tabIndex={tabIndex}
        aria-checked={isIndeterminate ? "mixed" : isChecked}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) {
              onCheckedChange?.(!isChecked);
            }
          }
        }}
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] transition-all duration-[120ms] ease-out outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
          isChecked || isIndeterminate
            ? "bg-[var(--accent)] text-white border border-[var(--accent)]"
            : "border-[1.5px] border-[var(--border-strong)] bg-transparent hover:border-[var(--text-3)]"
        }`}
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
              d="M1.5 4.5L4 7L9.5 1.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {isIndeterminate && (
          <div className="h-[2px] w-[9px] rounded-full bg-white" />
        )}
      </div>
    </label>
  );
}

export default Checkbox;
