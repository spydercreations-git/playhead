"use client";

import React, { useState, useEffect } from "react";

export const AVATAR_COLORS = [
  "#C2410C", "#7C3AED", "#0F766E", "#B45309", "#4876F3",
  "#FA457B", "#3FCF8E", "#FFBB56", "#9787FF", "#2A9D8F",
];

export function getAvatarColor(name: string): string {
  if (!name) return AVATAR_COLORS[4];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 1).toUpperCase();
}

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

function resolveSizeInfo(size: AvatarSize, isSquare: boolean) {
  if (typeof size === "number") {
    const rx = isSquare ? (size >= 40 ? "rounded-[10px]" : size >= 28 ? "rounded-[8px]" : "rounded-[6px]") : "rounded-full";
    const textSize = size >= 40 ? "text-base" : size >= 30 ? "text-sm" : "text-xs";
    return {
      style: { width: `${size}px`, height: `${size}px` },
      classes: `${rx} ${textSize}`,
      px: size,
    };
  }

  const map: Record<string, { w: number; rxSquare: string; text: string }> = {
    xs: { w: 20, rxSquare: "rounded-[5px]", text: "text-xs" },
    sm: { w: 24, rxSquare: "rounded-[6px]", text: "text-xs" },
    md: { w: 32, rxSquare: "rounded-[8px]", text: "text-sm" },
    lg: { w: 40, rxSquare: "rounded-[10px]", text: "text-sm" },
    xl: { w: 48, rxSquare: "rounded-[12px]", text: "text-base" },
  };

  const item = map[size] || map.md;
  return {
    style: { width: `${item.w}px`, height: `${item.w}px` },
    classes: `${isSquare ? item.rxSquare : "rounded-full"} ${item.text}`,
    px: item.w,
  };
}

export interface ClientAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  id?: string;
  pictureUrl?: string | null;
  size?: AvatarSize;
  color?: string;
  className?: string;
}

/**
 * Shared ClientAvatar (Square, rounded corners)
 * Displays real client uploaded picture, with smooth token placeholder while loading,
 * and graceful fallback to colored initials on 404 or image load error.
 */
export function ClientAvatar({
  name = "Client",
  id,
  pictureUrl,
  size = "md",
  color,
  className = "",
  ...props
}: ClientAvatarProps) {
  const { style, classes, px } = resolveSizeInfo(size, true);

  // Compute best image URL: use provided pictureUrl or construct from id
  let rawUrl = pictureUrl;
  if (!rawUrl && id) {
    rawUrl = `/api/v1/clients/${id}/picture/128.webp`;
  } else if (rawUrl && rawUrl.includes("/512.webp") && px <= 128) {
    rawUrl = rawUrl.replace("/512.webp", "/128.webp");
  }

  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [rawUrl]);

  const bgColor = color || getAvatarColor(name);
  const initials = getInitials(name);

  if (rawUrl && !hasError) {
    return (
      <div
        style={style}
        className={`relative shrink-0 overflow-hidden select-none bg-[var(--panel-raised)] ${classes} ${className}`}
        title={name}
        {...props}
      >
        <img
          src={rawUrl}
          alt={name}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`h-full w-full object-cover transition-opacity duration-150 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
        {!isLoaded && (
          <div
            style={{ backgroundColor: bgColor }}
            className="absolute inset-0 flex items-center justify-center font-semibold text-white text-xs opacity-70"
          >
            {initials}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ ...style, backgroundColor: bgColor }}
      className={`shrink-0 flex items-center justify-center font-semibold text-white select-none ${classes} ${className}`}
      title={name}
      {...props}
    >
      {initials}
    </div>
  );
}

export interface UserAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  email?: string;
  id?: string;
  avatarUrl?: string | null;
  src?: string | null;
  size?: AvatarSize;
  color?: string;
  ring?: boolean;
  className?: string;
}

/**
 * Shared UserAvatar (Circle)
 * Displays real user profile photo, with smooth placeholder while loading,
 * and graceful fallback to colored initials on 404 or image load error.
 */
export function UserAvatar({
  name = "User",
  email,
  id,
  avatarUrl,
  src,
  size = "md",
  color,
  ring = false,
  className = "",
  ...props
}: UserAvatarProps) {
  const { style, classes, px } = resolveSizeInfo(size, false);

  let rawUrl = avatarUrl || src;
  if (!rawUrl && id) {
    rawUrl = `/api/v1/users/avatar/${id}/128.webp`;
  } else if (rawUrl && rawUrl.includes("/512.webp") && px <= 128) {
    rawUrl = rawUrl.replace("/512.webp", "/128.webp");
  }

  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [rawUrl]);

  const displayName = name || (email ? email.split("@")[0] : "User");
  const bgColor = color || getAvatarColor(displayName);
  const initials = getInitials(displayName);
  const ringClass = ring ? "ring-2 ring-[var(--bg)]" : "";

  if (rawUrl && !hasError) {
    return (
      <div
        style={style}
        className={`relative shrink-0 overflow-hidden select-none bg-[var(--panel-raised)] ${classes} ${ringClass} ${className}`}
        title={displayName}
        {...props}
      >
        <img
          src={rawUrl}
          alt={displayName}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`h-full w-full object-cover transition-opacity duration-150 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
        {!isLoaded && (
          <div
            style={{ backgroundColor: bgColor }}
            className="absolute inset-0 flex items-center justify-center font-semibold text-white text-xs opacity-70"
          >
            {initials}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ ...style, backgroundColor: bgColor }}
      className={`shrink-0 flex items-center justify-center font-semibold text-white select-none ${classes} ${ringClass} ${className}`}
      title={displayName}
      {...props}
    >
      {initials}
    </div>
  );
}

// Backward-compatibility alias for Avatar -> UserAvatar
export const Avatar = UserAvatar;
export type AvatarProps = UserAvatarProps;

export interface AvatarGroupProps {
  users: Array<{ id?: string; name: string; avatar_url?: string | null; color?: string }>;
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * Avatar Stack Component: Overlapping avatars with +N overflow bubble
 */
export function AvatarStack({
  users,
  max = 4,
  size = "sm",
  className = "",
}: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  const overflowSizeClass = {
    xs: "h-5 w-5 text-xs",
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-xs",
  }[size];

  return (
    <div className={`flex items-center -space-x-1.5 select-none ${className}`}>
      {visible.map((u, i) => (
        <UserAvatar
          key={u.id || `${u.name}-${i}`}
          id={u.id}
          name={u.name}
          avatarUrl={u.avatar_url}
          color={u.color}
          size={size}
          ring
        />
      ))}
      {overflow > 0 && (
        <div
          className={`rounded-full shrink-0 flex items-center justify-center font-semibold bg-[var(--hover)] text-[var(--text-2)] ring-2 ring-[var(--bg)] ${overflowSizeClass}`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
