import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * Playhead Standard Input Component
 * Boards/02 Components:
 * - Height 40, radius 8, focus ring accent at 25%
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={`flex h-10 w-full rounded-[8px] border bg-[var(--input)] px-3.5 py-2 text-sm text-white placeholder:text-[var(--text-3)] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4876F3]/25 focus:border-[#4876F3] disabled:cursor-not-allowed disabled:opacity-50 ${
          error
            ? "border-[#F0506E] focus:ring-[#F0506E]/25 focus:border-[#F0506E]"
            : "border-[var(--border)] hover:border-[var(--border-strong)]"
        } ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

