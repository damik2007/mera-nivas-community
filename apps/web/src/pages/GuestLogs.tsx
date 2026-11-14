import { Car } from "lucide-react";
import { Card, Badge, PageHeader, EmptyState } from "@mycommunity/ui";
import { useApiData } from "../lib/useApiData";

interface LogRow {
  id: string;
  status: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  guest: { name: string; phone: string; flat: { number: string } };
  allotment: { slot: { code: string } } | null;
}

const STATUS_TONE: Record<string, "teal" | "amber" | "rust" | "slate"> = {
  APPROVED: "amber",
  CHECKED_IN: "teal",
  USED: "slate",
  EXPIRED: "slate",
  REVOKED: "rust",
  DENIED: "rust",
};

export function GuestLogs() {
  const { data, loading } = useApiData<{ approvals: LogRow[] }>("/guests/logs");

  return (
    <div>
      <PageHeader title="Guest log" description="Recent visitor approvals and check-ins." />
      {loading && <p className="text-sm text-slate">Loading...</p>}
      {!loading && (!data?.approvals || data.approvals.length === 0) && <EmptyState title="No guest activity yet" />}
      <div className="space-y-2">
        {data?.approvals.map((row) => (
          <Card key={row.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {row.guest.name} <span className="font-normal text-slate">→ Flat {row.guest.flat.number}</span>
              </p>
              <p className="text-xs text-slate">
                In: {row.checkedInAt ? new Date(row.checkedInAt).toLocaleString() : "—"}
                {row.checkedOutAt && <> · Out: {new Date(row.checkedOutAt).toLocaleString()}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {row.allotment && (
                <Badge tone="slate">
                  <Car size={12} className="mr-1 inline" />
                  {row.allotment.slot.code}
                </Badge>
              )}
              <Badge tone={STATUS_TONE[row.status] ?? "slate"}>{row.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
