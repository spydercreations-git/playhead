"use client";

import React from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
import { Button } from "./button";
import { AlertCircle } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => any;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} maxWidth="max-w-md">
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div className="flex items-center gap-3">
          {variant === "danger" && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0506E]/15 text-[#F0506E]">
              <AlertCircle className="h-5 w-5" />
            </div>
          )}
          <DialogTitle>{title}</DialogTitle>
        </div>
      </DialogHeader>

      {description && <DialogDescription>{description}</DialogDescription>}

      <DialogFooter>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          size="sm"
          onClick={handleConfirm}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
