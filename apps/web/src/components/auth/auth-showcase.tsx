"use client";

import React from "react";

export function AuthShowcase() {
  return (
    <div
      className="relative flex flex-col justify-between w-full h-full rounded-[20px] bg-[#212121] p-8 lg:p-10 overflow-hidden select-none border border-[#2E2F34]/40"
      style={{
        backgroundImage:
          "radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Top Titles */}
      <div className="z-10 mb-6">
        <h2 className="text-[28px] xl:text-[28px] font-bold text-white tracking-tight leading-tight">
          Review , share and deliver .
        </h2>
        <p className="mt-1.5 text-base xl:text-[20px] text-[#A3A6AD] font-normal">
          Every client, file and comment in one place.
        </p>
      </div>

      {/* Main Showcase Center (Static HTML / CSS Replica) */}
      <div className="relative my-auto flex items-center justify-center gap-6 xl:gap-8 py-4">
        {/* Vertical Video Player Frame */}
        <div className="relative w-[280px] sm:w-[300px] xl:w-[320px] rounded-[18px] bg-[#181818] border border-[#2E2F34] shadow-overlay p-3 flex flex-col">
          {/* Canvas / Portrait Video Content */}
          <div className="relative w-full aspect-[9/14] rounded-[10px] overflow-hidden bg-[#2E2F34] flex flex-col justify-between">
            {/* Abstract Graphic: Sun / Circle */}
            <div className="absolute top-[28%] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-[#FFBB56] shadow-sm" />

            {/* Amber Vertical Rectangle */}
            <div className="absolute top-[52%] right-[22%] w-11 h-16 rounded-[4px] bg-[#FFBB56]" />

            {/* Amber Circle Hand-Drawn Ring */}
            <svg
              className="absolute top-[50%] right-[15%] w-18 h-20 pointer-events-none"
              viewBox="0 0 80 90"
              fill="none"
            >
              <ellipse
                cx="40"
                cy="46"
                rx="24"
                ry="30"
                stroke="#FFBB56"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform="rotate(-8 40 46)"
              />
            </svg>

            {/* Hill Shape at Bottom */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-36 h-36 rounded-full bg-[#FFBB56]" />
          </div>

          {/* Player Scrubber & Controls */}
          <div className="mt-3 px-1">
            {/* Timeline Bar */}
            <div className="relative h-2 w-full bg-[#2A2B30] rounded-full flex items-center">
              {/* Blue Scrubber Played */}
              <div className="h-full w-[42%] bg-[#4876F3] rounded-full" />

              {/* Amber Range Band (e.g. 26% to 42%) */}
              <div className="absolute left-[26%] w-[16%] h-full bg-[#FFBB56]/50 rounded-full" />

              {/* White Scrubber Knob */}
              <div className="absolute left-[42%] -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-md border border-[#181818]" />

              {/* Sarah Avatar on Timeline (Teal) */}
              <div
                className="absolute top-4 left-[26%] -translate-x-1/2 w-4 h-4 rounded-full bg-[#4876F3] text-xs font-bold text-white flex items-center justify-center shadow"
                title="Sarah"
              >
                S
              </div>

              {/* Rohit Avatar on Timeline (Purple) */}
              <div
                className="absolute top-4 left-[64%] -translate-x-1/2 w-4 h-4 rounded-full bg-[#9787FF] text-xs font-bold text-white flex items-center justify-center shadow"
                title="Rohit"
              >
                R
              </div>

              {/* Team Avatar on Timeline (Pink) */}
              <div
                className="absolute top-4 left-[86%] -translate-x-1/2 w-4 h-4 rounded-full bg-[#F0506E] text-xs font-bold text-white flex items-center justify-center shadow"
                title="Nora"
              >
                N
              </div>
            </div>

            {/* Timecodes and Play Button */}
            <div className="mt-4 flex items-center justify-between text-xs font-mono text-[#A3A6AD]">
              <span>00:00:08:12</span>
              <button
                type="button"
                className="w-5 h-5 flex items-center justify-center text-white hover:text-[#4876F3] transition"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <span>00:00:32:00</span>
            </div>
          </div>
        </div>

        {/* Floating Feedback Cards */}
        <div className="flex flex-col gap-3.5 w-[220px] xl:w-[240px]">
          {/* Card 1: Sarah Client Comment */}
          <div className="rounded-[12px] bg-[#181818] border border-[#2E2F34] p-3 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#4876F3] text-white text-xs font-bold flex items-center justify-center">
                S
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-semibold text-white">Sarah</span>
                <span className="text-xs text-[#7C7F87]">Client · 2 min ago</span>
              </div>
            </div>
            {/* Amber Timecode Chip */}
            <div className="mt-2 inline-flex items-center px-1.5 py-0.5 rounded bg-[#26272C] text-[#FFBB56] text-xs font-mono font-medium">
              00:08 - 00:11
            </div>
            <p className="mt-1.5 text-[11.5px] text-[#A3A6AD] leading-snug">
              Logo is too small here, can we make it bigger?
            </p>
          </div>

          {/* Card 2: Rohit Team Only Comment */}
          <div className="rounded-[12px] bg-[#26272C] border border-[#26272C] p-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#9787FF] text-white text-xs font-bold flex items-center justify-center">
                  R
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[12px] font-semibold text-white">Rohit</span>
                  <span className="text-xs text-[#7C7F87]">Team · just now</span>
                </div>
              </div>
              {/* Amber Lock Icon */}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFBB56"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <p className="mt-2 text-[11.5px] text-[#A3A6AD] leading-snug">
              On it. Fixing in v2.
            </p>
            <span className="mt-1.5 inline-block text-[10.5px] font-medium text-[#FFBB56]">
              Team only
            </span>
          </div>

          {/* Card 3: Version Approved Badge */}
          <div className="rounded-[12px] bg-[#212121] border border-[#212121] px-3.5 py-2.5 shadow-xl flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#3FCF8E] text-white text-[11.5px] font-semibold">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Approved</span>
            </div>
            <span className="text-[11.5px] text-[#A3A6AD] font-medium">Version 2</span>
          </div>
        </div>
      </div>

      {/* Bottom 3 Features */}
      <div className="z-10 mt-6 pt-4 border-t border-[#2E2F34]/50 flex items-center justify-between text-xs text-[#A3A6AD]">
        {/* Feature 1 */}
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4876F3"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Frame accurate feedback</span>
        </div>

        {/* Feature 2 */}
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4876F3"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Live docs and sheets</span>
        </div>

        {/* Feature 3 */}
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4876F3"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            <polyline points="16 16 12 12 8 16" />
          </svg>
          <span>Fast, resumable uploads</span>
        </div>
      </div>
    </div>
  );
}
