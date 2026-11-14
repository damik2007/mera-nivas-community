const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function getTokens() {
  return {
    accessToken: localStorage.getItem("mc_access_token"),
    refreshToken: localStorage.getItem("mc_refresh_token"),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("mc_access_token", accessToken);
  localStorage.setItem("mc_refresh_token", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("mc_access_token");
  localStorage.removeItem("mc_refresh_token");
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens();
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem("mc_access_token", data.accessToken);
  return data.accessToken as string;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuth } = opts;
  const { accessToken } = getTokens();

  // FormData (file uploads) must NOT get a JSON Content-Type or be stringified —
  // the browser sets its own multipart boundary header automatically.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const doFetch = async (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(accessToken);

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      clearTokens();
      window.location.href = `${import.meta.env.BASE_URL}login`;
      throw new ApiError(401, "Session expired");
    }
  }

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? String((payload as any).error) : "Request failed";
    throw new ApiError(res.status, message, (payload as any)?.details);
  }

  return payload as T;
}

/**
 * Downloads a file from an authenticated endpoint. A plain <a href> can't
 * carry the Bearer token, so this fetches the bytes with auth, then triggers
 * a save via a throwaway blob URL.
 */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const { accessToken } = getTokens();
  const res = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, (payload as any)?.error || "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Opens an authenticated endpoint's content in a new tab. A plain
 * window.open(apiUrl) can't carry the Bearer token — the request would hit
 * the server with no Authorization header at all and get rejected — so this
 * fetches the bytes with auth first, then opens the result as a blob: URL.
 */
export async function apiOpenBlob(path: string): Promise<void> {
  const { accessToken } = getTokens();
  const res = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, (payload as any)?.error || "Could not open this");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  // Deliberately not revoked immediately — the new tab needs the blob: URL to
  // stay valid for as long as that tab is open.
  window.open(url, "_blank");
}

export { API_URL };
