import React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  color?: string;
}

const AVATAR_COLORS = [
  "#4876F3", "#9787FF", "#FA457B", "#3FCF8E", "#FFBB56",
  "#64B5F6", "#4DB6AC", "#81C784", "#BA68C8", "#FF8A65",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({
  name = "User",
  src,
  size = "md",
  color,
  className = "",
  ...props
}: AvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-xs",
    lg: "h-9 w-9 text-xs",
    xl: "h-10 w-10 text-sm",
  }[size];

  const bgColor = color || getAvatarColor(name);
  const initials = getInitials(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-full object-cover shrink-0 border border-[#2E2F34] ${sizeClasses} ${className}`}
      />
    );
  }

  return (
    <div
      style={{ backgroundColor: bgColor }}
      className={`rounded-full shrink-0 flex items-center justify-center font-semibold text-white select-none ${sizeClasses} ${className}`}
      title={name}
      {...props}
    >
      {initials}
    </div>
  );
}
