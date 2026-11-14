import { useMemo, useState } from "react";
import { useApiData } from "../lib/useApiData";

export type AudienceType = "ALL" | "STREET" | "ROAD" | "SELECTED";

export interface AudienceValue {
  audienceType: AudienceType;
  blockId?: string;
  roadNo?: string;
  userIds?: string[];
}

interface StreetRow {
  id: string;
  name: string;
}
interface HouseRow {
  id: string;
  number: string;
  roadNo: string | null;
  blockId: string;
}
interface DirectoryUser {
  id: string;
  name: string;
  role: string;
}
interface DirectoryBlock {
  id: string;
  name: string;
  flats: { id: string; number: string; users: DirectoryUser[] }[];
}

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-ink";

/** Who this applies to: everyone, one street, one road number, or a hand-picked list. */
export function AudienceSelector({ value, onChange }: { value: AudienceValue; onChange: (v: AudienceValue) => void }) {
  const houses = useApiData<{ houses: HouseRow[]; streets: StreetRow[] }>("/admin/houses");
  const directory = useApiData<{ blocks: DirectoryBlock[] }>("/directory");
  const [query, setQuery] = useState("");

  const roadNumbers = useMemo(() => {
    const set = new Set((houses.data?.houses ?? []).map((h) => h.roadNo).filter((r): r is string => !!r));
    return Array.from(set).sort();
  }, [houses.data]);

  const residents = useMemo(() => {
    const rows: { id: string; name: string; flatLabel: string }[] = [];
    for (const block of directory.data?.blocks ?? []) {
      for (const flat of block.flats) {
        for (const u of flat.users) {
          if (u.role !== "RESIDENT") continue;
          rows.push({ id: u.id, name: u.name, flatLabel: `${block.name} · ${flat.number}` });
        }
      }
    }
    return rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  }, [directory.data, query]);

  const selected = new Set(value.userIds ?? []);
  function toggleUser(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, userIds: Array.from(next) });
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex flex-wrap gap-3 text-sm">
        {(["ALL", "STREET", "ROAD", "SELECTED"] as AudienceType[]).map((t) => (
          <label key={t} className="flex items-center gap-1.5">
            <input type="radio" name="audienceType" checked={value.audienceType === t} onChange={() => onChange({ audienceType: t })} />
            {t === "ALL" && "Everyone"}
            {t === "STREET" && "One street"}
            {t === "ROAD" && "One road no."}
            {t === "SELECTED" && "Selected residents"}
          </label>
        ))}
      </div>

      {value.audienceType === "STREET" && (
        <select className={inputClass} value={value.blockId ?? ""} onChange={(e) => onChange({ ...value, blockId: e.target.value })}>
          <option value="" disabled>
            Choose a street
          </option>
          {houses.data?.streets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {value.audienceType === "ROAD" && (
        <select className={inputClass} value={value.roadNo ?? ""} onChange={(e) => onChange({ ...value, roadNo: e.target.value })}>
          <option value="" disabled>
            Choose a road no.
          </option>
          {roadNumbers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}

      {value.audienceType === "SELECTED" && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search residents..."
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChange({ ...value, userIds: residents.map((r) => r.id) })}
              className="whitespace-nowrap text-xs text-teal underline"
            >
              Select all ({residents.length})
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {residents.map((r) => (
              <label key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleUser(r.id)} />
                <span className="text-ink">{r.name}</span>
                <span className="text-xs text-slate">{r.flatLabel}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate">{selected.size} selected</p>
        </div>
      )}
    </div>
  );
}
