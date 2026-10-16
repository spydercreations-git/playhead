"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Folder,
  Film,
  FileText,
  Music,
  Share2,
  Calendar,
  User,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

export default function SharedWithMePage() {
  const [filter, setFilter] = useState<"all" | "projects" | "files">("all");

  const { data: sharedItems = [], isLoading } = useQuery({
    queryKey: ["shared-with-me"],
    queryFn: async () => {
      const res = await apiRequest("/shared-with-me");
      return res.items || [];
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#424344]/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4876F3]/10 text-[#4876F3] flex items-center justify-center">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Shared with me</h1>
            <p className="text-xs text-[#A3A6AD] mt-0.5">
              Items and projects that collaborators have directly shared with you
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-[#212121] p-1 rounded-xl border border-[#424344]/50 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filter === "all" ? "bg-[#212121] text-white" : "text-[#A3A6AD] hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("projects")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filter === "projects" ? "bg-[#212121] text-white" : "text-[#A3A6AD] hover:text-white"
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setFilter("files")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filter === "files" ? "bg-[#212121] text-white" : "text-[#A3A6AD] hover:text-white"
              }`}
            >
              Files
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 max-w-6xl w-full mx-auto space-y-6">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-[#A3A6AD]">
              Loading shared items...
            </div>
          ) : sharedItems.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-[#212121] rounded-xl">
              <Share2 className="w-10 h-10 text-[#A3A6AD] mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white">Nothing shared with you yet</h3>
              <p className="text-xs text-[#A3A6AD] mt-1">
                When someone gives you direct access to a project or file, it will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedItems.map((item: any) => {
                const isProject = item.target_type === "project";
                const isVideo = item.name?.endsWith(".mp4") || item.name?.endsWith(".mov");

                const targetUrl = isProject
                  ? `/projects/${item.target_id}`
                  : `/projects/${item.project_id}?item=${item.target_id}`;

                return (
                  <Link
                    key={item.id}
                    href={targetUrl}
                    className="group p-4 bg-[#181818] hover:bg-[#181818] border border-[#212121] hover:border-[#424344] rounded-xl transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isProject ? (
                            <Folder className="w-5 h-5 text-[#4876F3]" />
                          ) : isVideo ? (
                            <Film className="w-5 h-5 text-violet-400" />
                          ) : (
                            <FileText className="w-5 h-5 text-blue-400" />
                          )}
                          <span className="text-[13px] font-medium text-[#A3A6AD]">
                            {isProject ? "Project" : item.kind || "File"}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 text-xs bg-[#212121] text-emerald-400 rounded-md font-medium ">
                          {item.grant_level || "Viewer"}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-white group-hover:text-[#4876F3] transition-colors truncate">
                        {item.name}
                      </h3>
                      <p className="text-xs text-[#A3A6AD] mt-1 truncate">
                        {isProject ? item.client_name : `In ${item.project_name || "Project"}`}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#212121] flex items-center justify-between text-xs text-[#A3A6AD]">
                      <span>{item.can_download ? "Downloads enabled" : "Downloads off"}</span>
                      <span className="flex items-center gap-1 group-hover:text-white transition-colors">
                        Open <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
}
