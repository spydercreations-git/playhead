import React from "react";
import { cn } from "@/lib/utils";

/**
 * Playhead Skeleton Component
 * Boards/02 Components:
 * - Fill: #2A2B30 at 70% opacity, pulse animation
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-[#2A2B30]/70", className)}
      {...props}
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between h-[272px] w-full rounded-[12px] bg-[#212121] border border-[#2E2F34] p-3 animate-pulse select-none",
        className
      )}
    >
      <div className="h-[150px] w-full rounded-[8px] bg-[#2A2B30]/70" />
      <div className="space-y-2 pt-2 px-1">
        <div className="h-3.5 w-3/4 rounded-[6px] bg-[#2A2B30]/70" />
        <div className="h-2.5 w-1/2 rounded-[6px] bg-[#2A2B30]/70" />
      </div>
    </div>
  );
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3.5 py-3 animate-pulse select-none", className)}>
      <div className="h-9 w-9 rounded-[6px] bg-[#2A2B30]/70 shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="h-3 w-48 rounded-[6px] bg-[#2A2B30]/70" />
        <div className="h-2.5 w-28 rounded-[6px] bg-[#2A2B30]/70" />
      </div>
    </div>
  );
}
