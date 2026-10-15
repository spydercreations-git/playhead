"use client";

import React from "react";
import Link from "next/link";
import { AuthContainer } from "@/components/auth/auth-container";

export default function SignupPage() {
  return (
    <AuthContainer>
      <div className="w-full">
        <h1 className="text-[34px] font-bold text-white tracking-tight leading-none mb-2">
          Private workspace
        </h1>
        <p className="text-sm text-[#8E9096] mb-8 leading-relaxed">
          Public sign up is currently disabled. Playhead is an invite-only workspace for
          Idyll Productions and invited clients.
        </p>

        {/* Note Box with Lock Icon */}
        <div className="rounded-[12px] bg-[#212121] border border-[#2D2F34] p-4 flex items-start gap-3 mb-6">
          <div className="w-8 h-8 rounded-[8px] bg-[#2A2B30] flex items-center justify-center text-[#9A9DA0] shrink-0 mt-0.5">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="text-xs">
            <p className="font-semibold text-white">How to get access:</p>
            <p className="text-[#7C7F87] mt-1 leading-relaxed">
              Ask the person who invited you for access. Once invited, use your email to sign in directly.
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] text-white text-sm font-semibold transition flex items-center justify-center shadow-md"
        >
          Back to sign in
        </Link>
      </div>
    </AuthContainer>
  );
}
