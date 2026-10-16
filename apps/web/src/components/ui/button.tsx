import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "secondary", size = "md", isLoading = false, disabled, children, ...props }, ref) => {
    // Exact sizing tokens:
    // md (default): 36px height
    // lg (primary large): 40px height
    // sm: 32px height
    // icon: 36px w/h (or 32px for icon-sm)
    const sizeClasses = {
      sm: "h-8 px-3 text-xs",
      md: "h-9 px-3.5 text-sm", // 36px default
      lg: "h-10 px-4 text-sm font-medium", // 40px primary large
      icon: "h-9 w-9 p-0 flex items-center justify-center", // 36px icon button
      "icon-sm": "h-8 w-8 p-0 flex items-center justify-center", // 32px icon button
    }[size];

    const variantClasses = {
      primary: "bg-[#3B67E0] hover:bg-[#3560D6] text-white font-medium border border-transparent shadow-none active:scale-[0.99]",
      secondary: "bg-[#212121] hover:bg-[#2C2D33] text-white border border-[#2E2F34] font-normal hover:border-[#424344]",
      outline: "bg-transparent hover:bg-[#2C2D33] text-white border border-[#2E2F34] hover:border-[#424344]",
      danger: "bg-[#F0506E] hover:bg-[#F0506E] text-white font-medium border border-transparent",
      ghost: "bg-transparent hover:bg-[#2C2D33] text-[#A3A6AD] hover:text-white border border-transparent",
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center rounded-[10px] transition-colors focus:outline-none focus:ring-1 focus:ring-[#4876F3] disabled:opacity-50 disabled:pointer-events-none select-none ${sizeClasses} ${variantClasses} ${className}`}
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
