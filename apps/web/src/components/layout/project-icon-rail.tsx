"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, clearAuthCache } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home,
  Search,
  Bell,
  UploadCloud,
  Settings,
  LogOut,
  X,
} from "@/components/ui/icon";

interface ProjectIconRailProps {
  activeUploadsCount?: number;
  onToggleUploads?: () => void;
}

export function ProjectIconRail({
  activeUploadsCount = 0,
  onToggleUploads,
}: ProjectIconRailProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Unread notifications count
  const { data: notifData } = useQuery({
    queryKey: ["unread-notifications-count"],
    queryFn: async () => {
      try {
        const res = await apiRequest("/notifications?limit=1");
        return res?.unread_count || 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 30000,
  });

  const unreadCount = typeof notifData === "number" ? notifData : 0;

  const initials = useMemo(() => {
    if (user?.name && user.name.trim()) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return user.name.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "";
  }, [user]);

  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {}
    clearAuthCache(queryClient);
    router.push("/login");
  };

  return (
    <>
      <aside className="w-[56px] min-w-[56px] max-w-[56px] h-screen border-r border-[var(--border)] bg-[var(--bg)] flex flex-col items-center py-3.5 justify-between shrink-0 select-none z-30">
        {/* Top: Mini Playhead Logo & Nav Icons */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Logo */}
          <Link
            href="/"
            title="Playhead Home"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] hover:bg-[var(--input)] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 64 64"
              width="24"
              height="24"
              fill="#FFFFFF"
            >
              <g transform="translate(0 6.5)">
                <path
                  fillRule="evenodd"
                  d="M12.000 12.000Q12.000 5.000 19.000 5.000L45.000 5.000Q52.000 5.000 52.000 12.000L52.000 29.000Q52.000 31.000 50.400 32.200L34.400 44.200Q32.000 46.000 29.600 44.200L13.600 32.200Q12.000 31.000 12.000 29.000ZM25.500 16.662Q25.500 12.000 29.466 14.450L38.919 20.288Q42.500 22.500 38.919 24.712L29.466 30.550Q25.500 33.000 25.500 28.338Z"
                />
              </g>
            </svg>
          </Link>

          <div className="w-6 h-[1px] bg-[var(--border)]" />

          {/* Home */}
          <Link
            href="/"
            title="Home"
            className="group relative flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors"
          >
            <Home className="w-5 h-5" />
            <span className="sr-only">Home</span>
          </Link>

          {/* Search */}
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            title="Search (⌘K)"
            className="group relative flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors"
          >
            <Search className="w-5 h-5" />
            <span className="sr-only">Search</span>
          </button>

          {/* Notifications */}
          <Link
            href="/notifications"
            title="Notifications"
            className="group relative flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4876F3] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4876F3]" />
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Link>

          {/* Uploads */}
          <button
            type="button"
            onClick={onToggleUploads}
            title={activeUploadsCount > 0 ? `${activeUploadsCount} uploads in progress` : "Uploads"}
            className="group relative flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors"
          >
            <UploadCloud className="w-5 h-5" />
            {activeUploadsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4876F3] px-1 text-xs font-bold text-white">
                {activeUploadsCount}
              </span>
            )}
            <span className="sr-only">Uploads</span>
          </button>
        </div>

        {/* Bottom: Profile Avatar & Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            title={user?.name || user?.email || "Account"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4876F3] text-xs font-bold text-white shadow hover:ring-2 hover:ring-[#4876F3]/50 transition-all "
          >
            {initials}
          </button>

          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute bottom-2 left-12 z-50 w-56 rounded-xl border border-[var(--border)] bg-[var(--panel)] py-1.5 shadow-overlay">
                <div className="px-3.5 py-2 border-b border-[var(--border)]">
                  <p className="text-xs font-semibold text-white truncate">
                    {user?.name || user?.email || ""}
                  </p>
                  <p className="text-xs text-[var(--text-2)] truncate">
                    {user?.email}
                  </p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-[var(--input)] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Global Quick Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm">
          <div
            className="fixed inset-0"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-overlay z-10">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5 text-xs text-[var(--text-2)]">
                <Search className="w-4 h-4 text-[#4876F3]" />
                <span className="font-semibold text-white">Search</span>
              </div>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-[var(--text-2)] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3">
              <input
                type="text"
                autoFocus
                placeholder="Search projects, folders, videos..."
                className="w-full h-10 px-3 rounded-xl bg-[var(--input)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3]"
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-3)] pt-2 border-t border-[var(--border)]/50">
              <span>Press ESC to close</span>
              <span>⌘K anywhere to open</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
