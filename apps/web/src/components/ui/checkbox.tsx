"use client";

import React from "react";

interface CheckboxProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  ariaLabel?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  className = "",
  ariaLabel,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange?.(!checked);
      }}
      className={`flex h-5 w-5 items-center justify-center rounded-[4px] transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4876F3]/50 ${
        checked
          ? "bg-[#4876F3] text-white"
          : "border border-[#424344] bg-transparent hover:border-[#A3A6AD]"
      } ${className}`}
    >
      {checked && (
        <svg
          width="12"
          height="10"
          viewBox="0 0 12 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 5L4.5 8.5L11 1.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
