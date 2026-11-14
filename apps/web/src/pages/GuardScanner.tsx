import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CheckCircle2, XCircle, Car, X } from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@mycommunity/ui";
import { apiFetch, ApiError } from "../lib/api";

interface VerifyResult {
  status: "APPROVED" | "CHECKED_OUT" | "EXPIRED" | "INVALID" | "REVOKED" | "DENIED" | "ALREADY_USED";
  guest?: { name: string; phone: string };
  hostFlat?: string;
  parkingSlot?: { code: string; zone: string | null } | null;
  approval?: { id: string };
}

// The same QR gets scanned twice: the first scan checks a guest in (APPROVED,
// parking allotted); scanning it again later checks them out (CHECKED_OUT,
// parking released). The guard never has to pick which — the server tracks
// where the guest currently stands and figures it out from that.
const STATUS_META: Record<VerifyResult["status"], { label: string; tone: "teal" | "rust" | "amber" }> = {
  APPROVED: { label: "Checked in — let them in", tone: "teal" },
  CHECKED_OUT: { label: "Checked out — parking freed", tone: "teal" },
  EXPIRED: { label: "Expired pass", tone: "rust" },
  INVALID: { label: "Invalid code", tone: "rust" },
  REVOKED: { label: "Revoked by resident", tone: "rust" },
  DENIED: { label: "Previously denied entry", tone: "rust" },
  ALREADY_USED: { label: "Already used", tone: "amber" },
};

// Camera support only needs getUserMedia + a secure origin — true on essentially
// every modern phone and desktop browser over HTTPS, unlike the old
// BarcodeDetector API this used to depend on, which iOS Safari and Firefox
// never implemented at all.
function cameraAvailability(): { ok: true } | { ok: false; reason: string } {
  if (!window.isSecureContext) {
    return { ok: false, reason: "Camera access needs a secure (https://) connection." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "This browser doesn't support camera access." };
  }
  return { ok: true };
}

function mediaErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access for this site and try again.";
  if (name === "NotFoundError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is already in use by another app.";
  return "Could not start the camera.";
}

export function GuardScanner() {
  const [manualToken, setManualToken] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const availability = cameraAvailability();

  function stopScanning() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  // Always release the camera if the guard navigates away mid-scan.
  useEffect(() => stopScanning, []);

  async function verify(token: string) {
    if (!token) return;
    stopScanning();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<VerifyResult>("/guests/verify-qr", { method: "POST", body: { qrToken: token } });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify code");
    } finally {
      setBusy(false);
      setManualToken("");
    }
  }

  async function startCameraScan() {
    setCameraError(null);
    setError(null);
    setResult(null);
    if (!videoRef.current || !canvasRef.current) {
      setCameraError("Camera view isn't ready yet — try again in a moment.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        const video = videoRef.current;
        if (!video || !ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          verify(code.data);
          return; // verify() already stops the camera
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError(mediaErrorMessage(err));
      stopScanning();
    }
  }

  return (
    <div>
      <PageHeader title="Gate scanner" description="Scan or enter a guest's entry code." />

      <Card className="mb-4 p-4">
        {/* The <video> stays mounted at all times (just hidden via CSS when not
            scanning) so videoRef.current is never null when startCameraScan
            runs — it used to only render after scanning became true, which
            meant the very first getUserMedia call always had nothing to attach
            the stream to and silently did nothing. */}
        <div className={scanning ? "" : "hidden"}>
          <div className="relative overflow-hidden rounded-lg bg-ink">
            <video ref={videoRef} className="w-full" muted playsInline />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
          </div>
          <p className="mt-2 text-center text-xs text-slate">Point the camera at the guest's QR code</p>
          <Button variant="secondary" className="mt-2 w-full" onClick={stopScanning}>
            <X size={16} /> Stop scanning
          </Button>
        </div>

        {!scanning && (
          <>
            <Button onClick={startCameraScan} className="w-full" disabled={!availability.ok}>
              <Camera size={16} /> Scan with camera
            </Button>
            {!availability.ok && <p className="mt-2 text-xs text-rust">{availability.reason}</p>}
            {cameraError && <p className="mt-2 text-xs text-rust">{cameraError}</p>}
          </>
        )}
        {/* Off-screen canvas used only to grab video frames for decoding — never shown. */}
        <canvas ref={canvasRef} className="hidden" />
      </Card>

      <Card className="mb-4 p-4">
        <p className="mb-2 text-sm text-slate">
          {availability.ok ? "Or paste the code manually:" : "Paste the code from the guest's QR instead:"}
        </p>
        <textarea
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-ink"
          placeholder="Paste QR token here"
        />
        <Button className="mt-2 w-full" onClick={() => verify(manualToken)} disabled={busy || !manualToken}>
          {busy ? "Verifying..." : "Verify"}
        </Button>
      </Card>

      {error && <p className="text-sm text-rust">{error}</p>}

      {result && (
        <Card className="p-5 text-center">
          {result.status === "APPROVED" || result.status === "CHECKED_OUT" ? (
            <CheckCircle2 className="mx-auto mb-2 text-teal" size={40} />
          ) : (
            <XCircle className="mx-auto mb-2 text-rust" size={40} />
          )}
          <Badge tone={STATUS_META[result.status].tone}>{STATUS_META[result.status].label}</Badge>
          {result.guest && (
            <div className="mt-4 space-y-1 text-sm">
              <p className="font-medium text-ink">{result.guest.name}</p>
              <p className="text-slate">{result.guest.phone}</p>
              <p className="text-slate">Visiting {result.hostFlat}</p>
              {result.parkingSlot && (
                <p className="mt-2 flex items-center justify-center gap-1 text-teal">
                  <Car size={15} /> Parking slot {result.parkingSlot.code}
                </p>
              )}
              {!result.parkingSlot && result.status === "APPROVED" && (
                <p className="mt-2 text-xs text-amber-ink">No guest parking slots available</p>
              )}
              {result.status === "CHECKED_OUT" && (
                <p className="mt-2 flex items-center justify-center gap-1 text-teal">
                  <Car size={15} /> Parking slot released
                </p>
              )}
            </div>
          )}
          <Button variant="secondary" className="mt-4" onClick={() => setResult(null)}>
            Scan next guest
          </Button>
        </Card>
      )}
    </div>
  );
}
