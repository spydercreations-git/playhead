"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PlayheadLogo,
  OverviewIcon,
  ProjectIcon,
  ReviewsIcon,
  BoardIcon,
  TeamIcon,
  TrashIcon,
  SettingsIcon,
  HelpIcon,
  SearchIcon,
  MoreOptionsIcon,
} from "@/components/icons";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const primaryNav = [
    { name: "Overview", href: "/", icon: OverviewIcon },
    { name: "Projects", href: "/projects", icon: ProjectIcon },
    { name: "Reviews", href: "/reviews", icon: ReviewsIcon, badge: "3" },
    { name: "Boards", href: "/boards", icon: BoardIcon },
    { name: "Team", href: "/team", icon: TeamIcon },
    { name: "Trash", href: "/trash", icon: TrashIcon },
  ];

  const secondaryNav = [
    { name: "Settings", href: "/settings", icon: SettingsIcon },
    { name: "Support", href: "/help", icon: HelpIcon },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[304px] flex-col border-r border-[#424344] bg-[#212121] transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header: Logo + Company */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-[#424344]/50">
          <div className="flex items-center gap-3.5">
            <PlayheadLogo size={32} color="#FFFFFF" />
            <div className="flex flex-col">
              <span className="text-base font-bold text-white tracking-tight">
                Playhead
              </span>
              <span className="text-[11px] text-[#9A9DA0] font-medium">
                Idyll Productions
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white md:hidden"
          >
            ✕
          </button>
        </div>

        {/* Search Bar matching Figma (x=24, y=118, w=256, h=53, rx=8, fill=#2E2F34) */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex h-[50px] w-full items-center justify-between rounded-lg bg-[#2E2F34] px-4 text-[#9A9DA0] transition-colors focus-within:ring-1 focus-within:ring-[#4876F3]">
            <div className="flex items-center gap-3">
              <SearchIcon size={18} color="#9A9DA0" />
              <input
                type="text"
                placeholder="Search..."
                className="w-28 bg-transparent text-sm text-white placeholder-[#9A9DA0] focus:outline-none"
              />
            </div>
            <kbd className="rounded border border-[#424344] bg-[#212121] px-1.5 py-0.5 text-[10px] font-mono text-[#9A9DA0]">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Primary Navigation List */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1">
          {primaryNav.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex h-[48px] items-center justify-between rounded-lg px-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#2E2F34] text-white font-semibold"
                    : "text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <item.icon
                    size={20}
                    color={isActive ? "#4876F3" : "#9A9DA0"}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="flex h-[22px] min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-bold text-white bg-[#FF5A5A]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="pt-4 pb-2">
            <div className="h-[1px] w-full bg-[#424344]/50" />
          </div>

          {/* Secondary Navigation */}
          {secondaryNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex h-[44px] items-center gap-3.5 rounded-lg px-4 text-sm font-medium text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white transition-colors"
            >
              <item.icon size={20} color="#9A9DA0" />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>

        {/* User Profile Card at bottom (x=24, y=902, w=256, h=88, rx=8, fill=#2E2F34) */}
        <div className="p-6 pt-2">
          <div className="flex h-[80px] items-center justify-between rounded-lg bg-[#2E2F34] px-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4876F3] text-sm font-bold text-white">
                HP
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#212121] bg-[#4876F3]" />
              </div>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold text-white truncate">
                  Harsh
                </span>
                <span className="text-xs text-[#9A9DA0] truncate">
                  harsh@playhead.app
                </span>
              </div>
            </div>
            <button
              title="Profile menu"
              className="flex h-7 w-7 items-center justify-center rounded text-[#9A9DA0] hover:text-white"
            >
              <MoreOptionsIcon size={18} color="#9A9DA0" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
