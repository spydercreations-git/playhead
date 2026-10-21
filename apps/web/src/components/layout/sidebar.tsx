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
  Shield,
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
  const { user, role, isClient, hasPermission, isExecutive, isAdmin } = useAuth();

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

function LibraryNavIcon({ size = 20, filled = false, className = "" }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.75" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.2 : 0} />
      <path d="M10 8.5L16 12L10 15.5V8.5Z" fill="currentColor" />
    </svg>
  );
}

function TasksNavIcon({ size = 20, filled = false, className = "" }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.2 : 0} />
      <path d="M8.5 12.2L10.8 14.5L15.8 9.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuickLinksNavIcon({ size = 20, filled = false, className = "" }: { size?: number; filled?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 17H7A5 5 0 0 1 7 7H9M15 7H17A5 5 0 0 1 17 17H15M8 12H16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

  interface NavItem {
    name: string;
    href: string;
    icon: any;
    show: boolean;
    badge?: number | string;
  }

  // Exact navigation items from L1 Library design
  const navItems: NavItem[] = [
    { name: "Home", href: "/", icon: Home, show: true },
    { name: "Tasks", href: "/tasks", icon: TasksNavIcon, show: true },
    { name: "Library", href: "/library", icon: LibraryNavIcon, show: true },
    { name: "Clients", href: "/clients", icon: Group, show: true },
    { name: "Documents", href: "/documents", icon: Description, show: true },
    { name: "Quick links", href: "/quick-links", icon: QuickLinksNavIcon, show: true },
    { name: "Trash", href: "/trash", icon: Delete, show: true },
  ];

  // Exact bottom navigation items from L1 Library design: Admin, Storage, Settings
  const bottomNavItems = [
    { name: "Admin", href: "/admin", icon: Shield, show: isAdmin },
    { name: "Storage", href: "/storage", icon: Database, show: true },
    { name: "Settings", href: "/settings", icon: Settings, show: true },
  ];

  const displayName = useMemo(() => {
    if (user?.name && user.name.trim()) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user]);

  const displayRole = useMemo(() => {
    if (isClient) return "Client";
    const r = role ? (role.charAt(0).toUpperCase() + role.slice(1)) : "Staff";
    const t = (user as any)?.title || (displayName.toLowerCase().includes("harsh") ? "CEO" : "");
    if (t) return `${r} · ${t}`;
    return r;
  }, [role, isClient, user, displayName]);

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[232px] h-full flex-col border-r border-[var(--border)] bg-[var(--panel)] select-none transition-transform duration-200 ease-in-out md:static md:translate-x-0 shrink-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header: Official Playhead Logo (h-14 / 56px) */}
        <div className="flex h-14 items-center justify-between px-5 border-b border-[var(--border)] shrink-0">
          <Link href="/" className="flex items-center">
            <PlayheadLogoWithText width={139} color="#FFFFFF" />
          </Link>

          <button
            onClick={onClose}
            title="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-3)] hover:bg-[var(--input)] hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action: + New Button (width 200px, centered, height 40px, rx 10) */}
        {!isClient && (
          <div className="relative px-4 pt-6 pb-2.5 shrink-0">
            <button
              onClick={() => setNewMenuOpen(!newMenuOpen)}
              className={`flex h-10 w-[200px] mx-auto items-center justify-center gap-2 rounded-[10px] text-sm font-semibold text-[var(--button-text)] shadow-none transition-all duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] ${
                newMenuOpen ? "bg-[var(--button-hover)]" : "bg-[var(--button)] hover:bg-[var(--button-hover)] active:bg-[var(--button-hover)]"
              }`}
            >
              <Plus size={18} className="text-[var(--button-text)]" />
              <span>New</span>
            </button>

            {/* P04 New Menu (width 200px, rx 10, fill var(--panel-raised), border var(--border)) */}
            {newMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNewMenuOpen(false)}
                />
                <div className="absolute left-4 right-4 top-[70px] z-40 rounded-[10px] border border-[var(--border)] bg-[var(--panel-raised)] py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-[0.98] duration-160 ease-out">
                  <div className="px-3.5 pb-1 text-xs font-medium text-[var(--text-3)]">
                    Create in My Drive
                  </div>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <CreateNewFolder size={18} className="text-[var(--text-2)]" />
                    <span>New folder</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewDoc(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <Description size={18} className="text-[var(--text-2)]" />
                    <span>New document</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      setShowNewSheet(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <TableChart size={18} className="text-[var(--text-2)]" />
                    <span>New spreadsheet</span>
                  </button>

                  <div className="my-1.5 border-t border-[var(--border)]" />

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <UploadFile size={18} className="text-[var(--text-2)]" />
                    <span>Upload files</span>
                  </button>

                  <button
                    onClick={() => {
                      setNewMenuOpen(false);
                      router.push("/my-drive");
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <DriveFolderUpload size={18} className="text-[var(--text-2)]" />
                    <span>Upload folder</span>
                  </button>

                  <div className="my-1.5 border-t border-[var(--border)]" />

                  {hasPermission("projects.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewProject(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                    >
                      <FolderOpen size={18} className="text-[var(--text-2)]" />
                      <span>New project</span>
                    </button>
                  )}

                  {hasPermission("clients.create") && (
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setShowNewClient(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                    >
                      <PersonAdd size={18} className="text-[var(--text-2)]" />
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
                  : item.href === "/library"
                  ? pathname.startsWith("/library") || pathname.startsWith("/projects")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex h-9 w-[216px] mx-auto items-center justify-between rounded-[8px] px-3 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-[var(--hover)] text-white font-semibold"
                      : "text-[var(--text-2)] font-medium hover:bg-[var(--hover)]/60 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      size={20}
                      filled={isActive}
                      className={isActive ? "text-white" : "text-[var(--text-2)]"}
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
        <div className="px-2 pt-2 pb-1 border-t border-[var(--border)] shrink-0 space-y-0.5">
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
                      ? "bg-[var(--hover)] text-white font-semibold"
                      : "text-[var(--text-2)] font-medium hover:bg-[var(--hover)]/60 hover:text-white"
                  }`}
                >
                  <item.icon
                    size={20}
                    filled={isActive}
                    className={isActive ? "text-white" : "text-[var(--text-2)]"}
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
            className="flex h-14 w-[208px] mx-auto items-center justify-between rounded-[10px] px-2.5 cursor-pointer hover:bg-[var(--hover)] transition-colors duration-150"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={displayName} size="md" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-white truncate">
                  {displayName}
                </span>
                <span className="text-xs text-[var(--text-3)] truncate">
                  {displayRole}
                </span>
              </div>
            </div>

            <UnfoldMore size={18} className="text-[var(--text-3)] shrink-0" />
          </div>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProfileMenuOpen(false)}
              />
              <div className="absolute bottom-[72px] left-3 right-3 z-40 rounded-[10px] border border-[var(--border)] bg-[var(--panel-raised)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)] animate-in fade-in-0 zoom-in-[0.98] duration-160 ease-out">
                {process.env.NODE_ENV === "development" && (
                  <div className="mx-2 mb-1 p-2 rounded bg-[var(--input)] border border-[var(--border)] text-xs">
                    <div className="flex items-center justify-between text-[var(--text-2)] font-semibold mb-1">
                      <span>Dev account</span>
                      <span className="text-[#3FCF8E] bg-[#3FCF8E]/10 px-1 py-0.5 rounded font-mono">dev</span>
                    </div>
                    <div className="text-white font-medium truncate">{user?.email || "harsh@idyllproductions.com"}</div>
                    <div className="text-[var(--text-2)] text-xs mt-0.5">Role: <span className="text-[#4876F3] font-medium">{role || (isClient ? "Client" : "None")}</span></div>
                  </div>
                )}
                <Link
                  href="/settings"
                  onClick={() => setProfileMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-white hover:bg-[var(--hover)] transition-colors"
                >
                  <Settings size={18} className="text-[var(--text-2)]" />
                  <span>Settings</span>
                </Link>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-normal text-[#F0506E] hover:bg-[var(--hover)] transition-colors"
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
