import { Link } from "react-router-dom";
import { CalendarDays, Megaphone, Wallet } from "lucide-react";
import { Card, Badge, PageHeader, EmptyState } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";

interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  invitations: { rsvpStatus: string }[];
}
interface NoticeRow {
  id: string;
  title: string;
  category: string;
  isPinned: boolean;
}
interface BillRow {
  id: string;
  cycleLabel: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
}

export function ResidentHome() {
  const { user } = useAuth();
  const { data: eventsData } = useApiData<{ events: EventRow[] }>("/events");
  const { data: noticesData } = useApiData<{ notices: NoticeRow[] }>("/notices");
  const { data: billsData } = useApiData<{ bills: BillRow[] }>("/bills/mine");

  const pendingRsvp = eventsData?.events.filter((e) => e.invitations[0]?.rsvpStatus === "PENDING") ?? [];
  const pinnedNotices = noticesData?.notices.filter((n) => n.isPinned).slice(0, 3) ?? [];
  const nextBill = billsData?.bills.find((b) => b.status !== "PAID");

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.name.split(" ")[0]}`} description={user?.flat ? `${user.flat.block.name} · Flat ${user.flat.number}` : undefined} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <CalendarDays size={16} /> RSVPs pending
          </p>
          {pendingRsvp.length === 0 ? (
            <p className="mt-2 text-xs text-slate">You're all caught up</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {pendingRsvp.slice(0, 3).map((e) => (
                <li key={e.id} className="text-ink/80">
                  {e.title}
                </li>
              ))}
            </ul>
          )}
          <Link to="/events" className="mt-3 inline-block text-xs text-teal underline">
            View events
          </Link>
        </Card>

        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Megaphone size={16} /> Pinned notices
          </p>
          {pinnedNotices.length === 0 ? (
            <p className="mt-2 text-xs text-slate">Nothing pinned right now</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {pinnedNotices.map((n) => (
                <li key={n.id} className="text-ink/80">
                  {n.title}
                </li>
              ))}
            </ul>
          )}
          <Link to="/notices" className="mt-3 inline-block text-xs text-teal underline">
            View notice board
          </Link>
        </Card>

        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Wallet size={16} /> Next bill
          </p>
          {nextBill ? (
            <div className="mt-2 text-sm">
              <p className="text-ink/80">{nextBill.cycleLabel}</p>
              <p className="text-slate">
                {(nextBill.totalAmount - nextBill.amountPaid).toFixed(2)} due {new Date(nextBill.dueDate).toLocaleDateString()}
              </p>
              <Badge tone="amber">{nextBill.status}</Badge>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate">No dues pending</p>
          )}
          <Link to="/bills" className="mt-3 inline-block text-xs text-teal underline">
            View bills
          </Link>
        </Card>
      </div>

      {!eventsData && !noticesData && !billsData && <EmptyState title="Loading your dashboard..." />}
    </div>
  );
}
