"use client";

import React, { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface RenameProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onRename: (newName: string) => Promise<void>;
}

export function RenameProjectDialog({
  isOpen,
  onClose,
  projectName,
  onRename,
}: RenameProjectDialogProps) {
  const [name, setName] = useState(projectName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(projectName);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, projectName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === projectName) {
      onClose();
      return;
    }
    try {
      setIsSubmitting(true);
      await onRename(trimmed);
      onClose();
    } catch {
      // error handled in caller
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-xl overflow-hidden p-6 text-white animate-in fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Rename project</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-3)] hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
              Project name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-sm text-white focus:outline-none focus:border-[#4876F3] transition-colors"
              placeholder="Enter project name"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-2)] hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="h-9 px-4 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-[var(--button-text)] shadow transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
