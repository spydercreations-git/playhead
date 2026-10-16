"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2 } from "@/components/ui/icon";

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name?: string;
  itemCount?: number;
  isPermanent?: boolean; // For trash "Delete forever"
  isLoading?: boolean;
}

export function DeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  name,
  itemCount = 1,
  isPermanent = false,
  isLoading = false,
}: DeleteDialogProps) {
  if (!isOpen) return null;

  const title =
    itemCount > 1
      ? `Delete ${itemCount} items?`
      : name
      ? `Delete ${name}?`
      : "Delete item?";

  const subtitle = isPermanent
    ? "This cannot be undone."
    : "Deleted items can be recovered for 30 days before being permanently deleted.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Dialog Body */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm rounded-xl border border-[#2E2F34] bg-[#212121] p-6 shadow-overlay flex flex-col items-center text-center select-none"
      >
        {/* Round Warning Icon */}
        <div
          className={`h-12 w-12 rounded-full flex items-center justify-center mb-4 ${
            isPermanent
              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
          }`}
        >
          {isPermanent ? (
            <Trash2 className="w-5 h-5 text-rose-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-white px-2 leading-snug">
          {title}
        </h3>

        {/* Subtitle */}
        <p className="mt-2 text-xs text-[#A3A6AD] leading-relaxed max-w-xs">
          {subtitle}
        </p>

        {/* Actions (Equal Width Cancel and Red Delete) */}
        <div className="mt-6 flex w-full gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-9 rounded-xl border border-[#2E2F34] bg-[#2A2B30] text-xs font-semibold text-[#A3A6AD] hover:bg-[#2E2F34] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors shadow flex items-center justify-center"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
