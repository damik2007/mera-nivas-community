import { toPng } from "html-to-image";

// Must match --rc-stage in receipt.css: the backdrop the paper sits on.
export const RECEIPT_STAGE_COLOR = "#eef0f2";

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

/**
 * Renders the receipt node to a PNG data URL.
 * `backdrop` is the colour behind the paper: the stage grey for a shareable
 * image, white for a PDF page (so the perforation notches blend in).
 */
export async function captureReceipt(node: HTMLElement, backdrop: string = RECEIPT_STAGE_COLOR) {
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  // Always export ~1400px wide, however small the phone screen is.
  const pixelRatio = Math.min(4, Math.max(2, 1400 / Math.max(width, 1)));

  const previous = node.style.getPropertyValue("--rc-stage");
  node.style.setProperty("--rc-stage", backdrop);
  node.classList.add("rc-exporting");

  const options = { pixelRatio, backgroundColor: backdrop, cacheBust: true };
  try {
    // Safari draws the first foreignObject capture blank; a throwaway first pass fixes it.
    if (isSafari()) await toPng(node, options).catch(() => undefined);
    let dataUrl: string;
    try {
      dataUrl = await toPng(node, options);
    } catch {
      // Web-font embedding can fail on a flaky connection — retry with system fonts rather than failing the download.
      dataUrl = await toPng(node, { ...options, skipFonts: true });
    }
    return { dataUrl, width, height };
  } finally {
    node.classList.remove("rc-exporting");
    if (previous) node.style.setProperty("--rc-stage", previous);
    else node.style.removeProperty("--rc-stage");
  }
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadReceiptPng(node: HTMLElement, filename: string) {
  const { dataUrl } = await captureReceipt(node);
  triggerDownload(dataUrl, filename);
}

export async function downloadReceiptPdf(node: HTMLElement, filename: string, title: string) {
  const [{ dataUrl, width, height }, { jsPDF }] = await Promise.all([captureReceipt(node, "#ffffff"), import("jspdf")]);

  // A4 portrait, receipt centred at the top and as large as fits.
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const maxW = Math.min(130, pageW - margin * 2);
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / width, maxH / height);
  const w = width * scale;
  const h = height * scale;

  pdf.setProperties({ title, subject: "Payment receipt", creator: "Mera Nivas" });
  pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, margin, w, h, undefined, "FAST");
  pdf.save(filename);
}

export async function shareReceiptImage(node: HTMLElement, filename: string, title: string): Promise<boolean> {
  const { dataUrl } = await captureReceipt(node);
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return true;
  }
  return false;
}
