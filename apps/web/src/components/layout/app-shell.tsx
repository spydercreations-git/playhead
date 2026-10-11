"use client";

import React, { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
