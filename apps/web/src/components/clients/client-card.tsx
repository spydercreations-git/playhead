"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export interface ClientCardProps {
  id?: string;
  name: string;
  pictureUrl?: string | null;
  peopleCount: number;
  updatedAtText?: string;
  website?: string | null;
  interactive?: boolean;
  onBellClick?: (e: React.MouseEvent) => void;
  onMenuClick?: (e: React.MouseEvent) => void;
  isMuted?: boolean;
  className?: string;
}

function getClientInitials(name: string): string {
  if (!name.trim()) return "CP";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function getClientGradient(name: string): string {
  const gradients = [
    "from-[#1d3557]/80 via-[#14213d]/90 to-[#0b0f19]",
    "from-[#2a1b4e]/80 via-[#1c1236]/90 to-[#0b0f19]",
    "from-[#133c3e]/80 via-[#0e2728]/90 to-[#0b0f19]",
    "from-[#3d2c1d]/80 via-[#261b12]/90 to-[#0b0f19]",
    "from-[#3b1d28]/80 via-[#241219]/90 to-[#0b0f19]",
    "from-[#1d2d44]/80 via-[#0d1b2a]/90 to-[#0b0f19]",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function ClientCard({
  id,
  name,
  pictureUrl,
  peopleCount,
  updatedAtText = "Updated just now",
  interactive = true,
  onBellClick,
  onMenuClick,
  isMuted = false,
  className = "",
}: ClientCardProps) {
  const displayName = name.trim() || "Company name";

  const [imgError, setImgError] = useState(false);
  const effectivePictureUrl = !imgError && (pictureUrl || (id ? `/api/v1/clients/${id}/picture/512.webp` : null));

  const cardContent = (
    <div
      className={`relative w-full overflow-hidden rounded-[18px] border border-[var(--border)] bg-[#0f1118] select-none flex flex-col shadow-sm transition-all ${
        interactive ? "hover:border-[var(--text-3)] hover:shadow-md cursor-pointer" : ""
      } ${className}`}
    >
      {/* Top Media Area */}
      <div className="relative aspect-[4/3.2] w-full overflow-hidden bg-[var(--panel)] flex items-center justify-center">
        {effectivePictureUrl ? (
          <img
            src={effectivePictureUrl}
            alt={displayName}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-b ${getClientGradient(
              displayName
            )} flex items-center justify-center relative overflow-hidden`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.08),transparent_65%)]" />
            <div className="h-16 w-16 rounded-2xl bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center text-xl font-bold text-white shadow-inner z-10">
              {getClientInitials(displayName)}
            </div>
          </div>
        )}

        {/* Dark Fade at the bottom of the picture */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d12] via-[#0c0d12]/35 to-transparent pointer-events-none" />

        {/* Bell Icon at Top Right */}
        <div className="absolute top-3.5 right-3.5 z-20">
          {interactive ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onBellClick) onBellClick(e);
              }}
              className={`h-8 w-8 rounded-full bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center transition-colors ${
                isMuted
                  ? "text-amber-400 hover:text-amber-300"
                  : "text-[var(--text-2)] hover:text-white"
              }`}
              title={isMuted ? "Unmute notifications" : "Mute notifications"}
            >
              <Icon name="notifications" size={16} />
            </button>
          ) : (
            <div className="h-8 w-8 rounded-full bg-[var(--panel)] border border-[var(--border)] flex items-center justify-center text-[var(--text-2)] pointer-events-none">
              <Icon name="notifications" size={16} />
            </div>
          )}
        </div>

        {/* Company Name on the picture at bottom */}
        <div className="absolute bottom-3 left-4 right-4 z-20">
          <h3 className="text-[20px] font-bold text-white tracking-tight truncate leading-tight drop-shadow-md">
            {displayName}
          </h3>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="h-[64px] px-4 py-3 bg-[var(--panel)] border-t border-[var(--border)] flex items-center justify-between">
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] text-[var(--text-3)] truncate leading-tight">
            {updatedAtText}
          </span>
          <span className="text-[13px] text-[var(--text-2)] font-medium truncate mt-1 leading-tight">
            {peopleCount} {peopleCount === 1 ? "person" : "people"}
          </span>
        </div>

        <div className="shrink-0">
          {interactive ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMenuClick) onMenuClick(e);
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              title="More options"
            >
              <Icon name="more_horiz" size={20} />
            </button>
          ) : (
            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-2)] pointer-events-none">
              <Icon name="more_horiz" size={20} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (interactive && id) {
    return (
      <Link href={`/clients/${id}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
