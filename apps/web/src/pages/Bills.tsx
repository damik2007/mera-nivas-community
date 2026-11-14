import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReceiptText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Badge, Button, PageHeader, EmptyState } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { useApiData } from "../lib/useApiData";
import { apiFetch, ApiError } from "../lib/api";
import { formatMoney } from "../lib/receipt";
import { AudienceSelector, type AudienceValue } from "../components/AudienceSelector";

// Minimal shape of the Razorpay Checkout global the checkout.js script
// attaches to window — just the parts we actually use.
declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      order_id: string;
      amount: number;
      currency: string;
      name: string;
      description?: string;
      theme?: { color: string };
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
      modal?: { ondismiss?: () => void };
    }) => { open: () => void; on: (event: string, cb: () => void) => void };
  }
}

interface LineItem {
  id: string;
  amount: number;
  category: { name: string };
}
interface Payment {
  id: string;
  amount: number;
  createdAt: string;
}
interface BillRow {
  id: string;
  cycleLabel: string;
  description?: string | null;
  totalAmount: number;
  amountPaid: number;
  status: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";
  dueDate: string;
  lineItems: LineItem[];
  payments: Payment[];
}

const STATUS_TONE: Record<BillRow["status"], "teal" | "amber" | "rust" | "slate"> = {
  PAID: "teal",
  PARTIAL: "amber",
  PENDING: "slate",
  OVERDUE: "rust",
};

export function Bills() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  return isAdmin ? <AdminBilling /> : <ResidentBills />;
}

interface RazorpayConfig {
  enabled: boolean;
  keyId: string | null;
}

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the payment provider. Check your connection."));
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

function ResidentBills() {
  const { data, loading, reload } = useApiData<{ bills: BillRow[] }>("/bills/mine");
  const { data: razorpay } = useApiData<RazorpayConfig>("/bills/razorpay/config");

  return (
    <div>
      <PageHeader title="Maintenance bills" description="Review and pay your society dues." />
      {loading && <p className="text-sm text-slate">Loading bills...</p>}
      {!loading && (!data?.bills || data.bills.length === 0) && <EmptyState title="No bills yet" hint="Your society admin hasn't generated bills." />}
      <div className="space-y-4">
        {data?.bills.map((bill) => (
          <BillCard key={bill.id} bill={bill} onPaid={reload} razorpay={razorpay} />
        ))}
      </div>
    </div>
  );
}

