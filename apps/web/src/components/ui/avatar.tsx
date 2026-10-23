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

export type AvatarSize = 20 | 28 | 32 | 40 | 80 | "xs" | "sm" | "md" | "lg" | "xl" | number;

function resolveSizeInfo(size: AvatarSize, isSquare: boolean, cardTop: boolean = false) {
  let px = 32;
  if (typeof size === "number") {
    px = size;
  } else {
    const map: Record<string, number> = {
      xs: 20,
      sm: 28,
      md: 32,
      lg: 40,
      xl: 80,
    };
    px = map[size] || 32;
  }

  // Corner radius rule:
  // - ClientAvatar (square): Corner radius = size / 4 (16px -> 4px, 28px -> 7px, 40px -> 10px, 64px -> 16px).
  //   On client cards the picture fills top and uses the card's 12px radius.
  // - UserAvatar (person): always a perfect circle (border-radius 50%) at every size.
  const radius = isSquare ? (cardTop ? "12px 12px 0 0" : `${Math.round(px / 4)}px`) : "50%";
  const textSize = px >= 80 ? "text-xl font-bold" : px >= 40 ? "text-base font-semibold" : "text-xs font-semibold";

  return {
    style: {
      width: cardTop ? "100%" : `${px}px`,
      height: `${px}px`,
      borderRadius: radius,
    },
    classes: `${textSize} ${isSquare ? "" : "rounded-full"}`,
    px,
  };
}

export interface ClientAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  id?: string;
  pictureUrl?: string | null;
  size?: AvatarSize;
  color?: string;
  cardTop?: boolean;
  className?: string;
}

/**
 * Shared ClientAvatar (Square, rounded corners)
 * Displays real client uploaded picture, with smooth token placeholder while loading,
 * and graceful fallback to colored initials on 404 or image load error.
 * Corner radius = size / 4.
 */
export function ClientAvatar({
  name = "Client",
  id,
  pictureUrl,
  size = "md",
  color,
  cardTop = false,
  className = "",
  style: propStyle,
  ...props
}: ClientAvatarProps) {
  const { style, classes, px } = resolveSizeInfo(size, true, cardTop);

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
        style={{ ...style, ...propStyle }}
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
      style={{ ...style, ...propStyle, backgroundColor: bgColor }}
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
 * Always a perfect circle (border-radius 50%).
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
  style: propStyle,
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
        style={{ ...style, ...propStyle }}
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
      style={{ ...style, ...propStyle, backgroundColor: bgColor }}
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
