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
 * - Container: rx 12, fill #212121, border #2E2F34
 * - Icon: 64x64, rx 16, fill #2C2D33, icon in #A3A6AD
 * - Title: 16 SemiBold #FFFFFF
 * - Description: 14 Regular #A3A6AD
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
        "flex flex-col items-center justify-center rounded-[12px] border border-[#2E2F34] bg-[#212121] p-10 text-center select-none",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#2C2D33] text-[#A3A6AD]">
          <Icon size={32} />
        </div>
      )}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm text-[#A3A6AD] max-w-sm">{description}</p>
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

