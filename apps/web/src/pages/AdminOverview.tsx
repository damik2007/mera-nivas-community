import { Link } from "react-router-dom";
import { Wallet, Car, Megaphone, CalendarDays } from "lucide-react";
import { Card, Badge, PageHeader } from "@mycommunity/ui";
import { useApiData } from "../lib/useApiData";

interface DashboardStats {
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  overdueCount: number;
}
interface Occupancy {
  total: number;
  free: number;
  occupied: number;
  blocked: number;
}
interface EventRow {
  id: string;
  title: string;
  startsAt: string;
}
interface NoticeRow {
  id: string;
  title: string;
  isPinned: boolean;
}

/** A simple ring chart built from real percentages — no chart library, no fake data. */
function RingStat({ percent, color, label, value }: { percent: number; color: string; label: string; value: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="flex items-center gap-4">
      <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0 -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div>
        <p className="font-serif text-xl text-ink">{value}</p>
        <p className="text-xs text-slate">{label}</p>
      </div>
    </div>
  );
}

export function AdminOverview() {
  const { data: billing } = useApiData<DashboardStats>("/bills/dashboard");
  const { data: occupancy } = useApiData<Occupancy>("/parking/occupancy");
  const { data: eventsData } = useApiData<{ events: EventRow[] }>("/events");
  const { data: noticesData } = useApiData<{ notices: NoticeRow[] }>("/notices");

  const upcoming = eventsData?.events
    .filter((e) => new Date(e.startsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);

  const collectionPercent = billing && billing.totalBilled > 0 ? (billing.totalCollected / billing.totalBilled) * 100 : 0;
  const occupancyPercent = occupancy && occupancy.total > 0 ? (occupancy.occupied / occupancy.total) * 100 : 0;

  return (
    <div>
      <PageHeader title="Society overview" description="A snapshot of billing, parking, and activity." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Wallet size={16} /> Collections
          </p>
          {billing ? (
            <>
              <div className="mt-3">
                <RingStat
                  percent={collectionPercent}
                  color="var(--color-teal)"
                  value={`${collectionPercent.toFixed(0)}%`}
                  label={`${billing.totalCollected.toFixed(0)} of ${billing.totalBilled.toFixed(0)} collected`}
                />
              </div>
              {billing.overdueCount > 0 && (
                <Badge tone="rust">{billing.overdueCount} overdue</Badge>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-slate">Loading...</p>
          )}
          <Link to="/bills" className="mt-3 inline-block text-xs text-teal underline">
            Manage billing
          </Link>
        </Card>

        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Car size={16} /> Parking
          </p>
          {occupancy ? (
            <div className="mt-3">
              <RingStat
                percent={occupancyPercent}
                color="var(--color-amber)"
                value={`${occupancy.occupied} / ${occupancy.total}`}
                label="slots occupied"
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate">Loading...</p>
          )}
          <Link to="/parking" className="mt-3 inline-block text-xs text-teal underline">
            View parking
          </Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <CalendarDays size={16} /> Upcoming events
          </p>
          {upcoming && upcoming.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-ink/80">
              {upcoming.map((e) => (
                <li key={e.id}>{e.title}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate">Nothing scheduled</p>
          )}
          <Link to="/events" className="mt-3 inline-block text-xs text-teal underline">
            Manage events
          </Link>
        </Card>

        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Megaphone size={16} /> Recent notices
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink/80">
            {noticesData?.notices.slice(0, 4).map((n) => (
              <li key={n.id}>{n.title}</li>
            ))}
          </ul>
          <Link to="/notices" className="mt-3 inline-block text-xs text-teal underline">
            Notice board
          </Link>
        </Card>
      </div>
    </div>
  );
}
