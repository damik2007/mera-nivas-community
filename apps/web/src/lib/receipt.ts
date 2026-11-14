// Shared types + pure helpers for the receipt UI. No React in here.

export interface ReceiptData {
  receiptNo: string;
  orderId: string;
  paymentId: string;
  internalId: string;
  issuedAt: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  amount: number;
  currency: string;
  method: string;
  society: { name: string; address: string | null };
  payer: { name: string; email: string; phone: string | null };
  flat: { street: string; number: string; roadNo: string | null; floor: number | null } | null;
  bill: {
    id: string;
    cycleLabel: string;
    description: string | null;
    totalAmount: number;
    dueDate: string;
    lineItems: { name: string; amount: number }[];
    paidBefore: number;
    paidAfter: number;
    balance: number;
  };
  qr: string; // PNG data URL
}

export interface ReceiptListRow {
  id: string;
  receiptNo: string;
  orderId: string;
  amount: number;
  status: ReceiptData["status"];
  provider: string;
  createdAt: string;
  cycleLabel: string;
  payerName: string;
  flatLabel: string;
}

/** 1234.5 -> "1,234.50" using Indian digit grouping (12,34,567.00). */
export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function methodLabel(provider: string): { title: string; detail: string } {
  switch (provider) {
    case "razorpay":
      return { title: "Online payment", detail: "Razorpay · UPI / Card / Netbanking" };
    case "stripe":
      return { title: "Card payment", detail: "Stripe" };
    default:
      return { title: "Demo payment", detail: "Test mode · no money moved" };
  }
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

/** Whole-number words using the Indian system (thousand, lakh, crore). */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 1250.5 -> "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  const rupeePart = `Rupees ${integerToWords(rupees)}`;
  return paise ? `${rupeePart} and ${below100(paise)} Paise Only` : `${rupeePart} Only`;
}

// ---- Code 128 (subset B) -----------------------------------------------------
// A real, scannable barcode of the receipt number — not decorative bars.
// Each entry is the bar/space widths (in modules) of one symbol, starting with a bar.

const CODE128_WIDTHS =
  "212222|222122|222221|121223|121322|131222|122213|122312|132212|221213|221312|231212|112232|122132|122231|113222|123122|123221|223211|221132|221231|213212|223112|312131|311222|321122|321221|312212|322112|322211|212123|212321|232121|111323|131123|131321|112313|132113|132311|211313|231113|231311|112133|112331|132131|113123|113321|133121|313121|211331|231131|213113|213311|213131|311123|311321|331121|312113|312311|332111|314111|221411|431111|111224|111422|121124|121421|141122|141221|112214|112412|122114|122411|142112|142211|241211|221114|413111|241112|134111|111242|121142|121241|114212|124112|124211|411212|421112|421211|212141|214121|412121|111143|111341|131141|114113|114311|411113|411311|113141|114131|311141|411131|211412|211214|211232".split(
    "|"
  );
const CODE128_START_B = 104;
const CODE128_STOP = "2331112";

export interface BarcodeBar {
  x: number;
  w: number;
}

/** Returns bar rectangles (in module units) plus the total width, with a 10-module quiet zone on each side. */
export function code128Bars(text: string): { bars: BarcodeBar[]; width: number } {
  const values = [CODE128_START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 32;
    values.push(code >= 0 && code < 95 ? code : 0); // anything outside printable ASCII becomes a space
  }
  let checksum = CODE128_START_B;
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103);

  const widths = values.map((v) => CODE128_WIDTHS[v]).concat(CODE128_STOP).join("");
  const QUIET = 10;
  const bars: BarcodeBar[] = [];
  let x = QUIET;
  for (let i = 0; i < widths.length; i++) {
    const w = Number(widths[i]);
    if (i % 2 === 0) bars.push({ x, w }); // even positions are bars, odd are spaces
    x += w;
  }
  return { bars, width: x + QUIET };
}
