import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "raised" | "interactive";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-[#212121] border-[#2E2F34]",
      raised: "bg-[#26272C] border-[#2E2F34]",
      interactive: "bg-[#212121] border-[#2E2F34] hover:border-[#424344] hover:bg-[#26272C] transition-all cursor-pointer",
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
    <p className={`text-[13px] text-[#A3A6AD] mt-1 ${className}`}>
      {children}
    </p>
  );
}
