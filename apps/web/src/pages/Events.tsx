import { useMemo, useState } from "react";
import { CalendarDays, Sparkles, Users2, Send } from "lucide-react";
import { Card, Badge, Button, PageHeader, EmptyState } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";
import { apiFetch } from "../lib/api";

interface EventInvitation {
  id: string;
  rsvpStatus: "PENDING" | "YES" | "NO" | "MAYBE";
}
interface InvitationImage {
  id: string;
  imageUrl: string;
  selected: boolean;
}
interface EventRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  venue: string | null;
  startsAt: string;
  bannerUrl: string | null;
  isMine: boolean;
  invitations: EventInvitation[];
  invitationImages: InvitationImage[];
}
interface DirectoryUser {
  id: string;
  name: string;
  role: string;
  flatId: string | null;
}
interface DirectoryBlock {
  id: string;
  name: string;
  flats: { id: string; number: string; users: DirectoryUser[] }[];
}

const CATEGORY_LABEL: Record<string, string> = {
  society_fest: "Society fest",
  maintenance_meeting: "Maintenance meeting",
  festival: "Festival",
  private_function: "Private function",
};

export function Events() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  // Everyone can organize an event — residents included — not just admins.
  const canCreate = isAdmin || user?.role === "RESIDENT";
  const { data, loading, reload } = useApiData<{ events: EventRow[] }>("/events");
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Events"
        description={canCreate ? "Plan an event and invite whoever you'd like." : "Events you've been invited to."}
        action={canCreate ? <Button onClick={() => setCreating(true)}>New event</Button> : undefined}
      />

      {creating && <CreateEventForm onClose={() => setCreating(false)} onCreated={reload} />}

      {loading && <p className="text-sm text-slate">Loading events...</p>}
      {!loading && (!data?.events || data.events.length === 0) && (
        <EmptyState title="No events yet" hint={canCreate ? "Create your first event to get started." : "Check back soon."} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.events.map((event) => (
          <EventCard key={event.id} event={event} isAdmin={isAdmin} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event, isAdmin, onChanged }: { event: EventRow; isAdmin: boolean; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const canManage = isAdmin || event.isMine;
  const myInvite = event.invitations[0];
  const banner = event.bannerUrl ?? event.invitationImages.find((i) => i.selected)?.imageUrl;

  return (
    <Card className="flex flex-col overflow-hidden">
      {banner && <img src={banner} alt="" className="h-40 w-full object-cover" />}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="font-serif text-lg text-ink">{event.title}</p>
            <p className="text-xs text-slate">{CATEGORY_LABEL[event.category] ?? event.category}</p>
          </div>
          {myInvite && <RsvpBadge status={myInvite.rsvpStatus} />}
        </div>
        <p className="flex items-center gap-2 text-sm text-slate">
          <CalendarDays size={15} />
          {new Date(event.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
        {event.venue && <p className="mt-1 text-sm text-slate">{event.venue}</p>}
        {event.description && <p className="mt-2 text-sm text-ink/80">{event.description}</p>}

        {!canManage && myInvite && myInvite.rsvpStatus === "PENDING" && (
          <div className="mt-4 flex gap-2">
            <RsvpButton eventId={event.id} status="YES" onDone={onChanged} label="Going" />
            <RsvpButton eventId={event.id} status="MAYBE" onDone={onChanged} label="Maybe" />
            <RsvpButton eventId={event.id} status="NO" onDone={onChanged} label="Can't go" />
          </div>
        )}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide tools" : event.isMine && !isAdmin ? "Invite people" : "Manage"}
            </Button>
          </div>
        )}

        {canManage && expanded && <EventOrganizerTools event={event} isAdmin={isAdmin} onChanged={onChanged} />}
      </div>
    </Card>
  );
}

function RsvpBadge({ status }: { status: EventInvitation["rsvpStatus"] }) {
  const map: Record<string, { tone: "teal" | "amber" | "rust" | "slate"; label: string }> = {
    YES: { tone: "teal", label: "Going" },
    NO: { tone: "rust", label: "Not going" },
    MAYBE: { tone: "amber", label: "Maybe" },
    PENDING: { tone: "slate", label: "RSVP pending" },
  };
  const { tone, label } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

function RsvpButton({ eventId, status, label, onDone }: { eventId: string; status: string; label: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await apiFetch(`/events/${eventId}/rsvp`, { method: "POST", body: { status } });
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" onClick={send} disabled={busy} className="flex-1">
      {label}
    </Button>
  );
}

/** Pick specific residents to invite — individually, or all at once via "Select all". */
function InvitePicker({ eventId, onInvited }: { eventId: string; onInvited: () => void }) {
  const { data } = useApiData<{ blocks: DirectoryBlock[] }>("/directory");
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");

  const residents = useMemo(() => {
    const rows: { id: string; name: string; flatLabel: string }[] = [];
    for (const block of data?.blocks ?? []) {
      for (const flat of block.flats) {
        for (const u of flat.users) {
          if (u.role !== "RESIDENT" || u.id === user?.id) continue;
          rows.push({ id: u.id, name: u.name, flatLabel: `${block.name} · ${flat.number}` });
        }
      }
    }
    return rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  }, [data, user?.id, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(residents.map((r) => r.id)));
  }

  async function sendInvites() {
    if (selected.size === 0) return;
    setSending(true);
    try {
      await apiFetch(`/events/${eventId}/invite`, {
        method: "POST",
        body: { mode: "SELECTIVE", userIds: Array.from(selected) },
      });
      setSelected(new Set());
      onInvited();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search residents..."
          className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
        <button type="button" onClick={selectAll} className="whitespace-nowrap text-xs text-teal underline">
          Select all ({residents.length})
        </button>
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {residents.length === 0 && <p className="text-xs text-slate">No residents found.</p>}
        {residents.map((r) => (
          <label key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
            <span className="text-ink">{r.name}</span>
            <span className="text-xs text-slate">{r.flatLabel}</span>
          </label>
        ))}
      </div>
      <Button className="mt-2 w-full" onClick={sendInvites} disabled={sending || selected.size === 0}>
        <Send size={15} /> {sending ? "Sending..." : `Invite ${selected.size || ""}`.trim()}
      </Button>
    </div>
  );
}

function EventOrganizerTools({ event, isAdmin, onChanged }: { event: EventRow; isAdmin: boolean; onChanged: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<InvitationImage[]>([]);
  const [theme, setTheme] = useState("Diwali lights and marigolds");
  const [style, setStyle] = useState<"festive" | "formal" | "kids" | "minimal">("festive");

  async function inviteAllBroadcast() {
    setInviting(true);
    try {
      await apiFetch(`/events/${event.id}/invite`, { method: "POST", body: { mode: "BROADCAST" } });
      onChanged();
    } finally {
      setInviting(false);
    }
  }

  async function loadSummary() {
    const res = await apiFetch<{ summary: Record<string, number> }>(`/events/${event.id}/rsvp-summary`);
    setSummary(res.summary);
  }

  async function generateImages() {
    setGenerating(true);
    try {
      const res = await apiFetch<{ candidates: InvitationImage[] }>(`/events/${event.id}/generate-invite-image`, {
        method: "POST",
        body: { theme, style },
      });
      setCandidates(res.candidates);
    } finally {
      setGenerating(false);
    }
  }

  async function selectImage(imageId: string) {
    await apiFetch(`/events/${event.id}/invite-images/${imageId}/select`, { method: "POST" });
    onChanged();
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setPickerOpen((v) => !v)}>
          <Users2 size={15} /> {pickerOpen ? "Hide invite list" : "Invite people"}
        </Button>
        {isAdmin && (
          <Button variant="secondary" onClick={inviteAllBroadcast} disabled={inviting}>
            Invite all residents
          </Button>
        )}
        <Button variant="secondary" onClick={loadSummary}>
          RSVP summary
        </Button>
      </div>

      {pickerOpen && <InvitePicker eventId={event.id} onInvited={onChanged} />}

      {summary && (
        <div className="flex gap-2 text-xs">
          {Object.entries(summary).map(([k, v]) => (
            <Badge key={k} tone="slate">
              {k}: {v}
            </Badge>
          ))}
        </div>
      )}

      {isAdmin && (
        <div>
          <p className="mb-2 flex items-center gap-1 text-sm font-medium text-ink">
            <Sparkles size={15} /> Invitation image
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
              placeholder="Theme, e.g. Diwali lights"
            />
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as typeof style)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            >
              <option value="festive">Festive</option>
              <option value="formal">Formal</option>
              <option value="kids">Kids</option>
              <option value="minimal">Minimal</option>
            </select>
            <Button variant="secondary" onClick={generateImages} disabled={generating}>
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
          {candidates.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {candidates.map((c) => (
                <button key={c.id} onClick={() => selectImage(c.id)} className="border border-line hover:border-teal">
                  <img src={c.imageUrl} alt="Invitation candidate" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("private_function");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title || !startsAt) return;
    setSubmitting(true);
    try {
      await apiFetch("/events", {
        method: "POST",
        body: { title, category, venue: venue || undefined, description: description || undefined, startsAt: new Date(startsAt).toISOString() },
      });
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <p className="mb-3 font-serif text-lg">New event</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <input type="datetime-local" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <textarea
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm sm:col-span-2"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <p className="mt-2 text-xs text-slate">After creating it, use "Invite people" on the event card to choose who gets invited.</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={submitting}>
          Create event
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
