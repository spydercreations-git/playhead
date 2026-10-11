"use client";

import React from "react";
import { CloudUploadIcon, HelpIcon } from "@/components/icons";

interface StoragePanelProps {
  usedBytes?: number;
  totalBytes?: number;
}

export function StoragePanel({
  usedBytes = 0,
  totalBytes = 25 * 1024 * 1024 * 1024, // 25 GB trial
}: StoragePanelProps) {
  const percentage = Math.min(Math.round((usedBytes / totalBytes) * 100), 100);

  const categories = [
    { name: "Videos", size: "0 B", color: "#FFBB56", percent: 0 },
    { name: "Images", size: "0 B", color: "#FA457B", percent: 0 },
    { name: "Documents", size: "0 B", color: "#9787FF", percent: 0 },
    { name: "Other", size: "0 B", color: "#1490DF", percent: 0 },
  ];

  return (
    <div className="flex w-full flex-col space-y-6 lg:w-[260px] shrink-0">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Storage</h2>
        <p className="text-xs text-[#9A9DA0]">14-Day Free Trial</p>
      </div>

      {/* Ring Chart matching Chart.svg */}
      <div className="relative flex flex-col items-center justify-center p-2">
        <svg className="h-44 w-44 -rotate-90" viewBox="0 0 100 100">
          {/* Background track circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#2E2F34"
            strokeWidth="9"
          />
          {/* Active progress stroke */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#4876F3"
            strokeWidth="9"
            strokeDasharray="251.2"
            strokeDashoffset={251.2 - (251.2 * Math.max(percentage, 3)) / 100}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Text inside Ring Chart */}
        <div className="absolute flex flex-col items-center text-center">
          <span className="text-2xl font-bold text-white">0 B</span>
          <span className="text-[11px] font-medium text-[#9A9DA0]">
            Used of 25 GB
          </span>
        </div>
      </div>

      {/* Category Breakdown Bars */}
      <div className="space-y-3.5">
        {categories.map((cat) => (
          <div key={cat.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-medium flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
              </span>
              <span className="text-[#9A9DA0] font-mono text-[11px]">
                {cat.size}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2E2F34]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${cat.percent}%`,
                  backgroundColor: cat.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Upload Drag & Drop Box (x=338.5, y=621.5, w=235, h=104, rx=9.5) */}
      <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#9A9DA0] bg-[#212121] p-5 text-center transition-colors hover:border-white cursor-pointer">
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#2E2F34]">
          <CloudUploadIcon size={20} color="#4876F3" />
        </div>
        <span className="text-sm font-semibold text-white">Upload File</span>
        <span className="mt-0.5 text-[11px] text-[#9A9DA0]">
          Drop cuts or click to browse
        </span>
      </div>

      {/* Action Card matching Figma (x=338, y=781, w=236, h=209, rx=28, fill=#2E2F34) */}
      <div className="relative flex flex-col items-center rounded-[28px] bg-[#2E2F34] p-5 pt-8 text-center">
        {/* Blue Circular Icon badge (43x43, rx=21.5, fill=#4876F3, stroke=white) */}
        <div className="absolute -top-5 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-[#4876F3] shadow-none">
          <HelpIcon size={20} color="white" />
        </div>

        <h3 className="text-base font-bold text-white">Let&apos;s start!</h3>
        <p className="mt-1 text-xs text-[#9A9DA0] leading-relaxed">
          Creating projects and sharing cuts couldn&apos;t be easier.
        </p>

        {/* Action Button (x=368, y=904.5, w=176, h=48, rx=12, fill=#4876F3) */}
        <button
          onClick={() => {}}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#4876F3] text-sm font-semibold text-white hover:bg-[#3B66D6] transition-colors"
        >
          + New Project
        </button>
      </div>
    </div>
  );
}
