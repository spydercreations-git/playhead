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
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8 bg-[#181818]">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
