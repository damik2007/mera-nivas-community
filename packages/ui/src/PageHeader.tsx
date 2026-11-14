import React from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
      <div>
        <h1 className="font-serif text-2xl text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-slate">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
