export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate">{hint}</p>}
    </div>
  );
}
