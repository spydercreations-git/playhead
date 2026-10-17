import React from "react";
import { LucideIcon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

/**
 * Playhead Standard Empty State Component
 * Boards/02 Components:
 * - Container: rx 12, fill var(--panel), border var(--border)
 * - Icon: 64x64, rx 16, fill var(--hover), icon in var(--text-2)
 * - Title: 16 SemiBold #FFFFFF
 * - Description: 14 Regular var(--text-2)
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-10 text-center select-none",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] bg-[var(--hover)] text-[var(--text-2)]">
          <Icon size={32} />
        </div>
      )}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm text-[var(--text-2)] max-w-sm">{description}</p>
      {action && (
        <div className="mt-5">
          <Button variant="primary" size="md" onClick={action.onClick}>
            {action.icon}
            <span>{action.label}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

