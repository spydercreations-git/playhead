"use client";

import React, { useState, useMemo } from "react";
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
import {
  Star,
  Building2,
  Folder,
  Zap,
  FileText,
  Table,
  Upload,
  FolderUp,
  ChevronDown,
  X,
  LogOut,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { NewSpreadsheetDialog } from "@/components/spreadsheets/new-spreadsheet-dialog";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, company, role, roleName, isClient, hasPermission } = useAuth();

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  async function handleLogout() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {}
    // Clear y-indexeddb documents data
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
      icon: Building2,
      show: !isClient && hasPermission("clients.view_all"),
    },
    { name: "Projects", href: "/projects", icon: ProjectIcon, show: true },
    { name: "Documents", href: "/documents", icon: FileText, show: true },
    { name: "Spreadsheets", href: "/spreadsheets", icon: Table, show: true },
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

  // User initials & real name
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

  const displayName = useMemo(() => {
    if (user?.name && user.name.trim()) return user.name;
    if (user?.email) return user.email;
    return "User";
  }, [user]);

  // Storage percentage calculation
  const storageStats = useMemo(() => {
    if (!company) return null;
    const limit = company.storage_limit_bytes || 0;
    const used = company.storage_used_bytes || 0;
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    return {
      usedFormatted: formatBytes(used),
      limitFormatted: formatBytes(limit),
      percent,
    };
  }, [company]);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-[#2E2F34] bg-[#212121] transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header: Official Playhead Logo */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-[#2E2F34]">
          <Link href="/" className="flex items-center">
            <PlayheadLogoWithText width={140} color="#FFFFFF" />
          </Link>

          <button
            onClick={onClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#7C7F87] hover:bg-[#2A2B30] hover:text-white md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action: + New Button (Spec Section 5.1) */}
        {!isClient && (
          <div className="relative px-6 pt-5 pb-2">
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#4876F3] text-xs font-semibold text-white shadow hover:bg-[#3560D6] transition-colors"
            >
              <span>+ New</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  newMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {newMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNewMenuOpen(false)}
                />
                <div className="absolute left-6 right-6 top-[66px] z-40 rounded-[10px] border border-[#2E2F34] bg-[#212121] py-1.5 shadow-overlay space-y-0.5">
                  {hasPermission("clients.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewClient(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                    >
                      <Building2 className="w-4 h-4 text-emerald-400" />
                      <span>Client</span>
                    </button>
                  )}
                  {hasPermission("projects.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewProject(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                    >
                      <Folder className="w-4 h-4 text-[#4876F3]" />
                      <span>Project</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/projects");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                  >
                    <Folder className="w-4 h-4 text-amber-400" />
                    <span>Folder</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/projects");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                  >
                    <Upload className="w-4 h-4 text-cyan-400" />
                    <span>Upload files</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/projects");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                  >
                    <FolderUp className="w-4 h-4 text-teal-400" />
                    <span>Upload folder</span>
                  </button>

                  <div className="my-1 border-t border-[#2E2F34]" />

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewDoc(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Document</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewSheet(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                  >
                    <Table className="w-4 h-4 text-emerald-400" />
                    <span>Spreadsheet</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="px-6 py-2">
          <div className="flex h-10 w-full items-center justify-between rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3.5 text-[#7C7F87] transition-colors focus-within:border-[#4876F3]">
            <div className="flex items-center gap-2.5">
              <SearchIcon size={16} color="#7C7F87" />
              <input
                type="text"
                placeholder="Search (⌘K)"
                className="w-28 bg-transparent text-xs text-white placeholder-[#7C7F87] focus:outline-none"
              />
            </div>
            <kbd className="rounded border border-[#2E2F34] bg-[#212121] px-1.5 py-0.5 text-xs font-mono text-[#7C7F87]">
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
                  className={`flex h-10 items-center justify-between rounded-[10px] px-3 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                      : "text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      size={17}
                      color={isActive ? "#4876F3" : "#A3A6AD"}
                    />
                    <span>{item.name}</span>
                  </div>
                </Link>
              );
            })}

          {/* Admin Team & Settings */}
          {!isClient && (
            <div className="pt-3 pb-1 border-t border-[#2E2F34] mt-3">
              {(hasPermission("team.invite") || hasPermission("team.manage_roles")) && (
                <Link
                  href="/team"
                  className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-xs font-medium transition-colors ${
                    pathname.startsWith("/team")
                      ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                      : "text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white"
                  }`}
                >
                  <TeamIcon size={17} color="#A3A6AD" />
                  <span>Team</span>
                </Link>
              )}

              <Link
                href="/settings"
                className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-xs font-medium transition-colors ${
                  pathname.startsWith("/settings")
                    ? "bg-[#2A2B30] text-white font-semibold border border-[#2E2F34]"
                    : "text-[#A3A6AD] hover:bg-[#2A2B30]/60 hover:text-white"
                }`}
              >
                <SettingsIcon size={17} color="#A3A6AD" />
                <span>Settings</span>
              </Link>
            </div>
          )}
        </div>

        {/* Storage Used for Admins (Spec Section 5.1) */}
        {!isClient && hasPermission("admin.storage") && storageStats && (
          <div className="px-5 py-3 border-t border-[#2E2F34] bg-[#181818]">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-[#A3A6AD] font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Storage</span>
              </span>
              <span className="text-[#7C7F87] font-mono text-xs">
                {storageStats.usedFormatted} of {storageStats.limitFormatted}
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#2A2B30] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#4876F3] rounded-full transition-all duration-300"
                style={{ width: `${storageStats.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* User Profile Card */}
        <div className="relative p-4 border-t border-[#2E2F34]">
          <div
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex h-14 items-center justify-between rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] px-3 cursor-pointer hover:bg-[#2E2F34] transition-colors"
          >
            <div className="flex items-center gap-2.5 truncate">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4876F3] text-xs font-bold text-white ">
                {initials}
              </div>
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-white truncate">
                  {displayName}
                </span>
                <span className="text-xs text-[#7C7F87] truncate">
                  {user?.email || ""}
                </span>
              </div>
            </div>

            {/* Role Badge (hidden for clients) */}
            {!isClient && role && (
              <span className="shrink-0 rounded-[6px] bg-[#4876F3]/15 px-1.5 py-0.5 text-xs font-semibold text-[#4876F3] capitalize border border-[#4876F3]/20">
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
              <div className="absolute bottom-[72px] left-4 right-4 z-40 rounded-[10px] border border-[#2E2F34] bg-[#212121] py-1 shadow-overlay">
                <Link
                  href="/settings"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-white hover:bg-[#2A2B30] transition-colors"
                >
                  <SettingsIcon size={14} color="#A3A6AD" />
                  <span>Settings</span>
                </Link>
                <div className="my-1 border-t border-[#2E2F34]" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-red-400 hover:bg-[#2A2B30] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                  <span>Sign Out</span>
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
      <NewDocumentDialog
        isOpen={showNewDoc}
        onClose={() => setShowNewDoc(false)}
      />
      <NewSpreadsheetDialog
        isOpen={showNewSheet}
        onClose={() => setShowNewSheet(false)}
      />
    </>
  );
}
