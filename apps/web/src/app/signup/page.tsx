"use client";

import React from "react";
import Link from "next/link";
import { PlayheadLogoWithText } from "@/components/icons";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
      <div className="mb-8 flex justify-center">
        <Link href="/">
          <PlayheadLogoWithText width={170} color="#FFFFFF" />
        </Link>
      </div>

      <div className="w-full max-w-[440px] rounded-2xl border border-[#424344] bg-[#212121] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#2E2F34] border border-[#424344] text-[#4876F3]">
          <svg
            width="24"
            height="24"
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

        <h1 className="text-xl font-bold tracking-tight text-white mb-2">
          Private Workspace
        </h1>
        <p className="text-sm text-[#9A9DA0] mb-6 leading-relaxed">
          Public sign up is currently disabled. Playhead is an internal workspace for the
          <strong> Idyll Productions</strong> team and invited clients.
        </p>

        <div className="rounded-lg bg-[#2E2F34]/50 border border-[#424344] p-4 text-xs text-[#9A9DA0] mb-6 text-left">
          <p className="font-semibold text-white mb-1">How to get access:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>You will receive an invite email once added by an admin or client lead.</li>
            <li>Once added, sign in directly using your email address and 6-digit verification code.</li>
          </ul>
        </div>

        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] transition-colors"
        >
          Go to Sign in
        </Link>
      </div>
    </div>
  );
}
