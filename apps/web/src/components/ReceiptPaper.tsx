import { forwardRef, useId, useMemo } from "react";
import "./receipt.css";
import {
  amountInWords,
  code128Bars,
  formatDate,
  formatMoney,
  formatTime,
  methodLabel,
  type ReceiptData,
} from "../lib/receipt";

const LOGO_URL = `${import.meta.env.BASE_URL}logo-mark-256.png`;

type Tone = "ok" | "warn" | "bad";

function toneFor(status: ReceiptData["status"]): { tone: Tone; stamp: string; chip: string } {
  if (status === "SUCCESS") return { tone: "ok", stamp: "PAID", chip: "Payment successful" };
  if (status === "PENDING") return { tone: "warn", stamp: "PENDING", chip: "Payment pending" };
  return { tone: "bad", stamp: "FAILED", chip: "Payment failed" };
}

/** Round "PAID" rubber stamp with the date set inside it. */
function Stamp({ label, tone, date }: { label: string; tone: Tone; date: string }) {
  // useId() returns ":r1:" — colons aren't safe inside an SVG url()/href reference.
  const pathId = `rc-arc-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const filterId = `${pathId}-ink`;
  return (
    <div className={`rc-stamp ${tone === "warn" ? "rc-stamp--warn" : tone === "bad" ? "rc-stamp--bad" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          {/* A touch of roughness so it reads as ink on paper rather than a vector badge. */}
          <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" />
          </filter>
          <path id={pathId} d="M 60,60 m -41,0 a 41,41 0 1,1 82,0 a 41,41 0 1,1 -82,0" />
        </defs>
        <g filter={`url(#${filterId})`} fill="none" stroke="currentColor">
          <circle cx="60" cy="60" r="57" strokeWidth="3.2" />
          <circle cx="60" cy="60" r="51.5" strokeWidth="1" />
          <circle cx="60" cy="60" r="31" strokeWidth="1" strokeDasharray="2 2.4" />
          <text fill="currentColor" stroke="none" fontSize="8.4" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">
            {/* textLength stretches the words to exactly one lap of the ring (2π·41 ≈ 257.6). */}
            <textPath href={`#${pathId}`} startOffset="0" textLength="254" lengthAdjust="spacing">
              MERA NIVAS • PAYMENT RECEIVED •
            </textPath>
          </text>
          <text
            x="60"
            y="64"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontSize={label.length > 4 ? 15.5 : 22}
            fontWeight="800"
            letterSpacing="1.5"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label}
          </text>
          <text x="60" y="78" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.6" fontWeight="600" letterSpacing="1" fontFamily="Inter, system-ui, sans-serif">
            {date.toUpperCase()}
          </text>
        </g>
      </svg>
    </div>
  );
}

function Money({ value }: { value: number }) {
  return <>₹&nbsp;{formatMoney(value)}</>;
}

/**
 * The receipt itself. The forwarded ref points at the outer capture node —
 * that is what gets rasterised for the PNG / PDF downloads and what the
 * print stylesheet isolates.
 */
