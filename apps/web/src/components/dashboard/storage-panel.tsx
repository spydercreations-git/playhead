"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { CloudUploadIcon, HelpIcon } from "@/components/icons";

interface StoragePanelProps {
  usedBytes?: number;
  totalBytes?: number;
}

export function StoragePanel({
  usedBytes = 0,
  totalBytes = 25 * 1024 * 1024 * 1024, // 25 GB trial
}: StoragePanelProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const percentage = Math.min(Math.round((usedBytes / totalBytes) * 100), 100);

  const categories = [
    { name: "Videos", size: "0 B", color: "#FFBB56", percent: 0 },
    { name: "Images", size: "0 B", color: "#FA457B", percent: 0 },
    { name: "Documents", size: "0 B", color: "#9787FF", percent: 0 },
    { name: "Other", size: "0 B", color: "#1490DF", percent: 0 },
  ];

  return (
    <div className="flex w-full flex-col space-y-6 lg:w-[280px] xl:w-[300px] shrink-0">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Storage</h2>
        <p className="text-xs text-[#9A9DA0]">14-Day Free Trial</p>
      </div>

      {/* Ring Chart & Category Breakdown Container */}
      <div className="flex flex-col sm:flex-row lg:flex-col items-center sm:items-start lg:items-center gap-4 sm:gap-6">
        {/* Ring Chart matching Chart.svg */}
        <div className="relative flex flex-col items-center justify-center p-2 shrink-0 mx-auto sm:mx-0 lg:mx-auto">
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
        <div className="w-full space-y-3.5 flex-1">
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
                <span className="text-[#9A9DA0] text-[11px] font-medium">
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
      </div>

      {/* Upload Drag & Drop Box + Action Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6 lg:gap-6">
        {/* Upload Drag & Drop Box */}
        <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#9A9DA0] bg-[#212121] p-5 text-center transition-colors hover:border-white cursor-pointer min-h-[104px]">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#2E2F34]">
            <CloudUploadIcon size={20} color="#4876F3" />
          </div>
          <span className="text-sm font-semibold text-white">Upload File</span>
          <span className="mt-0.5 text-[11px] text-[#9A9DA0]">
            Drop cuts or click to browse
          </span>
        </div>

        {/* Action Card matching Figma */}
        <div className="relative flex flex-col items-center justify-between rounded-[28px] bg-[#2E2F34] p-5 pt-8 text-center min-h-[190px]">
          {/* Blue Circular Icon badge */}
          <div className="absolute -top-5 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-[#4876F3] shadow-none">
            <HelpIcon size={20} color="white" />
          </div>

          <div>
            <h3 className="text-base font-bold text-white">Let&apos;s start!</h3>
            <p className="mt-1 text-xs text-[#9A9DA0] leading-relaxed">
              Creating projects and sharing cuts couldn&apos;t be easier.
            </p>
          </div>

          {hasPermission("projects.create") ? (
            <button
              onClick={() => router.push("/projects")}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#4876F3] text-sm font-semibold text-white hover:bg-[#3B66D6] transition-colors"
            >
              + New Project
            </button>
          ) : (
            <button
              onClick={() => router.push("/projects")}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-[#2A2B30] border border-[#424344] text-sm font-semibold text-white hover:bg-[#34353B] transition-colors"
            >
              View Projects
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
