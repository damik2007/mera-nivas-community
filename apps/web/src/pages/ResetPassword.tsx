import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@mycommunity/ui";
import { apiFetch, ApiError } from "../lib/api";

const LOGO_URL = `${import.meta.env.BASE_URL}logo-mark.png`;

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: { token, password }, skipAuth: true });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={LOGO_URL} alt="Mera Nivas" className="mb-3 h-16 w-16" />
          <p className="font-serif text-2xl text-ink">Mera Nivas</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          {!token ? (
            <p className="text-sm text-rust">This reset link is missing its token — please use the link from your email.</p>
          ) : done ? (
            <>
              <p className="font-serif text-lg text-ink">Password updated</p>
              <p className="mt-2 text-sm text-slate">You can now sign in with your new password.</p>
              <Button className="mt-4 w-full" onClick={() => navigate("/login")}>
                Go to sign in
              </Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="font-serif text-lg text-ink">Set a new password</p>
              <div>
                <label className="mb-1 block text-sm text-ink">New password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-ink">Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </div>
              {error && <p className="text-sm text-rust">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Saving..." : "Reset password"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate">
          <Link to="/login" className="text-teal underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
