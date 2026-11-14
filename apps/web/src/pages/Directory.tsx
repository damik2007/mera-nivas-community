import { useState } from "react";
import { Search } from "lucide-react";
import { Card, Badge, PageHeader, EmptyState } from "@mycommunity/ui";
import { useApiData } from "../lib/useApiData";

interface UserRow {
  id: string;
  name: string;
  role: string;
  isOwner: boolean;
  email: string;
}
interface FlatRow {
  id: string;
  number: string;
  users: UserRow[];
}
interface BlockRow {
  id: string;
  name: string;
  flats: FlatRow[];
}

export function Directory() {
  const [q, setQ] = useState("");
  const { data, loading } = useApiData<{ blocks: BlockRow[] }>(`/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`, [q]);

  return (
    <div>
      <PageHeader title="Directory" description="Residents grouped by block and flat." />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
        <Search size={16} className="text-slate" />
        <input
          className="flex-1 text-sm outline-none"
          placeholder="Search by name or flat number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-slate">Loading directory...</p>}
      {!loading && (!data?.blocks || data.blocks.length === 0) && <EmptyState title="No matches" />}

      <div className="space-y-6">
        {data?.blocks.map((block) => (
          <div key={block.id}>
            <p className="mb-2 font-serif text-lg text-ink">{block.name}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {block.flats.map((flat) => (
                <Card key={flat.id} className="p-3">
                  <p className="text-sm font-medium text-ink">Flat {flat.number}</p>
                  {flat.users.length === 0 ? (
                    <p className="mt-1 text-xs text-slate">Vacant</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {flat.users.map((u) => (
                        <div key={u.id} className="flex items-center justify-between text-xs">
                          <span className="text-ink/80">{u.name}</span>
                          <Badge tone={u.isOwner ? "teal" : "slate"}>{u.isOwner ? "Owner" : "Tenant"}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
