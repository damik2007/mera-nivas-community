import { useState } from "react";
import { Car, Ban } from "lucide-react";
import { Card, Button, PageHeader } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";
import { apiFetch } from "../lib/api";
import { useSocietySocket } from "../lib/socket";

interface Slot {
  id: string;
  code: string;
  zone: string | null;
  type: string;
  status: "FREE" | "OCCUPIED" | "BLOCKED";
}

const STATUS_STYLE: Record<Slot["status"], string> = {
  FREE: "border-line bg-white text-ink",
  OCCUPIED: "border-teal bg-teal/10 text-teal",
  BLOCKED: "border-rust bg-rust/10 text-rust",
};

export function Parking() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  const { data, reload } = useApiData<{ slots: Slot[] }>("/parking/slots");
  const [addingSlot, setAddingSlot] = useState(false);

  useSocietySocket(user?.societyId, { "parking:updated": () => reload() });

  async function toggleBlock(slot: Slot) {
    const willBlock = slot.status !== "BLOCKED";
    if (willBlock) {
      const confirmed = window.confirm(
        `Block slot ${slot.code}${slot.zone ? ` (${slot.zone})` : ""}? Residents and guards won't be able to use it until you unblock it.`
      );
      if (!confirmed) return;
    }
    await apiFetch(`/parking/slots/${slot.id}/block`, { method: "POST", body: { blocked: willBlock } });
    reload();
  }

  const grouped = (data?.slots ?? []).reduce<Record<string, Slot[]>>((acc, slot) => {
    const zone = slot.zone ?? "Unzoned";
    acc[zone] = acc[zone] ?? [];
    acc[zone].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Parking"
        description="Live guest parking occupancy."
        action={isAdmin ? <Button onClick={() => setAddingSlot((v) => !v)}>{addingSlot ? "Cancel" : "Add slot"}</Button> : undefined}
      />

      {addingSlot && <AddSlotForm onAdded={() => { setAddingSlot(false); reload(); }} />}

      {Object.entries(grouped).map(([zone, slots]) => (
        <div key={zone} className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate">{zone}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => isAdmin && toggleBlock(slot)}
                className={`flex flex-col items-center justify-center gap-1 border p-3 text-xs font-medium ${STATUS_STYLE[slot.status]}`}
              >
                {slot.status === "BLOCKED" ? <Ban size={16} /> : <Car size={16} />}
                {slot.code}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Card className="mt-4 flex gap-4 p-3 text-xs text-slate">
        <Legend swatch="border-line bg-white" label="Free" />
        <Legend swatch="border-teal bg-teal/10" label="Occupied" />
        <Legend swatch="border-rust bg-rust/10" label="Blocked" />
      </Card>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 border ${swatch}`} />
      {label}
    </span>
  );
}

function AddSlotForm({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [zone, setZone] = useState("");

  async function submit() {
    if (!code) return;
    await apiFetch("/parking/slots", { method: "POST", body: { code, zone: zone || undefined, type: "GUEST" } });
    onAdded();
  }

  return (
    <Card className="mb-4 flex flex-wrap gap-2 p-4">
      <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Slot code, e.g. P11" value={code} onChange={(e) => setCode(e.target.value)} />
      <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Zone (optional)" value={zone} onChange={(e) => setZone(e.target.value)} />
      <Button onClick={submit}>Add</Button>
    </Card>
  );
}
