"use client";

import React, { useState } from "react";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Playhead Tooltip Component
 * Boards/02 Components:
 * - Radius 6, fill #26272C, border #2E2F34, text 12 Medium
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  }[side];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none whitespace-nowrap rounded-[6px] bg-[#26272C] border border-[#2E2F34] px-2.5 py-1 text-xs font-medium text-white shadow-lg animate-in fade-in-0 zoom-in-95 duration-100 ${positionClasses} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
