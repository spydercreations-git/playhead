"use client";

import React from "react";
import { Menu, Plus, UploadCloud } from "lucide-react";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sidebar-foreground hover:bg-card md:hidden"
          title="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-foreground md:text-lg">
            Dashboard
          </h1>
          <span className="hidden rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
            Milestone 1 Foundation
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-sidebar-accent transition-colors shadow-sm">
          <UploadCloud className="h-3.5 w-3.5 text-primary" />
          Upload
        </button>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover transition-colors shadow-sm shadow-primary/20">
          <Plus className="h-3.5 w-3.5" />
          New Project
        </button>
      </div>
    </header>
  );
}
