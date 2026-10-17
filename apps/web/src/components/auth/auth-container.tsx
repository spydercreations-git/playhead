"use client";

import React from "react";
import Link from "next/link";
import { PlayheadLogoWithText } from "@/components/icons";
import { AuthShowcase } from "./auth-showcase";

interface AuthContainerProps {
  children: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}

export function AuthContainer({ children, showBack, onBack }: AuthContainerProps) {
  return (
    <div className="flex min-h-screen w-full bg-[#181818] font-sans text-white">
      {/* Left Column (Form) */}
      <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-12 w-full lg:w-[480px] xl:w-[540px] shrink-0 max-w-[440px] lg:max-w-none mx-auto lg:mx-0">
        {/* Top Header / Logo / Back */}
        <div>
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs text-[#A3A6AD] hover:text-white transition cursor-pointer mb-6"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>
          ) : (
            <div className="mb-6">
              <Link href="/" className="inline-block">
                <PlayheadLogoWithText width={140} color="#FFFFFF" />
              </Link>
              <p className="mt-1 text-xs text-[#7C7F87] font-normal tracking-normal">
                by Idyll Productions
              </p>
            </div>
          )}
        </div>

        {/* Center Content: centered form */}
        <div className="my-auto w-full max-w-[380px] mx-auto py-4">
          {children}
        </div>

        {/* Footer */}
        <div className="pt-6">
          <div className="flex items-center gap-6 text-xs text-[#7C7F87]">
            <Link href="/privacy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition">
              Terms
            </Link>
            <Link href="/help" className="hover:text-white transition">
              Help
            </Link>
          </div>
        </div>
      </div>

      {/* Right Column: Hidden below 1024px, right panel */}
      <div className="hidden lg:flex flex-1 p-6 lg:p-8 pl-0">
        <AuthShowcase />
      </div>
    </div>
  );
}
