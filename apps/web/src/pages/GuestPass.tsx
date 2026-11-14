import { useParams } from "react-router-dom";
import { Badge } from "@mycommunity/ui";
import { useApiData } from "../lib/useApiData";

interface PassData {
  guestName: string;
  hostFlat: string | null;
  visitStart: string;
  visitEnd: string;
  status: string;
  singleUse: boolean;
  qrImage: string;
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
  APPROVED: "Ready to use",
  CHECKED_IN: "Checked in",
  USED: "Visit complete",
  EXPIRED: "Expired",
  REVOKED: "Revoked by resident",
  DENIED: "Denied at the gate",
};

// This page needs no login — it's the link a resident shares with a guest who
// has no account of their own, and it needs to work the same way weeks later
// if either of them opens it again.
export function GuestPass() {
  const { token } = useParams<{ token: string }>();
  const { data, loading, error } = useApiData<PassData>(token ? `/guests/pass/${token}` : null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="Mera Nivas" className="mb-3 h-14 w-14" />
          <p className="font-serif text-2xl text-ink">Mera Nivas</p>
          <p className="mt-1 text-sm text-slate">Entry pass</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 text-center shadow-sm">
          {loading && <p className="text-sm text-slate">Loading pass...</p>}
          {!loading && (error || !data) && (
            <p className="text-sm text-rust">This pass link is invalid or has expired.</p>
          )}
          {data && (
            <>
              <p className="font-serif text-xl text-ink">{data.guestName}</p>
              {data.hostFlat && <p className="text-sm text-slate">Visiting {data.hostFlat}</p>}
              <p className="mt-1 text-xs text-slate">
                {new Date(data.visitStart).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} –{" "}
                {new Date(data.visitEnd).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <div className="mt-3">
                <Badge tone={STATUS_TONE[data.status] ?? "slate"}>{STATUS_LABEL[data.status] ?? data.status}</Badge>
              </div>
              <img src={data.qrImage} alt="Entry QR code" className="mx-auto mt-4 h-56 w-56" />
              <p className="mt-3 text-xs text-slate">Show this screen to security at the gate.</p>
              {data.singleUse && <p className="mt-1 text-xs text-amber-ink">This code works once only.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
