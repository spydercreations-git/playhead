"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { AlertCircle } from "@/components/ui/icon";
import Link from "next/link";

interface StorageBreakdown {
  videos_bytes: number;
  videos_pct: number;
  images_bytes: number;
  images_pct: number;
  documents_bytes: number;
  documents_pct: number;
  other_bytes: number;
  other_pct: number;
}

interface ClientStorageRow {
  client_id: string;
  client_name: string;
  project_count: number;
  used_bytes: number;
  share_percentage: number;
}

interface StorageResponse {
  total_bytes: number;
  files_count: number;
  projects_count: number;
  clients_count: number;
  breakdown: StorageBreakdown;
  clients: ClientStorageRow[];
}

// Token-compliant client badge colors from avatar palette
const BADGE_COLORS = [
  { bg: "#1e293b", text: "#60a5fa" }, // Slate blue
  { bg: "#450a0a", text: "#f87171" }, // Crimson red
  { bg: "#064e3b", text: "#34d399" }, // Emerald green
  { bg: "#0f766e", text: "#4dd6ac" }, // Teal
  { bg: "#2a2b30", text: "#9ca3af" }, // Neutral slate
  { bg: "#2e1065", text: "#c084fc" }, // Purple
];

function getBadgeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BADGE_COLORS.length;
  return BADGE_COLORS[index];
}

