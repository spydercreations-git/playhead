"use client";

import React from "react";
import { Link2 } from "@/components/ui/icon";

export default function QuickLinksPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-14 h-14 rounded-full bg-[var(--input)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--text-2)]">
        <Link2 className="w-7 h-7 text-[#4876F3]" />
      </div>
      <h1 className="text-xl font-bold text-white mb-1.5">Quick links</h1>
      <p className="text-xs text-[var(--text-3)] max-w-sm">
        Pinned client resources, review links, and shared assets will appear here.
      </p>
    </div>
  );
}
