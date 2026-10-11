"use client";

import React, { useState } from "react";
import { StoragePanel } from "@/components/dashboard/storage-panel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderIcon,
  MoreOptionsIcon,
  SearchIcon,
  VideoCutIcon,
  ReviewFeedbackIcon,
  DocumentIcon,
} from "@/components/icons";

export default function DashboardPage() {
  const [selectedIds, setSelectedIds] = useState<number[]>([0]);

  // Top 4 Category Cards matching Figma (x=642, 838, 1034, 1231, y=132, w=172, h=216, rx=10, fill=#212121)
  const categoryCards = [
    {
      title: "Video Cuts",
      count: "480 Files",
      size: "38.5 GB",
      color: "#FFBB56",
      fillPercent: 65,
      icon: VideoCutIcon,
    },
    {
      title: "Client Reviews",
      count: "124 Files",
      size: "14.2 GB",
      color: "#FA457B",
      fillPercent: 40,
      icon: ReviewFeedbackIcon,
    },
    {
      title: "Active Boards",
      count: "18 Boards",
      size: "2.1 GB",
      color: "#4876F3",
      fillPercent: 55,
      icon: DocumentIcon,
    },
    {
      title: "Audio & Music",
      count: "210 Files",
      size: "8.4 GB",
      color: "#9787FF",
      fillPercent: 30,
      icon: DocumentIcon,
    },
  ];

  // Folder Cards matching Figma (x=642, 905, 1167, y=435, w=239, h=78, rx=10, fill=#212121)
  const folders = [
    {
      name: "Nike Campaign 2026",
      files: "31 Files",
      size: "2.6 GB",
    },
    {
      name: "Idyll UGC Monthly",
      files: "45 Files",
      size: "5.8 GB",
    },
    {
      name: "Client Delivered Cuts",
      files: "18 Files",
      size: "12.4 GB",
    },
  ];

  // Recent Files matching File1.svg - File5.svg
  const recentFiles = [
    {
      id: 0,
      name: "Nike_Commercial_v2.mp4",
      type: "video",
      badgeColor: "#4876F3",
      size: "420 MB",
      date: "Oct 11, 2026",
      collaborators: ["H", "R", "C"],
    },
    {
      id: 1,
      name: "Storyboards_Draft_v1.pdf",
      type: "pdf",
      badgeColor: "#F34B46",
      size: "18 MB",
      date: "Oct 10, 2026",
      collaborators: ["H", "R"],
    },
    {
      id: 2,
      name: "Moodboard_Color_Grade.png",
      type: "image",
      badgeColor: "#9787FF",
      size: "45 MB",
      date: "Oct 09, 2026",
      collaborators: ["H", "C"],
    },
    {
      id: 3,
      name: "Audio_Master_Track.wav",
      type: "audio",
      badgeColor: "#FF9800",
      size: "120 MB",
      date: "Oct 08, 2026",
      collaborators: ["R"],
    },
    {
      id: 4,
      name: "Delivered_Final_Cut_v3.mov",
      type: "video",
      badgeColor: "#4876F3",
      size: "1.8 GB",
      date: "Oct 07, 2026",
      collaborators: ["H", "R", "C"],
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 pb-10">
      {/* Middle Column: Storage & Upload Dropzone & New Project Card */}
      <StoragePanel />

      {/* Right Column: Main Dashboard Content */}
      <div className="flex-1 space-y-6 sm:space-y-8 min-w-0">
        {/* Top 4 Metric / Category Cards - 2x2 on mobile, 4 columns on large screens */}
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {categoryCards.map((card) => (
            <div
              key={card.title}
              className="flex flex-col justify-between rounded-[10px] bg-[#212121] p-3.5 sm:p-5 h-[175px] sm:h-[216px] transition-colors hover:bg-[#252525]"
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${card.color}15` }}
                >
                  <card.icon size={18} color={card.color} />
                </div>
                <button
                  title="Card options"
                  className="text-[#9A9DA0] hover:text-white"
                >
                  <MoreOptionsIcon size={16} color="#9A9DA0" />
                </button>
              </div>

              <div className="space-y-0.5 sm:space-y-1">
                <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                  {card.title}
                </h3>
                <p className="text-[11px] sm:text-xs text-[#9A9DA0]">{card.count}</p>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between text-xs text-white">
                  <span className="font-medium text-xs sm:text-sm">{card.size}</span>
                  <span className="text-[10px] sm:text-[11px] text-[#9A9DA0]">
                    {card.fillPercent}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${card.fillPercent}%`,
                      backgroundColor: card.color,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* All Folders Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">
              All Folders
            </h2>
            <button className="text-xs font-medium text-[#BCBFC2] hover:text-white transition-colors">
              View more &gt;
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {folders.map((folder) => (
              <div
                key={folder.name}
                className="flex items-center justify-between rounded-[10px] bg-[#212121] px-4 sm:px-5 py-3.5 sm:py-4 h-[74px] sm:h-[78px] transition-colors hover:bg-[#252525] cursor-pointer"
              >
                <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                  <FolderIcon size={28} color="#4876F3" />
                  <div className="flex flex-col truncate">
                    <span className="text-sm font-semibold text-white truncate">
                      {folder.name}
                    </span>
                    <span className="text-xs text-[#9A9DA0]">
                      {folder.files} · {folder.size}
                    </span>
                  </div>
                </div>

                <button
                  title="Folder options"
                  className="text-[#9A9DA0] hover:text-white shrink-0 ml-2"
                >
                  <MoreOptionsIcon size={18} color="#9A9DA0" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Files Section ("Last Files") */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Last Files
            </h2>

            {/* Filter Controls (Search + Details + Filter buttons from Figma) */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="flex h-[41px] flex-1 sm:flex-initial items-center gap-2 rounded-[7.5px] border border-[#424344] bg-[#212121] px-3 text-xs text-[#9A9DA0]">
                <SearchIcon size={15} color="#9A9DA0" />
                <input
                  type="text"
                  placeholder="Search files..."
                  className="w-full sm:w-56 bg-transparent text-white placeholder-[#9A9DA0] focus:outline-none"
                />
              </div>

              <button className="flex h-[41px] items-center justify-center rounded-[7.5px] border border-[#424344] bg-[#212121] px-3 sm:px-3.5 text-xs font-medium text-white hover:bg-[#2E2F34] transition-colors shrink-0">
                Details
              </button>
              <button className="flex h-[41px] items-center justify-center rounded-[7.5px] border border-[#424344] bg-[#212121] px-3 sm:px-3.5 text-xs font-medium text-white hover:bg-[#2E2F34] transition-colors shrink-0">
                Filter
              </button>
            </div>
          </div>

          {/* Files Table matching File1.svg to File5.svg */}
          <div className="overflow-x-auto rounded-[10px] border border-[#424344] bg-[#212121]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#424344] text-[#9A9DA0] font-medium h-12">
                  <th className="w-12 px-4 text-center">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={recentFiles.length > 0 && selectedIds.length === recentFiles.length}
                        onCheckedChange={() => {
                          if (selectedIds.length === recentFiles.length) {
                            setSelectedIds([]);
                          } else {
                            setSelectedIds(recentFiles.map((f) => f.id));
                          }
                        }}
                        ariaLabel="Select all files"
                      />
                    </div>
                  </th>
                  <th className="px-4 font-medium text-white">Name</th>
                  <th className="px-4 font-medium">File Size</th>
                  <th className="px-4 font-medium">Date</th>
                  <th className="px-4 font-medium">Assignee</th>
                  <th className="w-12 px-4 text-center font-medium">Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#424344]/50">
                {recentFiles.map((file) => {
                  const isChecked = selectedIds.includes(file.id);

                  return (
                    <tr
                      key={file.id}
                      onClick={() => {
                        setSelectedIds((prev) =>
                          prev.includes(file.id)
                            ? prev.filter((id) => id !== file.id)
                            : [...prev, file.id]
                        );
                      }}
                      className={`h-16 transition-colors cursor-pointer ${
                        isChecked ? "bg-[#2E2F34]/80" : "hover:bg-[#2E2F34]/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 text-center">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              setSelectedIds((prev) =>
                                prev.includes(file.id)
                                  ? prev.filter((id) => id !== file.id)
                                  : [...prev, file.id]
                              );
                            }}
                            ariaLabel={`Select ${file.name}`}
                          />
                        </div>
                      </td>

                      {/* File Name & 32px Colored Circular Icon Badge */}
                      <td className="px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${file.badgeColor}18` }}
                          >
                            <span
                              className="text-[10px] font-bold uppercase"
                              style={{ color: file.badgeColor }}
                            >
                              {file.type}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-white truncate max-w-[220px] sm:max-w-xs">
                            {file.name}
                          </span>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="px-4 text-[#9A9DA0] font-medium">
                        {file.size}
                      </td>

                      {/* Date */}
                      <td className="px-4 text-[#9A9DA0]">{file.date}</td>

                      {/* Assignee / Collaborator Avatars (overlapping 20x20 circles) */}
                      <td className="px-4">
                        <div className="flex items-center -space-x-1.5">
                          {file.collaborators.map((initial, i) => (
                            <div
                              key={i}
                              className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#212121] bg-[#424344] text-[9px] font-bold text-white"
                            >
                              {initial}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* 3-Dots Options */}
                      <td className="px-4 text-center">
                        <button
                          title="File options"
                          className="flex h-7 w-7 items-center justify-center mx-auto rounded text-[#9A9DA0] hover:text-white"
                        >
                          <MoreOptionsIcon size={16} color="#9A9DA0" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
