"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="h-16 w-16 rounded-2xl bg-[#2A2B30] border border-[#2E2F34] text-[#4876F3] flex items-center justify-center mb-6">
        <FileQuestion className="w-8 h-8" />
      </div>

      <span className="text-xs font-semibold text-[#4876F3] uppercase tracking-wider mb-2">
        404 Error
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-white mb-3">
        Page Not Found
      </h1>
      <p className="text-sm text-[#9A9DA0] max-w-md mb-8">
        The page you are looking for does not exist or may have been moved.
      </p>

      <Link
        href="/"
        className="flex items-center gap-2 h-10 px-5 rounded-[10px] bg-[#4876F3] hover:bg-[#3B66D6] text-xs font-semibold text-white shadow transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </Link>
    </div>
  );
}
