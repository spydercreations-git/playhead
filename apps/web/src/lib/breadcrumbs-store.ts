"use client";

import { create } from "zustand";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsStore {
  breadcrumbs: BreadcrumbItem[] | null;
  setBreadcrumbs: (crumbs: BreadcrumbItem[] | null) => void;
}

export const useBreadcrumbsStore = create<BreadcrumbsStore>((set) => ({
  breadcrumbs: null,
  setBreadcrumbs: (crumbs) => set({ breadcrumbs: crumbs }),
}));
