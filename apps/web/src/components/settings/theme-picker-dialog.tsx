"use client";

import React, { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { ThemePicker } from "./theme-preview";
import { useTheme } from "@/lib/theme";

interface ThemePickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemePickerDialog({ isOpen, onClose }: ThemePickerDialogProps) {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appearance-dialog-title"
        className="relative w-full max-w-[620px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 id="appearance-dialog-title" className="text-xl font-bold text-[var(--text)]">
              Appearance
            </h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Pick a colour for your Playhead. Only you see it. Clients always see Blue.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* 6 Theme Cards Grid (3x2) */}
        <div className="px-6 py-2">
          <ThemePicker value={theme} onChange={setTheme} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4 mt-4 bg-[var(--panel)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-3)]">
            <Icon name="info" size={16} className="text-[var(--text-3)] shrink-0" />
            <span>The review page always stays plain dark so video colours look right.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-lg bg-[var(--button)] text-[var(--button-text)] hover:bg-[var(--button-hover)] text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
