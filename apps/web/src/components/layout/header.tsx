"use client";

import React from "react";
import { SearchIcon } from "@/components/icons";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  return (
    <header className="flex h-20 w-full items-center justify-between px-6 md:px-8 border-b border-[#424344]/50 bg-[#181818]">
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#424344] text-[#9A9DA0] hover:text-white md:hidden"
          title="Open menu"
        >
          ☰
        </button>
        <div>
          <span className="text-xs font-medium text-[#9A9DA0]">
            Welcome back, Harsh
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Overview
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <div className="hidden sm:flex h-10 items-center gap-2 rounded-lg border border-[#424344] bg-[#212121] px-3.5 text-xs text-[#9A9DA0]">
          <SearchIcon size={16} color="#9A9DA0" />
          <input
            type="text"
            placeholder="Search projects, cuts..."
            className="w-44 bg-transparent text-white placeholder-[#9A9DA0] focus:outline-none"
          />
        </div>

        {/* New cut CTA */}
        <button className="flex h-10 items-center justify-center rounded-lg bg-[#4876F3] px-4 text-xs font-semibold text-white hover:bg-[#3B66D6] transition-colors">
          + Upload Cut
        </button>
      </div>
    </header>
  );
}
