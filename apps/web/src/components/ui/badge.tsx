import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "success" | "warning" | "danger" | "chip";
  size?: "default" | "tiny";
}

export function Badge({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  // 12px minimum for badges, 11px only for tiny chips per type scale
  const sizeClasses = size === "tiny" || variant === "chip"
    ? "text-xs px-2 py-0.5 rounded-[6px] font-medium"
    : "text-xs px-2.5 py-1 rounded-[8px] font-medium";

  const variantClasses = {
    default: "bg-[#26272C] text-[#A3A6AD] border border-[#2E2F34]",
    accent: "bg-[#4876F3]/15 text-[#4876F3] border border-[#4876F3]/30",
    success: "bg-[#3FCF8E]/15 text-[#3FCF8E] border border-[#3FCF8E]/30",
    warning: "bg-[#FFBB56]/15 text-[#FFBB56] border border-[#FFBB56]/30",
    danger: "bg-[#F0506E]/15 text-[#F0506E] border border-[#F0506E]/30",
    chip: "bg-[#26272C] text-white border border-[#2E2F34]",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 leading-none transition-colors ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
