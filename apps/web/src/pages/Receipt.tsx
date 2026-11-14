import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileImage, Printer, Share2 } from "lucide-react";
import { Button } from "@mycommunity/ui";
import { ReceiptPaper } from "../components/ReceiptPaper";
import { useApiData } from "../lib/useApiData";
import { formatDate, formatMoney, type ReceiptData } from "../lib/receipt";
import { downloadReceiptPdf, downloadReceiptPng, shareReceiptImage } from "../lib/receiptExport";

type Busy = "pdf" | "png" | "share" | null;

export function Receipt() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justPaid = params.get("paid") === "1";
  const { data, loading, error } = useApiData<{ receipt: ReceiptData }>(paymentId ? `/bills/payments/${paymentId}/receipt` : null);
  const receipt = data?.receipt;

  const paperRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    setBusy(kind);
    setMessage(null);
    try {
      await task();
    } catch (err) {
      // Cancelling the native share sheet throws an AbortError — that's not a failure.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setMessage("Couldn't create the file. Please try again, or use Print and choose \"Save as PDF\".");
      }
    } finally {
      setBusy(null);
    }
  }

  const baseName = receipt ? `MeraNivas-Receipt-${receipt.receiptNo}` : "receipt";
  const needsNode = (fn: (node: HTMLElement) => Promise<void>) => async () => {
    if (paperRef.current) await fn(paperRef.current);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/receipts"))}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate transition-colors hover:bg-surface hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <Link to="/receipts" className="text-sm text-teal underline-offset-4 hover:underline">
          All receipts
        </Link>
      </div>

      {justPaid && receipt?.status === "SUCCESS" && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal sm:mb-6">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Payment successful</p>
            <p className="text-teal/80">
              ₹{formatMoney(receipt.amount)} received for {receipt.bill.cycleLabel}. Your receipt is ready below.
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="mx-auto h-[34rem] w-full max-w-[30rem] animate-pulse rounded-2xl bg-line/60" aria-label="Loading receipt" />
      )}

      {error && !loading && (
        <div className="mx-auto max-w-md rounded-xl border border-rust/30 bg-rust/5 px-5 py-6 text-center">
          <p className="font-serif text-lg text-ink">Receipt unavailable</p>
          <p className="mt-1 text-sm text-slate">{error}</p>
          <Link to="/receipts" className="mt-4 inline-block text-sm text-teal underline underline-offset-4">
            Back to receipts
          </Link>
        </div>
      )}

      {receipt && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          <div className="overflow-hidden rounded-2xl" style={{ background: "#eef0f2" }}>
            <ReceiptPaper ref={paperRef} data={receipt} />
          </div>

          <aside className="mt-5 space-y-4 lg:sticky lg:top-6 lg:mt-0">
            <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
              <p className="font-serif text-lg text-ink">Keep this receipt</p>
              <p className="mt-0.5 text-xs text-slate">
                {receipt.bill.cycleLabel} · issued {formatDate(receipt.issuedAt)}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
                <Button
                  className="col-span-2 lg:col-span-1"
                  disabled={busy !== null}
                  onClick={() => run("pdf", needsNode((node) => downloadReceiptPdf(node, `${baseName}.pdf`, `Receipt ${receipt.receiptNo}`)))}
                >
                  <Download size={16} />
                  {busy === "pdf" ? "Preparing PDF..." : "Download PDF"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => run("png", needsNode((node) => downloadReceiptPng(node, `${baseName}.png`)))}
                >
                  <FileImage size={16} />
                  {busy === "png" ? "Saving..." : "Save PNG"}
                </Button>
                <Button variant="secondary" disabled={busy !== null} onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </Button>
                {canShare && (
                  <Button
                    variant="secondary"
                    className="col-span-2 lg:col-span-1"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        "share",
                        needsNode(async (node) => {
                          const shared = await shareReceiptImage(node, `${baseName}.png`, `Receipt ${receipt.receiptNo}`);
                          if (!shared) setMessage("Sharing files isn't supported on this device. Use Save image instead.");
                        })
                      )
                    }
                  >
                    <Share2 size={16} />
                    {busy === "share" ? "Opening..." : "Share"}
                  </Button>
                )}
              </div>
              {message && <p className="mt-3 text-sm text-rust">{message}</p>}
            </div>

            <p className="px-1 text-xs leading-relaxed text-slate">
              The PDF is A4-ready. The PNG is a high-resolution image, handy for WhatsApp or email. Quote the receipt number or order ID if you ever
              need to raise a query with your society admin.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
