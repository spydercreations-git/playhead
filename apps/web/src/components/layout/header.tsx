"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Search,
  Help,
  ChevronRight,
  Upload,
  Icon,
} from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/lib/use-auth";
import { useUploadStore } from "@/lib/upload-store";

interface HeaderProps {
  onOpenSidebar: () => void;
}

/**
 * Playhead Top Bar Component
 * P03 Home & Foundations:
 * - Height: 56px (h-14)
 * - Background: var(--bg), border-b var(--border)
 * - Left: Page title 14 SemiBold
 * - Right: 320px search input with ⌘K badge, help icon, user avatar
 */
export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { uploads, isOpen, toggleOpen } = useUploadStore();
  const activeCount = useMemo(
    () => uploads.filter((u) => u.status === "uploading" || u.status === "pending").length,
    [uploads]
  );

  const isHome = pathname === "/";

  // Build breadcrumb segments based on pathname
  const pageTitle = useMemo(() => {
    if (pathname === "/") return "Home";

    const segments = pathname.split("/").filter(Boolean);
    const labelMap: Record<string, string> = {
      "my-drive": "My Drive",
      clients: "Clients",
      projects: "Projects",
      documents: "Documents",
      spreadsheets: "Spreadsheets",
      reviews: "Reviews",
      "shared-with-me": "Shared with me",
      starred: "Starred",
      trash: "Trash",
      team: "Team",
      settings: "Settings",
      storage: "Storage",
      notifications: "Notifications",
      sheet: "Spreadsheet",
      d: "Document",
      review: "Review",
    };

    if (segments.length === 1) {
      return labelMap[segments[0].toLowerCase()] || segments[0];
    }

    const first = labelMap[segments[0].toLowerCase()] || segments[0];
    return `${first} / Details`;
  }, [pathname]);

  const displayName = useMemo(() => {
    if (user?.name && user.name.trim()) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user]);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileMenuOpen]);

  return (
    <>
      <header className="flex h-14 w-full items-center justify-between px-6 border-b border-[var(--border)] bg-[var(--bg)] shrink-0 select-none">
        {/* Left side: Hamburger (mobile) + Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white md:hidden shrink-0"
            title="Open menu"
          >
            <Menu size={18} />
          </button>

          <h1 className="text-sm font-semibold text-white truncate">
            {pageTitle}
          </h1>
        </div>

        {/* Right side: 320px Search Input with ⌘K badge, Help icon, Avatar */}
        <div className="flex items-center gap-3.5 shrink-0">
          {/* Search Input matching P03 Top Bar (x=976, w=320, h=36, rx=8, bg=var(--input)) */}
          <div
            onClick={() => router.push("/search")}
            className="hidden sm:flex h-9 w-[320px] items-center justify-between rounded-[8px] bg-[var(--input)] px-3 text-[var(--text-3)] cursor-pointer hover:border-[var(--border-strong)] border border-transparent transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search size={18} className="text-[var(--text-3)] shrink-0" />
              <span className="text-sm text-[var(--text-3)] truncate">
                Search files, projects, clients
              </span>
            </div>

            <kbd className="flex items-center justify-center h-[22px] px-2 rounded-[6px] bg-[var(--panel)] text-xs font-medium text-[var(--text-3)] shrink-0">
              ⌘K
            </kbd>
          </div>

          {/* Uploads Indicator button (P04) */}
          {uploads.length > 0 && (
            <button
              type="button"
              title={activeCount > 0 ? `Uploads (${activeCount} active)` : "Uploads"}
              onClick={toggleOpen}
              className={`relative flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors shrink-0 ${
                isOpen
                  ? "bg-[var(--hover)] text-[#4876F3]"
                  : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
              }`}
            >
              <Upload size={20} />
              {activeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4876F3] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4876F3]"></span>
                </span>
              )}
            </button>
          )}

          {/* Help button (x=1316) */}
          <button
            type="button"
            title="Help & documentation"
            onClick={() => window.open("https://github.com/spydercreations-git/playhead", "_blank")}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors shrink-0"
          >
            <Help size={20} />
          </button>

          {/* User Avatar Menu */}
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              title={displayName}
              aria-label="Profile menu"
              className="flex items-center rounded-full shrink-0 hover:scale-[1.015] active:scale-[0.98] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Avatar name={displayName} size="md" />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--panel)] py-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2 border-b border-[var(--border)]">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{displayName}</p>
                  <p className="text-xs text-[var(--text-3)] truncate mt-0.5">{user?.email}</p>
                </div>
                <div className="p-1">
                  <Link
                    href="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] transition-colors text-left"
                  >
                    <Icon name="settings" size={16} />
                    <span>Settings</span>
                  </Link>
                </div>

                <div className="p-1 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      router.push("/auth/logout");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--danger)] hover:bg-[var(--hover)] transition-colors text-left cursor-pointer"
                  >
                    <Icon name="logout" size={16} className="text-[var(--danger)]" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
