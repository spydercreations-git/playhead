import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
  isLoading?: boolean;
}

/**
 * Playhead Standard Button Component
 * Boards/02 Components:
 * - Height 36 (sm 32, lg 40), radius 8, text 14 SemiBold.
 * - Motion: hover scale 1.015 (150ms), press 0.98 (100ms)
 * - Respects reduced motion
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "secondary", size = "md", isLoading = false, disabled, children, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 px-3 text-xs font-semibold gap-1.5",
      md: "h-9 px-3.5 text-sm font-semibold gap-2", // 36px default
      lg: "h-10 px-4 text-sm font-semibold gap-2", // 40px primary large
      icon: "h-9 w-9 p-0 flex items-center justify-center", // 36px icon button
      "icon-sm": "h-8 w-8 p-0 flex items-center justify-center", // 32px icon button
    }[size];

    const variantClasses = {
      primary: "bg-[#3B67E0] hover:bg-[#3560D6] active:bg-[#3560D6] text-white border border-transparent shadow-none",
      secondary: "bg-[var(--input)] hover:bg-[var(--hover)] active:bg-[var(--hover)] text-white border border-[var(--border)] hover:border-[var(--border-strong)]",
      outline: "bg-transparent hover:bg-[var(--hover)] active:bg-[var(--hover)] text-white border border-[var(--border)] hover:border-[var(--border-strong)]",
      danger: "bg-[#F0506E] hover:bg-[#F0506E] active:bg-[#F0506E] text-white border border-transparent",
      ghost: "bg-transparent hover:bg-[var(--hover)] active:bg-[var(--hover)] text-[var(--text-2)] hover:text-white border border-transparent",
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center rounded-[8px] transition-transform duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#4876F3]/60 focus:ring-offset-0 disabled:opacity-45 disabled:pointer-events-none disabled:hover:scale-100 disabled:active:scale-100 select-none ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{children}</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md";
  active?: boolean;
  ariaLabel: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = "", size = "md", active = false, ariaLabel, children, ...props }, ref) => {
    const sizeClasses = size === "sm" ? "h-8 w-8" : "h-8 w-8"; // Standard 32x32 from 02 Components
    return (
      <button
        ref={ref}
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-center rounded-[8px] select-none transition-all duration-150 motion-reduce:transition-none hover:scale-[1.015] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#4876F3]/60 disabled:opacity-45 disabled:pointer-events-none ${
          active
            ? "bg-[var(--hover)] text-white"
            : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
        } ${sizeClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

