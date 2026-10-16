"use client";

import React, { useState, useEffect } from "react";
import { useToastStore, ToastItem } from "@/lib/toast";
import { CheckCircle2, AlertCircle, Info, X, RotateCcw } from "@/components/ui/icon";

function SingleToast({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((state) => state.dismissToast);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const duration = toast.duration ?? 5000;
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, isHovered, dismiss]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-[10px] border border-[#2E2F34] bg-[#212121] p-3.5 shadow-overlay backdrop-blur-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        {toast.type === "success" && (
          <CheckCircle2 className="w-4 h-4 text-[#3FCF8E] shrink-0 mt-0.5" />
        )}
        {toast.type === "error" && (
          <AlertCircle className="w-4 h-4 text-[#F0506E] shrink-0 mt-0.5" />
        )}
        {toast.type === "info" && (
          <Info className="w-4 h-4 text-[#4876F3] shrink-0 mt-0.5" />
        )}

        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-white break-words">
            {toast.message}
          </span>
          {toast.reason && (
            <span className="text-xs text-[#A3A6AD] mt-0.5">
              {toast.reason}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {toast.undo && (
          <button
            onClick={async () => {
              try {
                await toast.undo?.();
              } finally {
                dismiss(toast.id);
              }
            }}
            className="flex items-center gap-1.5 rounded-[6px] bg-[#4876F3]/20 border border-[#4876F3]/30 px-2.5 py-1 text-xs font-semibold text-[#4876F3] hover:bg-[#4876F3]/30 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{toast.undoLabel || "Undo"}</span>
          </button>
        )}

        {toast.retry && (
          <button
            onClick={async () => {
              try {
                await toast.retry?.();
              } finally {
                dismiss(toast.id);
              }
            }}
            className="rounded-[6px] bg-[#2A2B30] border border-[#2E2F34] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#2C2D33] transition-colors"
          >
            Try again
          </button>
        )}

        <button
          onClick={() => dismiss(toast.id)}
          className="rounded p-1 text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed z-50 pointer-events-none flex flex-col gap-2.5 bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
    >
      {toasts.map((t) => (
        <SingleToast key={t.id} toast={t} />
      ))}
    </div>
  );
}