export default function StoragePage() {
  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiRequest("/users/me"),
  });

  const isStaff =
    currentUser?.role === "owner" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "producer" ||
    currentUser?.role === "lead" ||
    currentUser?.is_staff === true;

  const { data, isLoading, error } = useQuery<StorageResponse>({
    queryKey: ["storage-overview"],
    queryFn: () => apiRequest("/storage"),
    enabled: !isUserLoading && isStaff,
  });

  if (!isUserLoading && !isStaff) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-white p-6 md:p-8">
        <div className="max-w-4xl mx-auto py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4 text-[#ffd43b]">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Access Restricted</h1>
          <p className="text-sm text-[var(--text-2)] mt-2 max-w-md mx-auto">
            Playhead workspace storage overview is only visible to staff members.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-sm font-medium text-white hover:bg-[var(--hover)] transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalBytes = data?.total_bytes ?? 0;
  const formattedTotal = formatBytes(totalBytes);
  const totalParts = formattedTotal.split(" ");
  const totalNumber = totalParts[0];
  const totalUnit = totalParts[1] || "B";

  const breakdown = data?.breakdown || {
    videos_bytes: 0,
    videos_pct: 0,
    images_bytes: 0,
    images_pct: 0,
    documents_bytes: 0,
    documents_pct: 0,
    other_bytes: 0,
    other_pct: 0,
  };

  const clients = data?.clients || [];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">Storage</h1>
          <p className="text-sm text-[var(--text-2)] mt-1">
            How much space the whole workspace uses.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 animate-pulse">
              <div className="h-10 w-40 bg-[var(--input)] rounded-lg mb-2" />
              <div className="h-4 w-64 bg-[var(--input)] rounded mb-6" />
              <div className="h-3 w-full bg-[var(--input)] rounded-full mb-4" />
              <div className="h-4 w-96 bg-[var(--input)] rounded" />
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 animate-pulse">
              <div className="h-6 w-32 bg-[var(--input)] rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 w-full bg-[var(--input)] rounded" />
                <div className="h-10 w-full bg-[var(--input)] rounded" />
                <div className="h-10 w-full bg-[var(--input)] rounded" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
            <AlertCircle className="w-8 h-8 text-[#f0506e] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">Failed to load storage data</h3>
            <p className="text-sm text-[var(--text-2)] mt-1">
              Please check your network connection and try refreshing the page.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Main storage hero card */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white tracking-tight tabular-nums">
                  {totalNumber} {totalUnit}
                </span>
                <span className="text-base text-[var(--text-3)] font-normal">used</span>
              </div>
              <p className="text-sm text-[var(--text-2)] mt-1">
                Across {data?.clients_count ?? 0} clients, {data?.projects_count ?? 0} projects and{" "}
                {(data?.files_count ?? 0).toLocaleString()} files
              </p>

              {/* Segmented Progress Bar */}
              <div className="mt-5 h-2.5 w-full rounded-full bg-[var(--input)] overflow-hidden flex">
                {totalBytes > 0 ? (
                  <>
                    {breakdown.videos_pct > 0 && (
                      <div
                        style={{ width: `${breakdown.videos_pct}%` }}
                        className="h-full bg-[#4876f3] transition-all"
                        title={`Videos: ${breakdown.videos_pct}%`}
                      />
                    )}
                    {breakdown.images_pct > 0 && (
                      <div
                        style={{ width: `${breakdown.images_pct}%` }}
                        className="h-full bg-[#9787ff] transition-all"
                        title={`Images: ${breakdown.images_pct}%`}
                      />
                    )}
                    {breakdown.documents_pct > 0 && (
                      <div
                        style={{ width: `${breakdown.documents_pct}%` }}
                        className="h-full bg-[#3fcf8e] transition-all"
                        title={`Documents and PDFs: ${breakdown.documents_pct}%`}
                      />
                    )}
                    {breakdown.other_pct > 0 && (
                      <div
                        style={{ width: `${breakdown.other_pct}%` }}
                        className="h-full bg-[#71717a] transition-all"
                        title={`Other: ${breakdown.other_pct}%`}
                      />
                    )}
                  </>
                ) : (
                  <div className="h-full w-full bg-[var(--input)]" />
                )}
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-6 text-xs text-[var(--text-2)]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#4876f3]" />
                  <span>Videos {breakdown.videos_pct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#9787ff]" />
                  <span>Images {breakdown.images_pct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#3fcf8e]" />
                  <span>Documents and PDFs {breakdown.documents_pct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#71717a]" />
                  <span>Other {breakdown.other_pct}%</span>
                </div>
              </div>
            </div>

            {/* By client table */}
            <div>
              <h2 className="text-base font-semibold text-white mb-4">By client</h2>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-xs text-[var(--text-3)]">
                      <th className="py-3 px-4 font-medium">Client</th>
                      <th className="py-3 px-4 font-medium text-center sm:text-left">Projects</th>
                      <th className="py-3 px-4 font-medium">Used</th>
                      <th className="py-3 px-4 font-medium">Share of total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {clients.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-sm text-[var(--text-3)]">
                          No client storage usage recorded.
                        </td>
                      </tr>
                    ) : (
                      clients.map((client) => {
                        const badge = getBadgeColor(client.client_name);
                        const initial = client.client_name ? client.client_name.charAt(0).toUpperCase() : "?";
                        const pct = client.share_percentage;
                        const pctDisplay =
                          pct < 1 && client.used_bytes > 0
                            ? "<1%"
                            : `${Math.round(pct)}%`;
                        const barWidth =
                          pct < 1 && client.used_bytes > 0
                            ? 2
                            : Math.min(100, Math.max(0, pct));

                        return (
                          <tr
                            key={client.client_id}
                            className="hover:bg-[var(--input)]/40 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <Link
                                href={`/clients/${client.client_id}`}
                                className="inline-flex items-center gap-3 group"
                              >
                                <span
                                  style={{ backgroundColor: badge.bg, color: badge.text }}
                                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold shrink-0"
                                >
                                  {initial}
                                </span>
                                <span className="text-sm font-medium text-white group-hover:text-[#4876f3] transition-colors truncate max-w-xs">
                                  {client.client_name}
                                </span>
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-sm text-[var(--text-2)] tabular-nums text-center sm:text-left">
                              {client.project_count}
                            </td>
                            <td className="py-3 px-4 text-sm font-medium text-white tabular-nums">
                              {formatBytes(client.used_bytes)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="h-1.5 w-32 sm:w-44 rounded-full bg-[var(--input)] overflow-hidden">
                                  <div
                                    style={{ width: `${barWidth}%` }}
                                    className="h-full bg-[#4876f3] rounded-full transition-all"
                                  />
                                </div>
                                <span className="text-xs text-[var(--text-3)] tabular-nums w-8 text-right shrink-0">
                                  {pctDisplay}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
