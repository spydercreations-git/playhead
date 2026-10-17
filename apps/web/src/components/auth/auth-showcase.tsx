"use client";

import React, { useEffect, useState } from "react";

export function AuthShowcase() {
  const [progress, setProgress] = useState(58); // default ~58%
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Detect reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);

    if (mediaQuery.matches) {
      setProgress(58);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    // 12-second smooth playhead sweep animation
    const duration = 12000;
    const startTime = performance.now();
    let animationFrameId: number;

    const animate = (now: number) => {
      const elapsed = (now - startTime) % duration;
      const currentProgress = (elapsed / duration) * 100;
      setProgress(currentProgress);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      mediaQuery.removeEventListener("change", listener);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Comment dots on the timeline (at 20%, 60%, 80%)
  const commentDots = [20, 60, 80];

  return (
    <div className="relative flex flex-col justify-between w-full h-full rounded-[16px] bg-[#212121] border border-[#2E2F34] p-8 xl:p-10 select-none overflow-hidden">
      {/* Top Headline */}
      <div className="z-10 mb-6">
        <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">
          Review, share and deliver.
        </h2>
        <p className="text-[28px] font-semibold text-[#7C7F87] tracking-tight leading-tight mt-1">
          Every client, file and comment in one place.
        </p>
      </div>

      {/* Center Showcase: Viewfinder + Timeline */}
      <div className="my-auto w-full flex flex-col gap-6 py-2">
        {/* Viewfinder Container */}
        <div className="relative w-full aspect-[16/10] max-h-[460px] rounded-[12px] bg-[#111113] border border-[#2E2F34] overflow-hidden shadow-xl">
          {/* Real video background */}
          <video
            src="/dbx1-hero-1920x1080-v2.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover rounded-[12px] opacity-75"
          />

          {/* Subtle dark overlay for contrast */}
          <div className="absolute inset-0 bg-black/20 pointer-events-none" />

          {/* Rule-of-Thirds Grid Lines */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 bottom-0 left-1/3 w-[1px] bg-[#2E2F34]/70" />
            <div className="absolute top-0 bottom-0 left-2/3 w-[1px] bg-[#2E2F34]/70" />
            <div className="absolute left-0 right-0 top-1/3 h-[1px] bg-[#2E2F34]/70" />
            <div className="absolute left-0 right-0 top-2/3 h-[1px] bg-[#2E2F34]/70" />
          </div>

          {/* Center Crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="7" y1="2" x2="7" y2="12" stroke="#7C7F87" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="7" x2="12" y2="7" stroke="#7C7F87" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* 4 Corner Brackets */}
          <div className="absolute inset-4 pointer-events-none">
            {/* Top-left */}
            <svg className="absolute top-0 left-0 w-5 h-5" viewBox="0 0 20 20" fill="none">
              <path d="M 20 2 H 2 V 20" stroke="#7C7F87" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {/* Top-right */}
            <svg className="absolute top-0 right-0 w-5 h-5" viewBox="0 0 20 20" fill="none">
              <path d="M 0 2 H 18 V 20" stroke="#7C7F87" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {/* Bottom-left */}
            <svg className="absolute bottom-0 left-0 w-5 h-5" viewBox="0 0 20 20" fill="none">
              <path d="M 2 0 V 18 H 20" stroke="#7C7F87" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {/* Bottom-right */}
            <svg className="absolute bottom-0 right-0 w-5 h-5" viewBox="0 0 20 20" fill="none">
              <path d="M 18 0 V 18 H 0" stroke="#7C7F87" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          {/* Top-Left HUD: Red dot + "In review" */}
          <div className="absolute top-5 left-7 flex items-center gap-2 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-[#F0506E] shadow-[0_0_8px_#F0506E]" />
            <span className="text-xs font-medium text-[#A3A6AD]">In review</span>
          </div>

          {/* Top-Right HUD: Timecode */}
          <div className="absolute top-5 right-7 pointer-events-none">
            <span className="text-xs font-mono tabular-nums text-[#A3A6AD]">00:00:08:12</span>
          </div>

          {/* Bottom-Left HUD: Resolution/FPS */}
          <div className="absolute bottom-5 left-7 pointer-events-none">
            <span className="text-xs font-mono tabular-nums text-[#7C7F87]">16:9 · 1080p · 24 fps</span>
          </div>

          {/* Amber Circle Annotation */}
          <div className="absolute top-[42%] right-[16%] w-24 h-16 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 96 64" fill="none">
              <ellipse
                cx="48"
                cy="32"
                rx="42"
                ry="24"
                stroke="#FFBB56"
                strokeWidth="2.5"
                transform="rotate(-4 48 32)"
              />
            </svg>
          </div>

          {/* Pinned Comment Card */}
          <div className="absolute top-[36%] left-[56%] -translate-x-1/2 rounded-[8px] bg-[#1F2024]/95 border border-[#2E2F34] shadow-xl p-3 max-w-[210px] pointer-events-none backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#0284C7] text-white text-xs font-bold flex items-center justify-center shrink-0">
                S
              </div>
              <span className="text-xs font-medium text-white">Sarah</span>
              <span className="text-xs text-[#7C7F87]">·</span>
              <span className="text-xs font-mono tabular-nums text-[#7C7F87]">00:08</span>
            </div>
            <p className="mt-1.5 text-xs text-white font-normal leading-snug">
              Make the logo bigger here?
            </p>
          </div>
        </div>

        {/* Timeline under the Viewfinder */}
        <div className="w-full flex flex-col gap-2 px-1">
          {/* Time Labels */}
          <div className="relative w-full flex justify-between text-xs font-mono tabular-nums text-[#7C7F87]">
            <span>00:00</span>
            <span className="absolute left-[20%] -translate-x-1/2">00:02</span>
            <span className="absolute left-[60%] -translate-x-1/2">00:06</span>
            <span className="absolute left-[80%] -translate-x-1/2">00:08</span>
            <span>00:10</span>
          </div>

          {/* Ticks Bar */}
          <div className="relative w-full h-1 flex justify-between">
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                className="w-[1px] h-1 bg-[#2E2F34]"
                style={{
                  height: i % 2 === 0 ? "4px" : "2px",
                }}
              />
            ))}
          </div>

          {/* Track and Progress Bar */}
          <div className="relative w-full h-[2px] bg-[#2A2B30] rounded-full my-2 flex items-center">
            {/* Blue Progress Line */}
            <div
              className="h-full bg-[#4876F3] rounded-full"
              style={{ width: `${progress}%` }}
            />

            {/* Amber Comment Dots on Timeline */}
            {commentDots.map((pos) => {
              const isPassing = Math.abs(progress - pos) < 4 && !prefersReducedMotion;
              return (
                <div
                  key={pos}
                  className={`absolute w-2 h-2 rounded-full bg-[#FFBB56] -translate-x-1/2 transition-transform duration-200 ${
                    isPassing ? "scale-150 shadow-[0_0_8px_#FFBB56]" : "shadow-[0_0_4px_rgba(255,187,86,0.6)]"
                  }`}
                  style={{ left: `${pos}%` }}
                />
              );
            })}

            {/* Playhead Marker & Vertical Line */}
            <div
              className="absolute pointer-events-none -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${progress}%` }}
            >
              {/* Playhead Top Badge */}
              <div className="w-2.5 h-3 bg-[#4876F3] rounded-t-sm -mt-4 shadow-sm" />
              {/* Vertical Playhead Needle */}
              <div className="w-[1.5px] h-7 bg-[#4876F3] shadow-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Features with Icons */}
      <div className="pt-4 flex items-center justify-between gap-4 text-xs text-[#A3A6AD] border-t border-[#2E2F34]/50">
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
            <path d="M5 3H3v2" />
            <path d="M19 3h2v2" />
            <path d="M5 21H3v-2" />
            <path d="M19 21h2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
          <span className="font-medium">Frame accurate feedback</span>
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
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <span className="font-medium">Live docs and sheets</span>
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="font-medium">Fast, resumable uploads</span>
        </div>
      </div>
    </div>
  );
}
