"use client";

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Playhead Tabs Component
 * Boards/02 Components:
 * - Active: text 14 SemiBold #FFFFFF, 2px indicator #4876F3 (rx 1)
 * - Inactive: text 14 Medium var(--text-2), hover #FFFFFF
 * - Count pills: var(--hover) (active) / var(--input) (inactive) with var(--text-2) text
 */
export function Tabs({ tabs, activeId, onChange, className = "" }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-6 border-b border-[var(--border)] select-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="group relative flex items-center gap-2 pb-3 pt-1 text-sm outline-none transition-colors"
          >
            <span
              className={`transition-colors ${
                isActive
                  ? "font-semibold text-white"
                  : "font-medium text-[var(--text-2)] group-hover:text-white"
              }`}
            >
              {tab.label}
            </span>

            {typeof tab.count === "number" && (
              <span
                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium text-[var(--text-2)] ${
                  isActive ? "bg-[var(--hover)]" : "bg-[var(--input)]"
                }`}
              >
                {tab.count}
              </span>
            )}

            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#4876F3]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
