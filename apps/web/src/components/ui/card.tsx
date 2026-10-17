import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "raised" | "interactive";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-[var(--panel)] border-[var(--border)]",
      raised: "bg-[var(--panel-raised)] border-[var(--border)]",
      interactive: "bg-[var(--panel)] border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--panel-raised)] transition-all cursor-pointer",
    }[variant];

    return (
      <div
        ref={ref}
        className={`rounded-lg border p-5 text-white shadow-none ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-base font-semibold text-white tracking-tight ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[13px] text-[var(--text-2)] mt-1 ${className}`}>
      {children}
    </p>
  );
}
