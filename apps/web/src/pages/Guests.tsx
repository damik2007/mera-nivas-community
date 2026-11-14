import { useState } from "react";
import { Car, QrCode, Share2, Eye, Download, X, Image as ImageIcon } from "lucide-react";
import { Card, Badge, Button, PageHeader, EmptyState } from "@mycommunity/ui";
import { useApiData } from "../lib/useApiData";
import { apiFetch } from "../lib/api";

interface Slot {
  code: string;
  zone: string | null;
}
interface Approval {
  id: string;
  qrToken: string;
  visitStart: string;
  visitEnd: string;
  status: string;
  allotment: { slot: Slot } | null;
}
interface GuestRow {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  approvals: Approval[];
}
interface QrPayload {
  qrImage: string;
  qrToken: string;
  guestName?: string;
}

const STATUS_TONE: Record<string, "teal" | "amber" | "rust" | "slate"> = {
  APPROVED: "amber",
  CHECKED_IN: "teal",
  USED: "slate",
  EXPIRED: "slate",
  REVOKED: "rust",
  DENIED: "rust",
};
const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Not arrived yet",
  CHECKED_IN: "Checked in",
  USED: "Visit complete",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
  DENIED: "Denied at gate",
};

function shareUrlFor(qrToken: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}guest-pass/${qrToken}`;
}

/** data:image/png;base64,... -> a real File, so it can be shared or downloaded as an image. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

export function Guests() {
  const { data, loading, reload } = useApiData<{ guests: GuestRow[] }>("/guests/mine");
  const [showForm, setShowForm] = useState(false);
  const [activeQr, setActiveQr] = useState<QrPayload | null>(null);

  async function viewQr(approvalId: string, guestName: string) {
    const res = await apiFetch<QrPayload>(`/guests/${approvalId}/qr`);
    setActiveQr({ ...res, guestName });
  }

  return (
    <div>
      <PageHeader
        title="Guests"
        description="Pre-approve visitors and share their entry QR code."
        action={<Button onClick={() => setShowForm(true)}>Pre-approve guest</Button>}
      />

      {showForm && (
        <PreApproveForm
          onClose={() => setShowForm(false)}
          onCreated={(qr) => {
            setActiveQr(qr);
            setShowForm(false);
            reload();
          }}
        />
      )}

      {activeQr && <QrModal qr={activeQr} onClose={() => setActiveQr(null)} />}

      {loading && <p className="text-sm text-slate">Loading guests...</p>}
      {!loading && (!data?.guests || data.guests.length === 0) && <EmptyState title="No guests yet" hint="Pre-approve a guest to generate their entry QR." />}

      <div className="space-y-3">
        {data?.guests.map((guest) => {
          const approval = guest.approvals[0];
          return (
            <Card key={guest.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{guest.name}</p>
                <p className="text-xs text-slate">{guest.phone}</p>
                {approval && (
                  <p className="mt-1 text-xs text-slate">
                    {new Date(approval.visitStart).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {approval?.allotment && (
                  <Badge tone="teal">
                    <Car size={12} className="mr-1 inline" />
                    {approval.allotment.slot.code}
                  </Badge>
                )}
                {approval && <Badge tone={STATUS_TONE[approval.status] ?? "slate"}>{STATUS_LABEL[approval.status] ?? approval.status}</Badge>}
                {approval && (
                  <Button variant="secondary" size="sm" onClick={() => viewQr(approval.id, guest.name)}>
                    <Eye size={13} /> View QR
                  </Button>
                )}
                {(approval?.status === "APPROVED" || approval?.status === "CHECKED_IN") && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => apiFetch(`/guests/${approval.id}/revoke`, { method: "POST" }).then(reload)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function QrModal({ qr, onClose }: { qr: QrPayload; onClose: () => void }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const url = shareUrlFor(qr.qrToken);
  const filename = `${(qr.guestName || "guest-pass").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2000);
  }

  // Shares the actual QR picture (not just a link) through the device's native
  // share sheet — WhatsApp, SMS, etc. all show it as a real image attachment.
  async function shareImage() {
    const file = dataUrlToFile(qr.qrImage, filename);
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Guest entry pass", text: "Here's your entry QR code" });
        return;
      } catch {
        return; // user cancelled the share sheet — not an error
      }
    }
    // Device can't share image files directly — fall back to sharing the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Guest entry pass", text: "Here's your entry QR code", url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    flash("Link copied!");
  }

  function downloadImage() {
    const link = document.createElement("a");
    link.href = qr.qrImage;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    flash("Link copied!");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <p className="font-serif text-lg text-ink">{qr.guestName || "Entry pass"}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate hover:bg-surface">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate">Share this with your guest, or have them show it at the gate.</p>

        <div className="flex justify-center rounded-xl border border-line bg-surface p-4">
          <img src={qr.qrImage} alt="Guest entry QR code" className="h-48 w-48 rounded-lg bg-white p-2" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={shareImage} className="justify-center">
            <Share2 size={15} /> Share QR
          </Button>
          <Button variant="secondary" onClick={downloadImage} className="justify-center">
            <Download size={15} /> Download
          </Button>
        </div>
        <button onClick={copyLink} className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-teal underline">
          <ImageIcon size={12} /> Or copy the pass link instead
        </button>
        {feedback && <p className="mt-2 text-center text-xs text-teal">{feedback}</p>}

        <p className="mt-4 text-center text-xs text-slate">This pass can be reopened any time — nothing expires until the visit window does.</p>
        <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function PreApproveForm({ onClose, onCreated }: { onClose: () => void; onCreated: (qr: QrPayload) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [visitStart, setVisitStart] = useState("");
  const [visitEnd, setVisitEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name || !phone || !visitStart || !visitEnd) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ qrImage: string; approval: { qrToken: string } }>("/guests/pre-approve", {
        method: "POST",
        body: {
          name,
          phone,
          vehicleNumber: vehicleNumber || undefined,
          visitStart: new Date(visitStart).toISOString(),
          visitEnd: new Date(visitEnd).toISOString(),
        },
      });
      onCreated({ qrImage: res.qrImage, qrToken: res.approval.qrToken, guestName: name });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <p className="mb-3 flex items-center gap-2 font-serif text-lg">
        <QrCode size={18} /> Pre-approve a guest
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Guest name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          placeholder="Vehicle number (optional)"
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)}
        />
        <div />
        <label className="text-xs text-slate">
          Visit start
          <input type="datetime-local" className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" value={visitStart} onChange={(e) => setVisitStart(e.target.value)} />
        </label>
        <label className="text-xs text-slate">
          Visit end
          <input type="datetime-local" className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" value={visitEnd} onChange={(e) => setVisitEnd(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Generating..." : "Generate QR"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
