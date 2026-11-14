import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-white border border-ink shadow-sm hover:bg-ink/90 active:bg-ink/80",
  secondary: "bg-white text-ink border border-line shadow-sm hover:border-ink/40 active:bg-surface",
  ghost: "bg-transparent text-slate hover:bg-surface hover:text-ink",
  danger: "bg-white text-rust border border-rust/30 hover:bg-rust/5 active:bg-rust/10",
};

// Two non-overlapping padding/size scales — never mixed with a conflicting
// px-*/py-*/text-* utility passed in via className. Tailwind's own class
// precedence depends on stylesheet generation order, not on where a class
// sits in the className string, so quietly appending "px-3 py-1.5 text-xs"
// to override the default "px-4 py-2 text-sm" is not guaranteed to win —
// a dedicated size prop sidesteps that entirely.
const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
