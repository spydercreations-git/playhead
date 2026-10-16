"use client";

import React, { useEffect } from "react";
import { X } from "@/components/ui/icon";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

export function Dialog({
  open,
  onOpenChange,
  children,
  className = "",
  maxWidth = "max-w-lg",
}: DialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal Card: 24px padding, 16px radius (rounded-xl), shadow token 0 8px 24px rgba(0,0,0,0.35) */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full ${maxWidth} rounded-xl border border-[#2E2F34] bg-[#212121] p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)] text-white animate-in fade-in-0 zoom-in-[0.98] duration-160 ease-out motion-reduce:animate-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  children,
  className = "",
  onClose,
}: {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  return (
    <div className={`flex items-start justify-between pb-4 border-b border-[#2E2F34] mb-5 ${className}`}>
      <div className="space-y-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-[8px] p-1.5 text-[#A3A6AD] hover:bg-[#2C2D33] hover:text-white transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`text-xl font-semibold text-white tracking-tight ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[13px] text-[#A3A6AD] ${className}`}>
      {children}
    </p>
  );
}

export function DialogFooter({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-end gap-3 pt-4 border-t border-[#2E2F34] mt-6 ${className}`}>
      {children}
    </div>
  );
}
