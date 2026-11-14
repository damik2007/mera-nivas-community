import { useRef, useState } from "react";
import { Pin, Paperclip, Download, Eye, X, CheckCircle2 } from "lucide-react";
import { Card, Badge, Button, PageHeader, EmptyState } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";
import { apiFetch, apiDownload, ApiError } from "../lib/api";
import { AudienceSelector, type AudienceValue } from "../components/AudienceSelector";

interface NoticeRow {
  id: string;
  title: string;
  body: string;
  category: "urgent" | "general" | "maintenance" | "security";
  isPinned: boolean;
  createdAt: string;
  author: { name: string };
  readCount: number;
  hasAttachment?: boolean;
  attachmentLabel?: string | null;
  audienceType?: "ALL" | "STREET" | "ROAD" | "SELECTED";
}

const CATEGORY_TONE: Record<NoticeRow["category"], "rust" | "slate" | "amber" | "teal"> = {
  urgent: "rust",
  general: "slate",
  maintenance: "amber",
  security: "teal",
};

const DOT_COLOR: Record<NoticeRow["category"], string> = {
  urgent: "#B5482E",
  general: "#9AA0A6",
  maintenance: "#E2A33D",
  security: "#2F6F62",
};

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Everyone",
  STREET: "One street",
  ROAD: "One road",
  SELECTED: "Selected residents",
};

export function Notices() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  const { data, loading, reload } = useApiData<{ notices: NoticeRow[] }>("/notices");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<NoticeRow | null>(null);

  return (
    <div>
      <PageHeader
        title="Notice board"
        description="Society announcements, maintenance updates, and security alerts."
        action={isAdmin ? <Button onClick={() => setCreating(true)}>Post notice</Button> : undefined}
      />

      {creating && <CreateNoticeForm onClose={() => setCreating(false)} onCreated={reload} />}
      {open && (
        <NoticeDetailModal
          notice={open}
          isAdmin={isAdmin}
          onClose={() => setOpen(null)}
          onRead={() => {
            reload();
            setOpen(null);
          }}
        />
      )}

      {loading && <p className="text-sm text-slate">Loading notices...</p>}
      {!loading && (!data?.notices || data.notices.length === 0) && <EmptyState title="No notices yet" />}

      <div className="space-y-2.5">
        {data?.notices.map((notice) => (
          <Card key={notice.id} className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 self-start rounded-full"
              style={{ backgroundColor: DOT_COLOR[notice.category] }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {notice.isPinned && <Pin size={13} className="shrink-0 text-amber" />}
                <p className="truncate font-medium text-ink">{notice.title}</p>
              </div>
              <p className="mt-0.5 line-clamp-1 text-sm text-slate">{notice.body}</p>
              <p className="mt-1 text-xs text-slate">
                {notice.author.name} · {new Date(notice.createdAt).toLocaleDateString()}
                {isAdmin && notice.audienceType && notice.audienceType !== "ALL" && <> · {AUDIENCE_LABEL[notice.audienceType]}</>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {notice.hasAttachment && <Paperclip size={14} className="text-slate" />}
              <Button variant="secondary" size="sm" onClick={() => setOpen(notice)}>
                <Eye size={13} /> View
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NoticeDetailModal({
  notice,
  isAdmin,
  onClose,
  onRead,
}: {
  notice: NoticeRow;
  isAdmin: boolean;
  onClose: () => void;
  onRead: () => void;
}) {
  const [marking, setMarking] = useState(false);

  async function markRead() {
    setMarking(true);
    try {
      await apiFetch(`/notices/${notice.id}/read`, { method: "POST" });
      onRead();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {notice.isPinned && <Pin size={14} className="text-amber" />}
            <p className="font-serif text-xl text-ink">{notice.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate hover:bg-surface">
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone={CATEGORY_TONE[notice.category]}>{notice.category}</Badge>
          <span className="text-xs text-slate">
            {notice.author.name} · {new Date(notice.createdAt).toLocaleDateString()}
          </span>
        </div>
        {isAdmin && notice.audienceType && notice.audienceType !== "ALL" && (
          <p className="mb-3 text-xs text-slate">Sent to: {AUDIENCE_LABEL[notice.audienceType]}</p>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{notice.body}</p>

        {notice.hasAttachment && (
          <Button
            variant="secondary"
            className="mt-4 w-full justify-center"
            onClick={() => apiDownload(`/notices/${notice.id}/attachment`, notice.attachmentLabel || "attachment")}
          >
            <Download size={15} /> Download {notice.attachmentLabel || "attachment"}
          </Button>
        )}

        {isAdmin ? (
          <p className="mt-4 text-xs text-slate">{notice.readCount} residents have read this</p>
        ) : (
          <Button className="mt-4 w-full justify-center" onClick={markRead} disabled={marking}>
            <CheckCircle2 size={15} /> {marking ? "Marking..." : "Mark as read"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateNoticeForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NoticeRow["category"]>("general");
  const [isPinned, setIsPinned] = useState(false);
  const [audience, setAudience] = useState<AudienceValue>({ audienceType: "ALL" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!title || !body) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ notice: { id: string } }>("/notices", {
        method: "POST",
        body: { title, body, category, isPinned, ...audience },
      });

      const file = fileInputRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("label", file.name);
        await apiFetch(`/notices/${res.notice.id}/attachment`, { method: "POST", body: fd });
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post notice");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <p className="mb-3 font-serif text-lg">New notice</p>
      <div className="grid gap-3">
        <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Details" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as NoticeRow["category"])}
          >
            <option value="general">General</option>
            <option value="maintenance">Maintenance</option>
            <option value="security">Security</option>
            <option value="urgent">Urgent (notifies recipients immediately)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
            Pin to top
          </label>
        </div>

        <div>
          <p className="mb-1 text-sm text-ink">Send to</p>
          <AudienceSelector value={audience} onChange={setAudience} />
        </div>

        <div>
          <p className="mb-1 text-sm text-ink">Attach a document (optional)</p>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rust">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Posting..." : "Post notice"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