export const ReceiptPaper = forwardRef<HTMLDivElement, { data: ReceiptData }>(function ReceiptPaper({ data }, ref) {
  const { tone, stamp, chip } = toneFor(data.status);
  const method = methodLabel(data.method);
  const barcode = useMemo(() => code128Bars(data.receiptNo), [data.receiptNo]);

  const [rupees, paise] = formatMoney(data.amount).split(".");
  const settled = data.bill.balance <= 0.004;
  const dateShort = formatDate(data.issuedAt);

  const property = data.flat
    ? [data.flat.street, `House ${data.flat.number}`, data.flat.roadNo ? `Road ${data.flat.roadNo}` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="rc-capture" ref={ref}>
      <article className="rc-sheet" aria-label={`Payment receipt ${data.receiptNo}`}>
        <div className="rc-tear rc-tear--top" />

        {/* ===== Segment 1: header + amount ===== */}
        <div className="rc-seg rc-seg--has-bottom-holes">
          <header className="rc-head">
            <div className="rc-brand">
              <div className="rc-logo">
                <img src={LOGO_URL} alt="" crossOrigin="anonymous" />
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="rc-brand-name">Mera Nivas</p>
                <p className="rc-brand-sub">
                  {data.society.name}
                  {data.society.address ? ` · ${data.society.address}` : ""}
                </p>
              </div>
            </div>
            <div className="rc-doc-tag">
              Payment
              <span>Receipt</span>
            </div>
          </header>

          <section className="rc-hero">
            <div className="rc-hero-main">
              <p className="rc-eyebrow">{data.status === "SUCCESS" ? "Amount paid" : "Amount"}</p>
              <p className={`rc-amount ${rupees.length > 7 ? "rc-amount--md" : ""}`}>
                <span className="rc-cur">₹</span>
                {rupees}
                <span className="rc-paise">.{paise}</span>
              </p>
              <p className="rc-words">{amountInWords(data.amount)}</p>
            </div>
            <Stamp label={stamp} tone={tone} date={dateShort} />
            <div className="rc-hero-foot">
              <p className="rc-when">
                {dateShort} · {formatTime(data.issuedAt)}
              </p>
              <div className="rc-chips">
                <span className={`rc-chip rc-chip--${tone}`}>
                  <i />
                  {chip}
                </span>
                <span className="rc-chip">{method.title}</span>
              </div>
            </div>
          </section>
        </div>

        {/* ===== Segment 2: details ===== */}
        <div className="rc-seg rc-seg--has-top-holes rc-seg--has-bottom-holes">
          <div className="rc-body">
            <section className="rc-section">
              <h3 className="rc-h">Receipt details</h3>
              <dl className="rc-rows">
                <div className="rc-row">
                  <dt>Receipt no.</dt>
                  <dd className="rc-mono">{data.receiptNo}</dd>
                </div>
                <div className="rc-row">
                  <dt>Order ID</dt>
                  <dd className="rc-mono">{data.orderId}</dd>
                </div>
                <div className="rc-row">
                  <dt>Payment ID</dt>
                  <dd className="rc-mono">{data.paymentId}</dd>
                </div>
                <div className="rc-row">
                  <dt>Date &amp; time</dt>
                  <dd>
                    {dateShort}
                    <small>{formatTime(data.issuedAt)}</small>
                  </dd>
                </div>
                <div className="rc-row">
                  <dt>Method</dt>
                  <dd>
                    {method.title}
                    <small>{method.detail}</small>
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rc-section">
              <h3 className="rc-h">Received from</h3>
              <p className="rc-person">
                <strong>{data.payer.name}</strong>
                <span>{data.payer.email}</span>
                {data.payer.phone && <span>{data.payer.phone}</span>}
                {property && <span>{property}</span>}
              </p>
            </section>

            <section className="rc-section">
              <h3 className="rc-h">Bill summary</h3>
              <dl className="rc-rows">
                <div className="rc-row">
                  <dt>Billing for</dt>
                  <dd>{data.bill.cycleLabel}</dd>
                </div>
                <div className="rc-row">
                  <dt>Due date</dt>
                  <dd>{formatDate(data.bill.dueDate)}</dd>
                </div>
              </dl>
              {data.bill.description && <p className="rc-note">{data.bill.description}</p>}
              {data.bill.lineItems.length > 0 && (
                <ul className="rc-items">
                  {data.bill.lineItems.map((li, i) => (
                    <li key={`${li.name}-${i}`}>
                      <span>{li.name}</span>
                      <span>
                        <Money value={li.amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rc-totals">
                <div className="rc-total">
                  <span>Bill total</span>
                  <span>
                    <Money value={data.bill.totalAmount} />
                  </span>
                </div>
                {data.bill.paidBefore > 0 && (
                  <div className="rc-total">
                    <span>Paid earlier</span>
                    <span>
                      <Money value={data.bill.paidBefore} />
                    </span>
                  </div>
                )}
                <div className="rc-total rc-total--this">
                  <span>This payment</span>
                  <span>
                    <Money value={data.status === "SUCCESS" ? data.amount : 0} />
                  </span>
                </div>
                <div className={`rc-total rc-total--balance ${settled ? "rc-total--clear" : "rc-total--due"}`}>
                  <span>Balance due</span>
                  <span>{settled ? "Nil" : <Money value={data.bill.balance} />}</span>
                </div>
              </div>

              {data.status === "SUCCESS" && (
                <div className="rc-settled">
                  <span className={`rc-chip ${settled ? "rc-chip--ok" : "rc-chip--warn"}`}>
                    <i />
                    {settled ? "Bill settled in full" : "Part payment · balance remains"}
                  </span>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ===== Segment 3: stub with QR + barcode ===== */}
        <div className="rc-seg rc-seg--has-top-holes">
          <footer className="rc-foot">
            <div className="rc-foot-top">
              <div className="rc-qr">
                <img src={data.qr} alt="QR code with this receipt's details" />
                <span>Scan for details</span>
              </div>
              <div className="rc-thanks">
                <h4>Thank you.</h4>
                <p>Your payment keeps {data.society.name} running — lights on, gates open, gardens green.</p>
              </div>
            </div>
            <div className="rc-barcode" role="img" aria-label={`Barcode ${data.receiptNo}`}>
              <svg viewBox={`0 0 ${barcode.width} 40`} preserveAspectRatio="none" shapeRendering="crispEdges">
                {barcode.bars.map((b) => (
                  <rect key={b.x} x={b.x} y="0" width={b.w} height="40" fill="#14161a" />
                ))}
              </svg>
              <span className="rc-mono">{data.receiptNo}</span>
            </div>
            <p className="rc-fine">
              This is a computer-generated receipt and does not require a signature.
              <br />
              Issued by Mera Nivas · Keep it for your records.
            </p>
          </footer>
        </div>

        <div className="rc-tear rc-tear--bottom" />
      </article>
    </div>
  );
});
