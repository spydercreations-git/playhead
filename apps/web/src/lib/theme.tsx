"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * ThemeProvider: Playhead has ONE neutral dark grey theme.
 * This provider handles route-based neutral styling for review and share pages.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Route-based neutral theme: review page, video player, and full screen previews stay plain neutral dark
  useEffect(() => {
    const isNeutralPage =
      pathname.startsWith("/review") ||
      pathname.startsWith("/r/") ||
      pathname.startsWith("/s/");

    if (isNeutralPage) {
      document.documentElement.setAttribute("data-theme-neutral", "true");
    } else {
      document.documentElement.removeAttribute("data-theme-neutral");
    }
  }, [pathname]);

  return <>{children}</>;
}

export function useTheme() {
  return {};
}
