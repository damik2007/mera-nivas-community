import React from "react";

type Tone = "teal" | "amber" | "rust" | "slate";

const toneClasses: Record<Tone, string> = {
  teal: "bg-teal/10 text-teal border-teal/30",
  amber: "bg-amber/15 text-amber-ink border-amber/40",
  rust: "bg-rust/10 text-rust border-rust/30",
  slate: "bg-slate/10 text-slate border-slate/30",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
