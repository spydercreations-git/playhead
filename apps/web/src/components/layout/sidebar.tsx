"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderKanban,
  CheckCircle2,
  TableProperties,
  Users2,
  Bell,
  Settings,
  HelpCircle,
  Search,
  HardDrive,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const navigation = [
    { name: "Home", href: "/", icon: Home },
    {
      name: "Projects",
      href: "/projects",
      icon: FolderKanban,
      subItems: [
        { name: "Nike Campaign", href: "/projects/nike" },
        { name: "Idyll UGC Monthly", href: "/projects/ugc" },
      ],
    },
    { name: "Reviews", href: "/reviews", icon: CheckCircle2, badge: "3" },
    {
      name: "Boards",
      href: "/boards",
      icon: TableProperties,
      subItems: [{ name: "My Tasks", href: "/boards/my-tasks" }],
    },
    { name: "Team", href: "/team", icon: Users2 },
  ];

  const bottomNav = [
    { name: "Notifications", href: "/notifications", icon: Bell, badge: "5" },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "Help", href: "/help", icon: HelpCircle },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Top: Company Switcher */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm shadow-sm shadow-primary/30">
              ID
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-semibold text-foreground truncate max-w-[130px]">
                Idyll Productions
              </span>
              <span className="text-xs text-sidebar-muted flex items-center gap-1">
                Trial Plan <Sparkles className="h-3 w-3 text-amber-400" />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="Switch company"
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              title="Close menu"
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Global Search Trigger */}
        <div className="px-3 pt-3">
          <button
            onClick={() => {}}
            className="flex w-full items-center justify-between rounded-lg border border-sidebar-border bg-background/50 px-3 py-2 text-xs text-sidebar-muted hover:border-sidebar-foreground/30 hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              Search...
            </span>
            <kbd className="rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-mono text-sidebar-muted">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Main Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <div key={item.name} className="space-y-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-white font-semibold"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.name}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-sidebar-accent text-sidebar-foreground"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>

                {item.subItems && (
                  <div className="ml-7 space-y-0.5 border-l border-sidebar-border/60 pl-2">
                    {item.subItems.map((sub) => (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className="block rounded-md px-2 py-1 text-xs text-sidebar-muted hover:text-foreground hover:bg-sidebar-accent transition-colors"
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Section */}
        <div className="border-t border-sidebar-border p-3 space-y-3">
          {/* Secondary links */}
          <div className="space-y-0.5">
            {bottomNav.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.name}
                </span>
                {item.badge && (
                  <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Storage Meter */}
          <div className="rounded-lg border border-sidebar-border bg-background/40 p-2.5">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 text-sidebar-muted">
                <HardDrive className="h-3 w-3 text-primary" />
                Storage
              </span>
              <span className="font-mono text-[11px] text-foreground">
                0 B / 25 GB
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-border">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: "2%" }}
              />
            </div>
          </div>

          {/* Profile Card */}
          <div className="flex items-center justify-between rounded-lg border border-sidebar-border/80 bg-sidebar-accent/50 p-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-xs text-foreground border border-border">
                HP
              </div>
              <div className="flex flex-col truncate">
                <span className="truncate text-xs font-medium text-foreground">
                  Harsh
                </span>
                <span className="truncate text-[10px] text-sidebar-muted">
                  harsh@playhead.app
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
