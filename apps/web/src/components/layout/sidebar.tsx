"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { useAuth, clearAuthCache } from "@/lib/use-auth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Home,
  HardDrive,
  CorporateFare,
  FolderOpen,
  Description,
  TableChart,
  RateReview,
  FolderShared,
  Star,
  Delete,
  Group,
  Settings,
  Database,
  Plus,
  CreateNewFolder,
  UploadFile,
  DriveFolderUpload,
  PersonAdd,
  UnfoldMore,
  X,
  LogOut,
} from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/api";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { NewSpreadsheetDialog } from "@/components/spreadsheets/new-spreadsheet-dialog";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role, isClient, hasPermission, isExecutive } = useAuth();

  const { data: reviewsData } = useQuery({
    queryKey: ["reviews-count"],
    queryFn: () => apiRequest<{ items: any[] }>("/reviews").catch(() => ({ items: [] })),
    staleTime: 30_000,
    enabled: !!user,
  });
  const reviewCount = reviewsData?.items?.length || 0;

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
    clearAuthCache(queryClient);
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

  // Exact navigation items from P03/P04
  const navItems = [
    { name: "Home", href: "/", icon: Home, show: true },
    { name: "My Drive", href: "/my-drive", icon: HardDrive, show: isExecutive },
    {
      name: "Clients",
      href: "/clients",
      icon: CorporateFare,
      show: !isClient && hasPermission("clients.view_all"),
    },
    { name: "Projects", href: "/projects", icon: FolderOpen, show: true },
    { name: "Documents", href: "/documents", icon: Description, show: true },
    { name: "Spreadsheets", href: "/spreadsheets", icon: TableChart, show: true },
    {
      name: "Reviews",
      href: "/reviews",
      icon: RateReview,
      badge: reviewCount > 0 ? reviewCount : undefined,
      show: true,
    },
    { name: "Shared with me", href: "/shared-with-me", icon: FolderShared, show: true },
    { name: "Starred", href: "/starred", icon: Star, show: true },
    { name: "Trash", href: "/trash", icon: Delete, show: true },
  ];

  const bottomNavItems = [
    { name: "Team", href: "/team", icon: Group, show: !isClient },
    { name: "Settings", href: "/settings", icon: Settings, show: true },
    { name: "Storage", href: "/storage", icon: Database, show: !isClient },
  ];

  const displayName = useMemo(() => {
    if (user?.name && user.name.trim()) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user]);

  const displayRole = useMemo(() => {
    if (isClient) return "Client";
    if (role) {
      return role.charAt(0).toUpperCase() + role.slice(1);
    }
    return "Member";
  }, [role, isClient]);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      {/* Sidebar: exactly 232px width from Foundations & P pages */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[232px] h-full flex-col border-r border-[#2E2F34] bg-[#212121] select-none transition-transform duration-200 ease-in-out md:static md:translate-x-0 shrink-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header: Official Playhead Logo (h-14 / 56px) */}
        <div className="flex h-14 items-center justify-between px-5 border-b border-[#2E2F34] shrink-0">
          <Link href="/" className="flex items-center">
            <PlayheadLogoWithText width={139} color="#FFFFFF" />
          </Link>

          <button
            onClick={onClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#7C7F87] hover:bg-[#2A2B30] hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action: + New Button (width 200px, centered, height 40px, rx 10) */}
        {!isClient && (
          <div className="relative px-4 pt-4 pb-2 shrink-0">
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className={`flex h-10 w-[200px] mx-auto items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-white shadow-none transition-all duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] ${
                newMenuOpen ? "bg-[#3560D6]" : "bg-[#3B67E0] hover:bg-[#3560D6] active:bg-[#3560D6]"
              }`}
            >
              <Plus size={18} />
              <span>New</span>
            </button>

            {/* P04 New Menu (width 200px, rx 10, fill #26272C, border #2E2F34) */}
            {newMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNewMenuOpen(false)}
                />
                <div className="absolute left-4 right-4 top-[62px] z-40 rounded-[10px] border border-[#2E2F34] bg-[#26272C] py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-[0.98] duration-160 ease-out">
                  <div className="px-3.5 pb-1 text-xs font-medium text-[#7C7F87]">
                    Create in My Drive
                  </div>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                  >
                    <CreateNewFolder size={18} className="text-[#A3A6AD]" />
                    <span>New folder</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewDoc(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                  >
                    <Description size={18} className="text-[#A3A6AD]" />
                    <span>New document</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewSheet(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                  >
                    <TableChart size={18} className="text-[#A3A6AD]" />
                    <span>New spreadsheet</span>
                  </button>

                  <div className="my-1.5 border-t border-[#2E2F34]" />

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                  >
                    <UploadFile size={18} className="text-[#A3A6AD]" />
                    <span>Upload files</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                  >
                    <DriveFolderUpload size={18} className="text-[#A3A6AD]" />
                    <span>Upload folder</span>
                  </button>

                  <div className="my-1.5 border-t border-[#2E2F34]" />

                  {hasPermission("projects.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewProject(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                    >
                      <FolderOpen size={18} className="text-[#A3A6AD]" />
                      <span>New project</span>
                    </button>
                  )}

                  {hasPermission("clients.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewClient(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                    >
                      <PersonAdd size={18} className="text-[#A3A6AD]" />
                      <span>New client</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Primary Navigation List (216px items, 36px height, rx 8) */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
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
                  className={`flex h-9 w-[216px] mx-auto items-center justify-between rounded-[8px] px-3 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-[#2C2D33] text-white font-semibold"
                      : "text-[#A3A6AD] font-medium hover:bg-[#2C2D33]/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      size={20}
                      filled={isActive}
                      className={isActive ? "text-white" : "text-[#A3A6AD]"}
                    />
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span className="flex items-center justify-center h-5 px-1.5 rounded-full bg-[#FA457B] text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
        </div>

        {/* Bottom Navigation: Team, Settings, Storage */}
        <div className="px-2 pt-2 pb-1 border-t border-[#2E2F34] shrink-0 space-y-0.5">
          {bottomNavItems
            .filter((item) => item.show)
            .map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex h-9 w-[216px] mx-auto items-center gap-3 rounded-[8px] px-3 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-[#2C2D33] text-white font-semibold"
                      : "text-[#A3A6AD] font-medium hover:bg-[#2C2D33]/60 hover:text-white"
                  }`}
                >
                  <item.icon
                    size={20}
                    filled={isActive}
                    className={isActive ? "text-white" : "text-[#A3A6AD]"}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
        </div>

        {/* Account Box: width 208px, height 56px, rx 10 */}
        <div className="relative p-3 shrink-0">
          <div
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex h-14 w-[208px] mx-auto items-center justify-between rounded-[10px] px-2.5 cursor-pointer hover:bg-[#2C2D33] transition-colors duration-150"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={displayName} size="md" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-white truncate">
                  {displayName}
                </span>
                <span className="text-xs text-[#7C7F87] truncate">
                  {displayRole}
                </span>
              </div>
            </div>

            <UnfoldMore size={18} className="text-[#7C7F87] shrink-0" />
          </div>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProfileMenuOpen(false)}
              />
              <div className="absolute bottom-[72px] left-3 right-3 z-40 rounded-[10px] border border-[#2E2F34] bg-[#26272C] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-[0.98] duration-160 ease-out">
                {process.env.NODE_ENV === "development" && (
                  <div className="mx-2 mb-1 p-2 rounded bg-[#2A2B30] border border-[#2E2F34] text-xs">
                    <div className="flex items-center justify-between text-[#A3A6AD] font-semibold mb-1">
                      <span>Dev account</span>
                      <span className="text-[#3FCF8E] bg-[#3FCF8E]/10 px-1 py-0.5 rounded font-mono">dev</span>
                    </div>
                    <div className="text-white font-medium truncate">{user?.email || "harsh@idyllproductions.com"}</div>
                    <div className="text-[#A3A6AD] text-xs mt-0.5">Role: <span className="text-[#4876F3] font-medium">{role || (isClient ? "Client" : "None")}</span></div>
                  </div>
                )}
                <Link
                  href="/settings"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[#2C2D33] transition-colors"
                >
                  <Settings size={18} className="text-[#A3A6AD]" />
                  <span>Settings</span>
                </Link>
                <div className="my-1 border-t border-[#2E2F34]" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-[#F0506E] hover:bg-[#2C2D33] transition-colors"
                >
                  <LogOut size={18} className="text-[#F0506E]" />
                  <span>Sign out</span>
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
