"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ProjectIconRail } from "./project-icon-rail";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";

function AppSkeleton() {
  return (
    <div
      className="flex min-h-screen bg-[#181818] select-none pointer-events-none"
      aria-busy="true"
      aria-label="Loading Playhead"
    >
      {/* Sidebar Skeleton */}
      <aside className="hidden md:flex w-[280px] flex-col border-r border-[#2E2F34] bg-[#212121] shrink-0">
        <div className="flex h-16 items-center px-6 border-b border-[#2E2F34]">
          <div className="h-6 w-28 rounded-[6px] bg-[#2A2B30] animate-pulse" />
        </div>
        <div className="px-6 pt-5 pb-2">
          <div className="h-10 w-full rounded-[10px] bg-[#2A2B30] animate-pulse" />
        </div>
        <div className="px-6 py-2">
          <div className="h-10 w-full rounded-[10px] bg-[#2A2B30] animate-pulse" />
        </div>
        <div className="flex-1 px-4 py-2 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 w-full rounded-[10px] bg-[#2A2B30]/60 animate-pulse" />
          ))}
        </div>
        <div className="p-4 border-t border-[#2E2F34]">
          <div className="flex h-14 items-center gap-3 rounded-[10px] bg-[#2A2B30] px-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-[#2C2D33]" />
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-3 w-20 rounded bg-[#2C2D33]" />
              <div className="h-2.5 w-32 rounded bg-[#2C2D33]" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area Skeleton */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex h-16 w-full items-center justify-between px-6 md:px-8 border-b border-[#2E2F34] bg-[#181818] shrink-0">
          <div className="h-4 w-32 rounded bg-[#2A2B30] animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-40 rounded-[10px] bg-[#2A2B30] animate-pulse hidden sm:block" />
            <div className="h-9 w-9 rounded-full bg-[#2A2B30] animate-pulse" />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8 bg-[#181818]">
          <div className="w-full max-w-[1920px] mx-auto space-y-6">
            <div className="h-8 w-44 rounded-[8px] bg-[#2A2B30] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-36 rounded-[10px] bg-[#212121] border border-[#2E2F34] p-4 animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-[10px] bg-[#212121] border border-[#2E2F34] p-4 animate-pulse" />
          </div>
        </main>
      </div>
    </div>
  );
}

function ProtectedAppShell({
  sidebarOpen,
  setSidebarOpen,
  children,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, error } = useAuth();

  useEffect(() => {
    if (!isLoading && (!user || error)) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const currentUrl = (pathname || "/") + search;
      const target = `/login?redirect=${encodeURIComponent(currentUrl)}`;
      router.replace(target);
    }
  }, [isLoading, user, error, pathname, router]);

  // While session is being verified or redirect is underway, show skeleton — never empty app data
  if (isLoading || !user || error) {
    return <AppSkeleton />;
  }

  const isProjectWorkspace = pathname?.startsWith("/projects/") && pathname !== "/projects";

  if (isProjectWorkspace) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-[#181818]">
        <ProjectIconRail />
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#181818]">
          {children}
        </main>
      </div>
    );
  }

  const isFullscreenEditor =
    (pathname?.startsWith("/sheet/") && pathname !== "/sheet") ||
    (pathname?.startsWith("/d/") && pathname !== "/d");

  if (isFullscreenEditor) {
    return <main className="h-screen w-screen overflow-hidden bg-[#181818]">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-[#181818]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 bg-[#181818]">
          <div className="w-full max-w-[1920px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isPublicRoute =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup") ||
    pathname?.startsWith("/verify-email") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname?.startsWith("/invite") ||
    pathname?.startsWith("/s/") ||
    pathname?.startsWith("/test-sheet-benchmark");

  if (isPublicRoute) {
    return <main className="min-h-screen bg-[#181818]">{children}</main>;
  }

  return (
    <ProtectedAppShell sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
      {children}
    </ProtectedAppShell>
  );
}
