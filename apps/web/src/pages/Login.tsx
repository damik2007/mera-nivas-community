import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@mycommunity/ui";
import { useAuth } from "../lib/auth";
import { apiFetch, ApiError } from "../lib/api";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LOGO_URL = `${import.meta.env.BASE_URL}logo-mark.png`;

// Minimal shape of the Google Identity Services global we use. The real
// script attaches `google` on window; we only touch the few methods we need.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;

    async function handleGoogleCredential(response: { credential: string }) {
      setError(null);
      try {
        await loginWithGoogle(response.credential);
        navigate("/");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not sign in with Google");
      }
    }

    // The GSI <script> in index.html loads asynchronously, so it may not be
    // ready the instant this component mounts — poll briefly for it.
    let cancelled = false;
    let attempts = 0;
    const tryInit = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          width: "320",
        });
        return;
      }
      if (attempts++ < 40) setTimeout(tryInit, 150);
    };
    tryInit();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={LOGO_URL} alt="Mera Nivas" className="mb-3 h-16 w-16" />
          <p className="font-serif text-3xl text-ink">Mera Nivas</p>
          <p className="mt-1 text-sm text-slate">Your Home, Your Community.</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="flex justify-center">
                <div ref={googleButtonRef} />
              </div>
              <div className="my-5 flex items-center gap-3 text-xs text-slate">
                <div className="h-px flex-1 bg-line" />
                or sign in with email
                <div className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-ink">Email</label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-ink"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm text-ink">Password</label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-teal underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-ink"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-rust">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full rounded-lg">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs leading-5 text-slate">
            By signing in, you accept our{" "}
            <a href={`${import.meta.env.BASE_URL}terms.html`} className="text-teal underline">
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a href={`${import.meta.env.BASE_URL}privacy.html`} className="text-teal underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate">
          Trouble signing in? Contact your society admin.
        </p>
      </div>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: { email }, skipAuth: true });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm">
        {sent ? (
          <>
            <p className="font-serif text-lg text-ink">Check your email</p>
            <p className="mt-2 text-sm text-slate">
              If <span className="text-ink">{email}</span> has an account, a reset link is on its way. It's valid for
              1 hour.
            </p>
            <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="font-serif text-lg text-ink">Reset your password</p>
            <p className="mt-1 text-sm text-slate">We'll email you a link to set a new one.</p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            />
            {error && <p className="mt-2 text-sm text-rust">{error}</p>}
            <div className="mt-4 flex gap-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Sending..." : "Send reset link"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
