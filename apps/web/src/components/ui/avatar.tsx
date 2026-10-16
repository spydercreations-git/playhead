import React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  color?: string;
}

const AVATAR_COLORS = [
  "#C2410C", "#7C3AED", "#0F766E", "#B45309", "#4876F3",
  "#FA457B", "#3FCF8E", "#FFBB56", "#9787FF", "#2A9D8F",
];

export function getAvatarColor(name: string): string {
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

/**
 * Playhead Avatar Component
 * Boards/02 Components:
 * - xs: 20x20, text 10 SemiBold
 * - sm: 24x24, text 11 SemiBold
 * - md: 32x32, text 14 SemiBold
 * - lg: 40x40, text 16 SemiBold
 */
export function Avatar({
  name = "User",
  src,
  size = "md",
  color,
  className = "",
  ...props
}: AvatarProps) {
  const sizeClasses = {
    xs: "h-5 w-5 text-xs",
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  }[size];

  const bgColor = color || getAvatarColor(name);
  const initials = getInitials(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover shrink-0 ring-2 ring-[#181818] ${sizeClasses} ${className}`}
      />
    );
  }

  return (
    <div
      style={{ backgroundColor: bgColor }}
      className={`rounded-full shrink-0 flex items-center justify-center font-semibold text-white select-none ring-2 ring-[#181818] ${sizeClasses} ${className}`}
      title={name}
      {...props}
    >
      {initials}
    </div>
  );
}

export interface AvatarGroupProps {
  users: Array<{ id?: string; name: string; avatar_url?: string | null; color?: string }>;
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * Avatar Stack Component
 * Boards/02 Components: Overlapping avatars with +N overflow bubble
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
        <Avatar
          key={u.id || `${u.name}-${i}`}
          name={u.name}
          src={u.avatar_url}
          color={u.color}
          size={size}
        />
      ))}
      {overflow > 0 && (
        <div
          className={`rounded-full shrink-0 flex items-center justify-center font-semibold bg-[#2C2D33] text-[#A3A6AD] ring-2 ring-[#181818] ${overflowSizeClass}`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

