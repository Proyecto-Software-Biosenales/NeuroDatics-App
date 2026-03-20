import { getAccessToken, readStoredAuthSession, writeStoredAuthSession, isAccessTokenExpired } from "@/lib/auth/sessionStore";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Attempt to refresh the access token using the refresh_token
 * Returns true if refresh was successful, false otherwise
 */
async function refreshAccessToken(): Promise<boolean> {
  const session = readStoredAuthSession();
  if (!session?.session?.refreshToken) {
    // No refresh token available, can't refresh
    return false;
  }

  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: session.session.refreshToken,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      // Refresh failed (likely refresh token also expired)
      return false;
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Update the stored session with the new access token
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.expires_in * 1000).toISOString();

    writeStoredAuthSession({
      user: session.user,
      session: {
        ...session.session,
        accessToken: data.access_token,
        expiresAt,
      },
    });

    return true;
  } catch (error) {
    // Network error or other issue during refresh
    console.error("Token refresh failed:", error);
    return false;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Proactively refresh token if expired to avoid 401 errors
  if (isAccessTokenExpired()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // Refresh failed, redirect to login
      window.location.href = "/login";
      throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
    }
  }

  let token = getAccessToken();

  const headers: Record<string, string> = { ...(init.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = init.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Network error";
    throw new Error(`No se pudo conectar con el backend (${BASE}). ${reason}`);
  }

  // Handle 401 Unauthorized with expired token
  if (res.status === 401) {
    const errorText = await res.text().catch(() => "");
    if (errorText.includes("token has expired")) {
      // Try to refresh the token
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the request with the new token
        token = getAccessToken();
        const retryHeaders: Record<string, string> = { ...(init.headers as any) };
        if (token) retryHeaders.Authorization = `Bearer ${token}`;
        if (!isForm) retryHeaders["Content-Type"] = "application/json";

        try {
          res = await fetch(`${BASE}${path}`, { ...init, headers: retryHeaders, cache: "no-store" });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Network error";
          throw new Error(`No se pudo conectar con el backend (${BASE}). ${reason}`);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`API ${res.status}: ${text || res.statusText}`);
        }

        return res.json() as Promise<T>;
      } else {
        // Refresh failed, redirect to login
        window.location.href = "/login";
        throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
      }
    }

    // Other 401 error
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}