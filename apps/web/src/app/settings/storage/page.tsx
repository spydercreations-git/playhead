"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { Check } from "lucide-react";

interface StorageStats {
  plan: string;
  storage_used_bytes: number;
  storage_reserved_bytes: number;
  storage_limit_bytes: number;
  storage_price_per_gb: number;
  estimated_monthly_cost: number;
  breakdown: Array<{
    client_id: string;
    client_name: string;
    project_id: string;
    project_name: string;
    file_count: number;
    video_count: number;
    project_bytes: number;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function StorageSettingsPage() {
  const { user, hasPermission, isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery<StorageStats>({
    queryKey: ["admin-storage"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/storage");
      if (!res.ok) {
        throw new Error("Failed to load storage dashboard");
      }
      return res.json();
    },
    enabled: !!user && hasPermission("admin.storage"),
  });

  if (authLoading || isLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-[#2E2F34] animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-[#2E2F34] animate-pulse rounded-xl" />
          <div className="h-32 bg-[#2E2F34] animate-pulse rounded-xl" />
          <div className="h-32 bg-[#2E2F34] animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!hasPermission("admin.storage")) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Admin Access Required</h2>
        <p className="text-sm text-[#A3A6AD]">
          The storage and billing dashboard is only available to workspace administrators.
        </p>
        <Link
          href="/projects"
          className="inline-block px-4 py-2 bg-[#4876F3] text-white rounded-lg text-sm font-semibold hover:bg-[#3B67E0]"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-white">Failed to Load Storage</h2>
        <p className="text-sm text-red-400">
          {error instanceof Error ? error.message : "An error occurred"}
        </p>
      </div>
    );
  }

  const isInternal = data.plan === "internal";
  const usedGB = data.storage_used_bytes / (1024 * 1024 * 1024);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-[#A3A6AD] mb-1">
            <Link href="/settings" className="hover:text-white">Settings</Link>
            <span>/</span>
            <span className="text-white">Storage & Usage</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Storage & Pay-as-you-go Usage</h1>
          <p className="text-sm text-[#A3A6AD] mt-1">
            Byte-accurate storage tracking across all file versions and Trash until permanently deleted.
          </p>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#212121] border border-[#424344] rounded-xl p-5 space-y-2">
            <span className="text-xs font-medium text-[#A3A6AD]">Total Storage Used</span>
            <div className="text-2xl font-bold text-white">
              {formatBytes(data.storage_used_bytes)}
            </div>
            <p className="text-xs text-[#A3A6AD]">
              {usedGB.toFixed(2)} GB total consumed
            </p>
          </div>

          <div className="bg-[#212121] border border-[#424344] rounded-xl p-5 space-y-2">
            <span className="text-xs font-medium text-[#A3A6AD]">Estimated Monthly Cost</span>
            <div className="text-2xl font-bold text-[#4876F3]">
              ${data.estimated_monthly_cost.toFixed(2)}
            </div>
            <p className="text-xs text-[#A3A6AD]">
              At ${data.storage_price_per_gb} / GB / month
            </p>
          </div>

          <div className="bg-[#212121] border border-[#424344] rounded-xl p-5 space-y-2">
            <span className="text-xs font-medium text-[#A3A6AD]">Workspace Plan</span>
            <div className="text-lg font-bold text-white capitalize">
              {isInternal ? "Internal Studio (Pay as you go)" : data.plan}
            </div>
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              {isInternal ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Unlimited quota, no trial expiry</span>
                </>
              ) : (
                `${formatBytes(data.storage_limit_bytes)} cap`
              )}
            </p>
          </div>

          <div className="bg-[#212121] border border-[#424344] rounded-xl p-5 space-y-2">
            <span className="text-xs font-medium text-[#A3A6AD]">Reserved In-Flight</span>
            <div className="text-2xl font-bold text-white">
              {formatBytes(data.storage_reserved_bytes)}
            </div>
            <p className="text-xs text-[#A3A6AD]">
              Active uploads in progress
            </p>
          </div>
        </div>

        {/* Breakdown by Client & Project */}
        <div className="bg-[#212121] border border-[#424344] rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-[#424344]/50 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Storage Breakdown by Client & Project</h2>
              <p className="text-xs text-[#A3A6AD] mt-0.5">
                Shows exact consumption per client folder and project workspace.
              </p>
            </div>
          </div>

          {data.breakdown.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#A3A6AD]">
              No active projects with storage usage yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181818] text-[#A3A6AD] border-b border-[#424344]/50">
                  <tr>
                    <th className="px-5 py-3 font-medium">Client</th>
                    <th className="px-5 py-3 font-medium">Project</th>
                    <th className="px-5 py-3 font-medium">Files</th>
                    <th className="px-5 py-3 font-medium">Videos</th>
                    <th className="px-5 py-3 font-medium text-right">Storage Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#424344]/30 text-white">
                  {data.breakdown.map((row) => (
                    <tr key={row.project_id} className="hover:bg-[#2E2F34]/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-[#A3A6AD]">
                        <Link href={`/clients/${row.client_id}`} className="hover:text-white transition-colors">
                          {row.client_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 font-semibold">
                        <Link href={`/projects/${row.project_id}`} className="hover:text-[#4876F3] transition-colors">
                          {row.project_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-[#A3A6AD]">{row.file_count}</td>
                      <td className="px-5 py-3.5 text-[#A3A6AD]">{row.video_count}</td>
                      <td className="px-5 py-3.5 font-semibold text-right text-emerald-400">
                        {formatBytes(row.project_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
