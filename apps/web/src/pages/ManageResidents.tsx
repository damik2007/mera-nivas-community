import { useRef, useState, type FormEvent, type ReactNode, type ChangeEvent } from "react";
import { Card, Badge, PageHeader, EmptyState, Button } from "@mycommunity/ui";
import { apiFetch, apiDownload, ApiError } from "../lib/api";
import { useApiData } from "../lib/useApiData";

interface StreetRow {
  id: string;
  name: string;
}
interface HouseRow {
  id: string;
  number: string;
  roadNo: string | null;
  floor: number | null;
  areaSqft: number | null;
  blockId: string;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "SOCIETY_ADMIN" | "RESIDENT" | "SECURITY";
  isOwner: boolean;
  flatId: string | null;
  hasDocument: boolean;
  documentLabel: string | null;
}
interface FamilyMember {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  mobile: string;
}

const ROLE_LABEL: Record<string, string> = {
  SOCIETY_ADMIN: "Society admin",
  RESIDENT: "Resident",
  SECURITY: "Security",
  SUPER_ADMIN: "Super admin",
};

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-ink";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink">{label}</span>
      {children}
    </label>
  );
}

export function ManageResidents() {
  const houses = useApiData<{ houses: HouseRow[]; streets: StreetRow[] }>("/admin/houses");
  const users = useApiData<{ users: UserRow[] }>("/admin/users");
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  async function handleAction<T>(action: () => Promise<T>, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  // ---- Add street ----
  async function addStreet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (new FormData(form).get("name") as string)?.trim();
    if (!name) return;
    await handleAction(
      () => apiFetch("/admin/streets", { method: "POST", body: { name } }),
      () => {
        form.reset();
        houses.reload();
      }
    );
  }

  // ---- Add house ----
  async function addHouse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const streetId = fd.get("streetId") as string;
    const houseNo = (fd.get("houseNo") as string)?.trim();
    if (!streetId || !houseNo) return;
    await handleAction(
      () =>
        apiFetch("/admin/houses", {
          method: "POST",
          body: {
            streetId,
            houseNo,
            roadNo: (fd.get("roadNo") as string)?.trim() || undefined,
            floor: fd.get("floor") ? Number(fd.get("floor")) : undefined,
            areaSqft: fd.get("areaSqft") ? Number(fd.get("areaSqft")) : undefined,
          },
        }),
      () => {
        form.reset();
        houses.reload();
      }
    );
  }

  // ---- Add user ----
  async function addUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await handleAction(
      () =>
        apiFetch("/admin/users", {
          method: "POST",
          body: {
            name: fd.get("name"),
            email: fd.get("email"),
            password: fd.get("password"),
            phone: (fd.get("phone") as string)?.trim() || undefined,
            role: fd.get("role"),
            houseId: (fd.get("houseId") as string) || undefined,
            isOwner: fd.get("occupancy") === "owner",
          },
        }),
      () => {
        form.reset();
        users.reload();
      }
    );
  }

  const streetById = new Map((houses.data?.streets ?? []).map((s) => [s.id, s.name]));
  const houseById = new Map((houses.data?.houses ?? []).map((h) => [h.id, h]));
  const selectedUser = users.data?.users.find((u) => u.id === selectedUserId) ?? null;

  return (
    <div>
      <PageHeader title="Manage residents" description="Streets, houses, accounts, family details and documents." />

      {error && (
        <div className="mb-4 rounded-lg border border-rust/30 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Streets */}
        <Card className="p-4">
          <p className="mb-3 font-serif text-lg text-ink">Streets</p>
          <form onSubmit={addStreet} className="mb-4 flex gap-2">
            <input name="name" required placeholder="e.g. MG Road" className={inputClass} />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
          {houses.data?.streets.length ? (
            <div className="flex flex-wrap gap-2">
              {houses.data.streets.map((s) => (
                <Badge key={s.id} tone="slate">
                  {s.name}
                </Badge>
              ))}
            </div>
          ) : (
            !houses.loading && <p className="text-sm text-slate">No streets yet — add one above.</p>
          )}
        </Card>

        {/* Houses */}
        <Card className="p-4">
          <p className="mb-3 font-serif text-lg text-ink">Houses</p>
          <form onSubmit={addHouse} className="mb-4 grid grid-cols-2 gap-2">
            <select name="streetId" required className={`${inputClass} col-span-2`} defaultValue="">
              <option value="" disabled>
                Street
              </option>
              {houses.data?.streets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input name="houseNo" required placeholder="House no." className={inputClass} />
            <input name="roadNo" placeholder="Road no. (optional)" className={inputClass} />
            <input name="floor" type="number" placeholder="Floor (optional)" className={inputClass} />
            <input name="areaSqft" type="number" placeholder="Area sqft (optional)" className={inputClass} />
            <Button type="submit" variant="secondary" className="col-span-2">
              Add house
            </Button>
          </form>
          {houses.data?.houses.length ? (
            <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
              {houses.data.houses.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5">
                  <span>
                    {streetById.get(h.blockId)} · {h.roadNo ? `${h.roadNo} · ` : ""}
                    {h.number}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            !houses.loading && <p className="text-sm text-slate">No houses yet — add one above.</p>
          )}
        </Card>
      </div>

      {/* Create account */}
      <Card className="mt-6 p-4">
        <p className="mb-3 font-serif text-lg text-ink">Create account</p>
        <form onSubmit={addUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Temporary password">
            <input name="password" type="text" required minLength={6} className={inputClass} />
          </Field>
          <Field label="Phone (optional)">
            <input name="phone" className={inputClass} />
          </Field>
          <Field label="Role">
            <select name="role" className={inputClass} defaultValue="RESIDENT">
              <option value="RESIDENT">Resident</option>
              <option value="SOCIETY_ADMIN">Society admin</option>
              <option value="SECURITY">Security</option>
            </select>
          </Field>
          <Field label="House (residents only)">
            <select name="houseId" className={inputClass} defaultValue="">
              <option value="">— none —</option>
              {houses.data?.houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {streetById.get(h.blockId)} · {h.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Occupancy">
            <select name="occupancy" className={inputClass} defaultValue="owner">
              <option value="owner">Owner</option>
              <option value="tenant">Tenant</option>
            </select>
          </Field>
          <Button type="submit" className="sm:col-span-2 lg:col-span-3">
            Create account
          </Button>
        </form>
      </Card>

      {/* User list */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-line p-4">
          <p className="font-serif text-lg text-ink">Accounts</p>
        </div>
        {!users.data?.users.length ? (
          !users.loading && <div className="p-4">
            <EmptyState title="No accounts yet" hint="Create one above to get started." />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {users.data.users.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(u.id === selectedUserId ? null : u.id)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-surface ${
                  u.id === selectedUserId ? "bg-surface" : ""
                }`}
              >
                <div>
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="text-xs text-slate">
                    {u.email} {u.flatId && houseById.get(u.flatId) ? `· ${streetById.get(houseById.get(u.flatId)!.blockId)} ${houseById.get(u.flatId)!.number}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {u.hasDocument && <Badge tone="teal">Document on file</Badge>}
                  <Badge tone={u.role === "RESIDENT" ? "slate" : "amber"}>{ROLE_LABEL[u.role]}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedUser && <UserDetail key={selectedUser.id} user={selectedUser} onChanged={() => users.reload()} />}
    </div>
  );
}

function UserDetail({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const family = useApiData<{ members: FamilyMember[] }>(`/admin/users/${user.id}/family`);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function addFamilyMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    try {
      await apiFetch(`/admin/users/${user.id}/family`, {
        method: "POST",
        body: { name: fd.get("name"), gender: fd.get("gender"), mobile: fd.get("mobile") },
      });
      form.reset();
      family.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add family member");
    }
  }

  async function removeFamilyMember(id: string) {
    setError(null);
    try {
      await apiFetch(`/admin/family/${id}`, { method: "DELETE" });
      family.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove family member");
    }
  }

  async function uploadDocument(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("label", file.name);
      await apiFetch(`/admin/users/${user.id}/document`, { method: "POST", body: fd });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeDocument() {
    setError(null);
    try {
      await apiFetch(`/admin/users/${user.id}/document`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove document");
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="p-4">
        <p className="mb-3 font-serif text-lg text-ink">Family members — {user.name}</p>
        {error && <p className="mb-3 text-sm text-rust">{error}</p>}
        <form onSubmit={addFamilyMember} className="mb-4 grid grid-cols-3 gap-2">
          <input name="name" required placeholder="Name" className={`${inputClass} col-span-3 sm:col-span-1`} />
          <select name="gender" className={inputClass} defaultValue="MALE">
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          <input name="mobile" required placeholder="Mobile" className={inputClass} />
          <Button type="submit" variant="secondary" className="col-span-3">
            Add family member
          </Button>
        </form>
        {family.data?.members.length ? (
          <ul className="space-y-1 text-sm">
            {family.data.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5">
                <span>
                  {m.name} <span className="text-slate">· {m.gender.toLowerCase()} · {m.mobile}</span>
                </span>
                <button onClick={() => removeFamilyMember(m.id)} className="text-xs text-rust hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !family.loading && <p className="text-sm text-slate">No family members added yet.</p>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-3 font-serif text-lg text-ink">Legal document (optional)</p>
        <p className="mb-3 text-xs text-slate">PDF, JPG, or PNG — up to 5 MB. e.g. sale deed, rental agreement, ID proof.</p>
        {user.hasDocument ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">{user.documentLabel || "Document on file"}</Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => apiDownload(`/admin/users/${user.id}/document`, user.documentLabel || "document")}
            >
              Download
            </Button>
            <Button type="button" variant="danger" onClick={removeDocument}>
              Remove
            </Button>
          </div>
        ) : (
          <p className="mb-3 text-sm text-slate">No document uploaded.</p>
        )}
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={uploadDocument}
            disabled={uploading}
            className="text-sm"
          />
        </div>
      </Card>
    </div>
  );
}
