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
      {/* Left Column */}
      <div className="flex flex-1 flex-col justify-between p-4 sm:p-8 min-[900px]:p-12 min-[900px]:max-w-[520px] min-[1200px]:max-w-[560px] w-full">
        {/* Top Header / Logo / Back */}
        <div>
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-[#A3A6AD] hover:text-white transition cursor-pointer mb-6"
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
            <div className="mb-4">
              <Link href="/" className="inline-block">
                <PlayheadLogoWithText width={140} color="#FFFFFF" />
              </Link>
              <p className="mt-1 text-[13.5px] text-[#7C7F87] font-normal tracking-normal">
                by Idyll Productions
              </p>
            </div>
          )}
        </div>

        {/* Center Content: 400px centered */}
        <div className="my-auto w-full max-w-[400px] mx-auto py-6">
          {children}
        </div>

        {/* Footer */}
        <div className="pt-6">
          <div className="flex items-center gap-5 text-xs text-[#7C7F87]">
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

      {/* Right Column: Hidden under 900px, 24px margin, rounded-20px #212121 */}
      <div className="hidden min-[900px]:flex flex-1 m-6">
        <AuthShowcase />
      </div>
    </div>
  );
}
