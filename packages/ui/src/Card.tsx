import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: string; // hex or tailwind color for the left bar; omit for a plain panel
}

export function Card({ accent, className = "", children, style, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-line bg-white shadow-sm ${accent ? "border-l-4" : ""} ${className}`}
      style={accent ? { borderLeftColor: accent, ...style } : style}
      {...props}
    >
      {children}
    </div>
  );
}
