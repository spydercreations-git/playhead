import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={`flex h-10 w-full rounded-[10px] border bg-[#2A2B30] px-3.5 py-2 text-sm text-white placeholder:text-[#7C7F87] transition-colors focus:outline-none focus:ring-1 focus:ring-[#4876F3] focus:border-[#4876F3] disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? "border-[#F0506E] focus:ring-[#F0506E]" : "border-[#2E2F34] hover:border-[#424344]"
        } ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
