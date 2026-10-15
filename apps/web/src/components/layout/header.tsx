"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Bell,
  UploadCloud,
  ChevronRight,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/use-auth";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isHome = pathname === "/";

  // Build breadcrumb segments based on pathname
  const breadcrumbs = useMemo(() => {
    if (pathname === "/") return [{ label: "Home", href: "/" }];

    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href?: string }[] = [];

    const labelMap: Record<string, string> = {
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
      sheet: "Spreadsheets",
      doc: "Documents",
      review: "Review",
    };

    let accumulatedPath = "";
    segments.forEach((seg, idx) => {
      accumulatedPath += `/${seg}`;
      const isLast = idx === segments.length - 1;
      const mapped = labelMap[seg.toLowerCase()];

      if (mapped) {
        crumbs.push({
          label: mapped,
          href: isLast ? undefined : accumulatedPath,
        });
      } else {
        // ID or sub-resource
        crumbs.push({
          label: isLast ? "Details" : seg,
          href: isLast ? undefined : accumulatedPath,
        });
      }
    });

    return crumbs.length > 0 ? crumbs : [{ label: "Overview", href: "/" }];
  }, [pathname]);

  const initials = useMemo(() => {
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return user.name.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "PH";
  }, [user]);

  const firstName = useMemo(() => {
    if (user?.name) {
      return user.name.trim().split(" ")[0];
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "there";
  }, [user]);

  return (
    <header className="flex h-16 w-full items-center justify-between px-6 md:px-8 border-b border-[#2E2F34] bg-[#181818] shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2E2F34] bg-[#212121] text-[#9A9DA0] hover:text-white md:hidden shrink-0"
          title="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {isHome ? (
          <div>
            <span className="text-[11px] font-medium text-[#7C7F87] block leading-none mb-1">
              Welcome back, {firstName}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
              Home
            </h1>
          </div>
        ) : (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-[#7C7F87] shrink-0" />
                  )}
                  {isLast ? (
                    <span className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                      {crumb.label}
                    </span>
                  ) : crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-[#9A9DA0] hover:text-white transition-colors truncate max-w-[140px]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-[#9A9DA0] truncate max-w-[140px]">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Quick Search */}
        <div className="hidden sm:flex h-9 items-center gap-2 rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] px-3 text-xs text-[#7C7F87] focus-within:border-[#4876F3] transition-colors">
          <Search className="w-3.5 h-3.5 text-[#7C7F87]" />
          <input
            type="text"
            placeholder="Search projects, cuts..."
            className="w-36 md:w-48 bg-transparent text-white placeholder-[#7C7F87] focus:outline-none text-xs"
          />
        </div>

        {/* Upload Progress Icon */}
        <button
          type="button"
          title="Upload progress (idle)"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2E2F34] bg-[#212121] text-[#9A9DA0] hover:text-white hover:border-[#424344] transition-colors relative"
        >
          <UploadCloud className="w-4 h-4" />
        </button>

        {/* Notification Bell */}
        <button
          type="button"
          title="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2E2F34] bg-[#212121] text-[#9A9DA0] hover:text-white hover:border-[#424344] transition-colors relative"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* Profile Picture */}
        <Link
          href="/settings"
          title={user?.name || "Settings"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4876F3] text-xs font-bold text-white shadow-sm hover:ring-2 hover:ring-[#4876F3]/50 transition-all uppercase shrink-0"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
