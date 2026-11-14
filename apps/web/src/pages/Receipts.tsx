import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ReceiptText, Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";
import { formatMoney, methodLabel, type ReceiptListRow } from "../lib/receipt";

const STATUS_TONE = { SUCCESS: "teal", PENDING: "amber", FAILED: "rust" } as const;
const STATUS_TEXT = { SUCCESS: "Paid", PENDING: "Pending", FAILED: "Failed" } as const;

export function Receipts() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  const { data, loading, error } = useApiData<{ payments: ReceiptListRow[] }>("/bills/payments");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const all = data?.payments ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.receiptNo, p.orderId, p.payerName, p.flatLabel, p.cycleLabel].some((field) => field.toLowerCase().includes(q))
    );
  }, [data, query]);

  const totalPaid = (data?.payments ?? []).filter((p) => p.status === "SUCCESS").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <PageHeader
        title="Receipts"
        description={isAdmin ? "Every payment collected across the society." : "Your payment receipts. Open one to download or print it."}
      />

      {!loading && data && data.payments.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_minmax(0,1.4fr)]">
          <Card className="p-4">
            <p className="text-xs text-slate">{isAdmin ? "Collected" : "Total paid"}</p>
            <p className="mt-1 font-serif text-2xl text-teal">₹{formatMoney(totalPaid)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate">Receipts</p>
            <p className="mt-1 font-serif text-2xl text-ink">{data.payments.length}</p>
          </Card>
          <label className="relative col-span-2 flex items-center sm:col-span-1">
            <Search size={16} className="pointer-events-none absolute left-3 text-slate" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAdmin ? "Search name, flat, receipt no..." : "Search receipt no. or bill..."}
              className="w-full rounded-xl border border-line bg-white py-3 pl-9 pr-3 text-sm shadow-sm"
              aria-label="Search receipts"
            />
          </label>
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-label="Loading receipts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-line/60" />
          ))}
        </div>
      )}
      {error && !loading && <p className="text-sm text-rust">{error}</p>}
      {!loading && !error && data?.payments.length === 0 && (
        <EmptyState title="No receipts yet" hint="When a bill is paid, its receipt will appear here." />
      )}
      {!loading && data && data.payments.length > 0 && rows.length === 0 && (
        <EmptyState title="Nothing matches that search" hint="Try a receipt number, a name or a flat." />
      )}

      <ul className="space-y-3">
        {rows.map((p) => {
          const date = new Date(p.createdAt);
          return (
            <li key={p.id}>
              <Link
                to={`/receipts/${p.id}`}
                className="group flex items-stretch overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-md"
              >
                {/* date "stub" */}
                <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-dashed border-line bg-surface px-2 py-3 sm:w-20">
                  <span className="font-serif text-2xl leading-none text-ink">{date.toLocaleDateString("en-IN", { day: "2-digit" })}</span>
                  <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate">
                    {date.toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                  <span className="text-[10px] text-slate/80">{date.getFullYear()}</span>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{p.cycleLabel || "Payment"}</p>
                    <p className="truncate text-xs text-slate">
                      {isAdmin ? `${p.payerName}${p.flatLabel ? ` · ${p.flatLabel}` : ""}` : methodLabel(p.provider).title}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate/80">{p.receiptNo}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-serif text-lg text-ink">₹{formatMoney(p.amount)}</p>
                    <div className="mt-1">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_TEXT[p.status]}</Badge>
                    </div>
                  </div>
                  <ChevronRight size={18} className="hidden shrink-0 text-slate transition-transform group-hover:translate-x-0.5 sm:block" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {!loading && data && data.payments.length > 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate">
          <ReceiptText size={14} /> Showing the {data.payments.length >= 300 ? "latest 300" : "full"} history
        </p>
      )}
    </div>
  );
}
