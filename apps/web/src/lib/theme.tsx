"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./use-auth";
import { apiRequest } from "./api";
import { THEMES, ThemeId } from "@/components/settings/theme-preview";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  isAppearanceOpen: boolean;
  openAppearance: () => void;
  closeAppearance: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "blue",
  setTheme: () => {},
  isAppearanceOpen: false,
  openAppearance: () => {},
  closeAppearance: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isClient } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr && THEMES.some((t) => t.id === attr)) {
        return attr as ThemeId;
      }
      const match = document.cookie.match(/(?:^|; )playhead_theme=([^;]*)/);
      if (match && THEMES.some((t) => t.id === match[1])) {
        return match[1] as ThemeId;
      }
    }
    return "blue";
  });

  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  // Synchronize with user's saved theme from auth when loaded
  useEffect(() => {
    if (isClient) {
      // Clients always see Blue
      setThemeState("blue");
      document.documentElement.setAttribute("data-theme", "blue");
      return;
    }
    if (user?.theme && THEMES.some((t) => t.id === user.theme)) {
      const userTheme = user.theme as ThemeId;
      setThemeState(userTheme);
      document.documentElement.setAttribute("data-theme", userTheme);
      document.cookie = `playhead_theme=${userTheme}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [user?.theme, isClient]);

  // Route-based neutral theme: review page, video player, and full screen previews stay plain dark
  useEffect(() => {
    const isNeutralPage =
      pathname.startsWith("/review") ||
      pathname.startsWith("/r/") ||
      pathname.startsWith("/s/");

    if (isNeutralPage) {
      document.documentElement.setAttribute("data-theme-neutral", "true");
      // Share links (/s/*) and review links must always render Blue
      document.documentElement.setAttribute("data-theme", "blue");
    } else {
      document.documentElement.removeAttribute("data-theme-neutral");
      // Restore user theme when navigating back to normal workspace
      const currentTheme = (user?.theme as ThemeId) || "blue";
      document.documentElement.setAttribute("data-theme", currentTheme);
    }
  }, [pathname, user?.theme]);

  const setTheme = useCallback(
    (newTheme: ThemeId) => {
      if (isClient) return; // Clients cannot change from Blue
      setThemeState(newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
      document.cookie = `playhead_theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;

      // Persist to database in background
      apiRequest("/users/theme", {
        method: "PATCH",
        body: JSON.stringify({ theme: newTheme }),
      }).catch((err) => {
        console.error("Failed to save theme preference:", err);
      });
    },
    [isClient]
  );

  const openAppearance = useCallback(() => setIsAppearanceOpen(true), []);
  const closeAppearance = useCallback(() => setIsAppearanceOpen(false), []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        isAppearanceOpen,
        openAppearance,
        closeAppearance,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