function BillCard({ bill, onPaid, razorpay }: { bill: BillRow; onPaid: () => void; razorpay: RazorpayConfig | null }) {
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = Math.max(bill.totalAmount - bill.amountPaid, 0);

  async function payMock() {
    const res = await apiFetch<{ payment: { id: string } }>(`/bills/${bill.id}/pay`, {
      method: "POST",
      body: { amount: remaining, provider: "mock" },
    });
    onPaid();
    navigate(`/receipts/${res.payment.id}?paid=1`);
  }

  async function payWithRazorpay() {
    await loadRazorpayScript();
    const order = await apiFetch<{ orderId: string; amount: number; currency: string; keyId: string }>(
      `/bills/${bill.id}/razorpay/order`,
      { method: "POST", body: { amount: remaining } }
    );

    return new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Mera Nivas",
        description: bill.cycleLabel,
        theme: { color: "#14161a" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            const verified = await apiFetch<{ payment: { id: string } }>(`/bills/${bill.id}/razorpay/verify`, {
              method: "POST",
              body: { ...response, amount: remaining },
            });
            onPaid();
            navigate(`/receipts/${verified.payment.id}?paid=1`);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: { ondismiss: () => resolve() },
      });
      rzp.on("payment.failed", () => reject(new Error("Payment failed. You have not been charged.")));
      rzp.open();
    });
  }

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      if (razorpay?.enabled) {
        await payWithRazorpay();
      } else {
        await payMock();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Payment could not be completed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-serif text-lg text-ink">{bill.cycleLabel}</p>
          <p className="text-xs text-slate">Due {new Date(bill.dueDate).toLocaleDateString()}</p>
        </div>
        <Badge tone={STATUS_TONE[bill.status]}>{bill.status}</Badge>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {bill.lineItems.length > 0 ? (
          bill.lineItems.map((li) => (
            <div key={li.id} className="flex justify-between text-ink/80">
              <span>{li.category.name}</span>
              <span>{li.amount.toFixed(2)}</span>
            </div>
          ))
        ) : bill.description ? (
          <p className="text-ink/80">{bill.description}</p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <div className="text-sm">
          <p className="text-ink">Total: {bill.totalAmount.toFixed(2)}</p>
          {bill.amountPaid > 0 && <p className="text-slate">Paid: {bill.amountPaid.toFixed(2)}</p>}
        </div>
        {bill.status !== "PAID" && (
          <Button onClick={pay} disabled={paying}>
            {paying ? "Processing..." : `Pay ${remaining.toFixed(2)}`}
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-rust">{error}</p>}

      {bill.payments.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate">Receipts</p>
          <div className="flex flex-wrap gap-2">
            {bill.payments.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/receipts/${p.id}`)}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink transition-colors hover:border-teal/50 hover:bg-teal/5"
              >
                <ReceiptText size={15} className="text-teal" />
                <span className="font-medium">₹{formatMoney(p.amount)}</span>
                <span className="text-slate">{new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

interface CategoryRow {
  id: string;
  name: string;
  billingMethod: "FLAT_RATE" | "PER_SQFT" | "EQUAL_SPLIT";
  rate: number;
}
interface DashboardStats {
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  byCategory: Record<string, number>;
  overdueCount: number;
}

function AdminBilling() {
  const { data: categoriesData, reload: reloadCategories } = useApiData<{ categories: CategoryRow[] }>("/bills/categories");
  const { data: dashboard, reload: reloadDashboard } = useApiData<DashboardStats>("/bills/dashboard");
  const [addingCategory, setAddingCategory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cycleLabel, setCycleLabel] = useState(new Date().toISOString().slice(0, 7));

  async function generateBills() {
    setGenerating(true);
    try {
      const res = await apiFetch<{ generated: number }>("/bills/generate", { method: "POST", body: { cycleLabel, dueInDays: 10 } });
      alert(`Generated ${res.generated} bills for ${cycleLabel}`);
      reloadDashboard();
    } finally {
      setGenerating(false);
    }
  }

  const chartData = dashboard ? Object.entries(dashboard.byCategory).map(([name, amount]) => ({ name, amount })) : [];

  return (
    <div>
      <PageHeader title="Billing" description="Maintenance categories, cycle generation, and collections." />

      {dashboard && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Total billed" value={dashboard.totalBilled} />
          <Stat label="Collected" value={dashboard.totalCollected} tone="teal" />
          <Stat label="Outstanding" value={dashboard.outstanding} tone="rust" />
        </div>
      )}

      {chartData.length > 0 && (
        <Card className="mb-6 p-4">
          <p className="mb-3 text-sm font-medium text-ink">Spend by category</p>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="amount" fill="#2F6F62" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <ChargeForm onCreated={() => { reloadDashboard(); }} />

      <Card className="mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-ink">Generate bills for a cycle</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            placeholder="2026-09"
            value={cycleLabel}
            onChange={(e) => setCycleLabel(e.target.value)}
          />
          <Button onClick={generateBills} disabled={generating}>
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Maintenance categories</p>
          <Button variant="secondary" onClick={() => setAddingCategory((v) => !v)}>
            {addingCategory ? "Cancel" : "Add category"}
          </Button>
        </div>
        {addingCategory && <AddCategoryForm onAdded={() => { setAddingCategory(false); reloadCategories(); }} />}
        <div className="space-y-2">
          {categoriesData?.categories.map((c) => (
            <div key={c.id} className="flex justify-between border-b border-line py-2 text-sm last:border-0">
              <span>{c.name}</span>
              <span className="text-slate">
                {c.billingMethod} · {c.rate}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "teal" | "rust" }) {
  const color = tone === "teal" ? "text-teal" : tone === "rust" ? "text-rust" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-xs text-slate">{label}</p>
      <p className={`mt-1 font-serif text-2xl ${color}`}>{value.toFixed(0)}</p>
    </Card>
  );
}

function ChargeForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueInDays, setDueInDays] = useState("14");
  const [audience, setAudience] = useState<AudienceValue>({ audienceType: "ALL" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit() {
    if (!label || !description || !amount) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<{ created: number }>("/bills/charge", {
        method: "POST",
        body: {
          label,
          description,
          amount: Number(amount),
          dueInDays: Number(dueInDays) || 14,
          ...audience,
        },
      });
      setResult(`Created ${res.created} bill${res.created === 1 ? "" : "s"}.`);
      setLabel("");
      setDescription("");
      setAmount("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create charge");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">One-off charge</p>
          <p className="text-xs text-slate">A fine, damage repair, or any charge outside the regular maintenance cycle.</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New charge"}
        </Button>
      </div>
      {open && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Short label (e.g. Fine-Sep26)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} />
            <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Due in days" type="number" value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
          </div>
          <textarea
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
            placeholder="Reason (e.g. Damage to the gate near MG Road on 12 Sep)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <AudienceSelector value={audience} onChange={setAudience} />
          {error && <p className="text-sm text-rust">{error}</p>}
          {result && <p className="text-sm text-teal">{result}</p>}
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creating..." : "Create charge"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function AddCategoryForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [billingMethod, setBillingMethod] = useState<CategoryRow["billingMethod"]>("FLAT_RATE");
  const [rate, setRate] = useState("");

  async function submit() {
    if (!name || !rate) return;
    await apiFetch("/bills/categories", { method: "POST", body: { name, billingMethod, rate: Number(rate) } });
    onAdded();
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <input className="rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
      <select
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        value={billingMethod}
        onChange={(e) => setBillingMethod(e.target.value as CategoryRow["billingMethod"])}
      >
        <option value="FLAT_RATE">Flat rate per flat</option>
        <option value="PER_SQFT">Per sq. ft.</option>
        <option value="EQUAL_SPLIT">Equal split across flats</option>
      </select>
      <input className="w-28 rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder="Rate" value={rate} onChange={(e) => setRate(e.target.value)} />
      <Button onClick={submit}>Add</Button>
    </div>
  );
}
