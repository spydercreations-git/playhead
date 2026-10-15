"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PlayheadLogoWithText,
  OverviewIcon,
  ProjectIcon,
  ReviewsIcon,
  TeamIcon,
  TrashIcon,
  SettingsIcon,
  SearchIcon,
} from "@/components/icons";
import { useAuth } from "@/lib/use-auth";
import { Star, Building2, Folder, Zap, FileText } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isClient, isAdmin, isManager, canCreateClientOrProject } = useAuth();

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  async function handleLogout() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {}
    // Clear y-indexeddb documents data (User approved Change 7)
    try {
      if (typeof window !== "undefined" && window.indexedDB) {
        if (window.indexedDB.databases) {
          const dbs = await window.indexedDB.databases();
          for (const db of dbs) {
            if (db.name && (db.name.startsWith("playhead-doc-") || db.name.startsWith("y-"))) {
              window.indexedDB.deleteDatabase(db.name);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to clear offline doc databases", e);
    }
    router.push("/login");
  }

  // Navigation items based on role
  const navItems = [
    { name: "Home", href: "/", icon: OverviewIcon, show: true },
    {
      name: "Clients",
      href: "/clients",
      icon: TeamIcon,
      show: !isClient && (isAdmin || isManager),
    },
    { name: "Projects", href: "/projects", icon: ProjectIcon, show: true },
    { name: "Documents", href: "/documents", icon: FileText, show: true },
    { name: "Reviews", href: "/reviews", icon: ReviewsIcon, show: true },
    {
      name: "Shared with me",
      href: "/shared-with-me",
      icon: OverviewIcon,
      show: true,
    },
    { name: "Starred", href: "/starred", icon: Star, show: true },
    { name: "Trash", href: "/trash", icon: TrashIcon, show: true },
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-[#424344] bg-[#212121] transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header: Official Playhead Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-[#424344]/50">
          <Link href="/" className="flex items-center">
            <PlayheadLogoWithText width={140} color="#FFFFFF" />
          </Link>

          <button
            onClick={onClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white md:hidden"
          >
            ✕
          </button>
        </div>

        {/* Action: + New Button (for Admins and Managers) */}
        {canCreateClientOrProject && (
          <div className="relative px-6 pt-5 pb-2">
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#4876F3] text-sm font-semibold text-white shadow hover:bg-[#3b66df] transition-colors"
            >
              <span>+ New</span>
              <span className="text-xs opacity-80">▾</span>
            </button>

            {newMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNewMenuOpen(false)}
                />
                <div className="absolute left-6 right-6 top-[66px] z-40 rounded-lg border border-[#424344] bg-[#212121] py-1.5 shadow-2xl">
                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewClient(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2E2F34]"
                  >
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>New Client</span>
                  </button>
                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewProject(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2E2F34]"
                  >
                    <Folder className="w-4 h-4 text-[#4876F3]" />
                    <span>New Project</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="px-6 py-2">
          <div className="flex h-[42px] w-full items-center justify-between rounded-lg bg-[#2E2F34] px-3.5 text-[#9A9DA0] transition-colors focus-within:ring-1 focus-within:ring-[#4876F3]">
            <div className="flex items-center gap-2.5">
              <SearchIcon size={16} color="#9A9DA0" />
              <input
                type="text"
                placeholder="Search (⌘K)"
                className="w-28 bg-transparent text-xs text-white placeholder-[#9A9DA0] focus:outline-none"
              />
            </div>
            <kbd className="rounded border border-[#424344] bg-[#212121] px-1.5 py-0.5 text-[9px] font-mono text-[#9A9DA0]">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Primary Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex h-[42px] items-center justify-between rounded-lg px-3 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[#2E2F34] text-white font-semibold"
                      : "text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      size={18}
                      color={isActive ? "#4876F3" : "#9A9DA0"}
                    />
                    <span>{item.name}</span>
                  </div>
                </Link>
              );
            })}

          {/* Admin Team Setting */}
          {!isClient && isAdmin && (
            <div className="pt-3 pb-1 border-t border-[#424344]/50 mt-3">
              <Link
                href="/team"
                className={`flex h-[42px] items-center gap-3 rounded-lg px-3 text-xs font-medium transition-colors ${
                  pathname.startsWith("/team")
                    ? "bg-[#2E2F34] text-white font-semibold"
                    : "text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white"
                }`}
              >
                <TeamIcon size={18} color="#9A9DA0" />
                <span>Team</span>
              </Link>
              <Link
                href="/settings/storage"
                className={`flex h-[42px] items-center gap-3 rounded-lg px-3 text-xs font-medium transition-colors ${
                  pathname.startsWith("/settings/storage")
                    ? "bg-[#2E2F34] text-white font-semibold"
                    : "text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white"
                }`}
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Storage</span>
              </Link>
              <Link
                href="/settings"
                className={`flex h-[42px] items-center gap-3 rounded-lg px-3 text-xs font-medium transition-colors ${
                  pathname === "/settings"
                    ? "bg-[#2E2F34] text-white font-semibold"
                    : "text-[#9A9DA0] hover:bg-[#2E2F34]/60 hover:text-white"
                }`}
              >
                <SettingsIcon size={18} color="#9A9DA0" />
                <span>Settings</span>
              </Link>
            </div>
          )}
        </div>

        {/* User Profile Card */}
        <div className="relative p-4 border-t border-[#424344]/50">
          <div
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex h-[60px] items-center justify-between rounded-lg bg-[#2E2F34] px-3 cursor-pointer hover:bg-[#383a42] transition-colors"
          >
            <div className="flex items-center gap-2.5 truncate">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4876F3] text-xs font-bold text-white uppercase">
                {user?.name ? user.name.slice(0, 2) : "PH"}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-white truncate">
                  {user?.name || "Playhead User"}
                </span>
                <span className="text-[10px] text-[#9A9DA0] truncate">
                  {user?.email || ""}
                </span>
              </div>
            </div>

            {/* Role Badge (hidden for clients) */}
            {!isClient && role && (
              <span className="shrink-0 rounded bg-[#4876F3]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#4876F3] capitalize">
                {role}
              </span>
            )}
          </div>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProfileMenuOpen(false)}
              />
              <div className="absolute bottom-[76px] left-4 right-4 z-40 rounded-lg border border-[#424344] bg-[#212121] py-1 shadow-2xl">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-red-400 hover:bg-[#2E2F34]"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Dialogs */}
      <NewClientDialog
        isOpen={showNewClient}
        onClose={() => setShowNewClient(false)}
        onSuccess={() => router.refresh()}
      />
      <NewProjectDialog
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        onClientCreatedPrompt={() => {
          setShowNewProject(false);
          setShowNewClient(true);
        }}
      />
    </>
  );
}
