import { clearStoredAuthSession, getAccessToken, readStoredAuthSession, writeStoredAuthSession, isAccessTokenExpired } from "@/lib/auth/sessionStore";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const API_REQUEST_TIMEOUT_MS = 5 * 60_000;
const AUTH_REFRESH_TIMEOUT_MS = 15_000;
const ZIP_UPLOAD_TIMEOUT_MS = 30 * 60_000;

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

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
    const res = await fetchWithTimeout(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: session.session.refreshToken,
      }),
      cache: "no-store",
    }, AUTH_REFRESH_TIMEOUT_MS);

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

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init;

  // Proactively refresh token if expired to avoid 401 errors
  if (isAccessTokenExpired()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // Refresh failed, redirect to login
      clearStoredAuthSession();
      window.location.href = "/login";
      throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
    }
  }

  let token = getAccessToken();

  const headers: Record<string, string> = { ...(requestInit.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = requestInit.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, { ...requestInit, headers, cache: "no-store" }, timeoutMs);
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError"
      ? `Timeout de la peticion (${Math.round(timeoutMs / 1000)}s)`
      : error instanceof Error
        ? error.message
        : "Network error";
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
        const retryHeaders: Record<string, string> = { ...(requestInit.headers as any) };
        if (token) retryHeaders.Authorization = `Bearer ${token}`;
        if (!isForm) retryHeaders["Content-Type"] = "application/json";

        try {
          res = await fetchWithTimeout(`${BASE}${path}`, { ...requestInit, headers: retryHeaders, cache: "no-store" }, timeoutMs);
        } catch (error) {
          const reason = error instanceof DOMException && error.name === "AbortError"
            ? `Timeout de la peticion (${Math.round(timeoutMs / 1000)}s)`
            : error instanceof Error
              ? error.message
              : "Network error";
          throw new Error(`No se pudo conectar con el backend (${BASE}). ${reason}`);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`API ${res.status}: ${text || res.statusText}`);
        }

        return res.json() as Promise<T>;
      } else {
        // Refresh failed, redirect to login
        clearStoredAuthSession();
        window.location.href = "/login";
        throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
      }
    }

    // Other 401 error
    const text = await res.text().catch(() => "");
    // Try to parse JSON error detail
    let errorMessage = `Error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) {
        errorMessage = parsed.detail;
      }
    } catch {
      // If JSON parsing fails, use the raw text or status text
      errorMessage = text ? `Error ${res.status}: ${text}` : `Error ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Try to parse JSON error detail
    let errorMessage = `Error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) {
        errorMessage = parsed.detail;
      }
    } catch {
      // If JSON parsing fails, use the raw text or status text
      errorMessage = text ? `Error ${res.status}: ${text}` : `Error ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return res.json() as Promise<T>;
}

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  phase: "uploading" | "processing" | "completed";
  processingElapsedSeconds?: number;
};

type UploadProgressCallback = (progress: UploadProgress) => void;

export async function apiUploadFormWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: UploadProgressCallback
): Promise<T> {
  // Proactively refresh token if expired to avoid 401 errors
  if (isAccessTokenExpired()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      clearStoredAuthSession();
      window.location.href = "/login";
      throw new Error("Sesion expirada. Por favor, inicia sesion nuevamente.");
    }
  }

  const uploadOnce = async (): Promise<Response> => {
    const token = getAccessToken();

    return new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let processingTimer: ReturnType<typeof setInterval> | null = null;
      let processingStartedAt: number | null = null;

      const clearProcessingTimer = () => {
        if (processingTimer) {
          clearInterval(processingTimer);
          processingTimer = null;
        }
      };

      xhr.open("POST", `${BASE}${path}`);
      xhr.timeout = ZIP_UPLOAD_TIMEOUT_MS;
      xhr.responseType = "text";

      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent,
          phase: "uploading",
        });
      };

      xhr.upload.onload = () => {
        if (!onProgress) return;

        processingStartedAt = Date.now();
        onProgress({
          loaded: 1,
          total: 1,
          percent: 100,
          phase: "processing",
          processingElapsedSeconds: 0,
        });

        processingTimer = setInterval(() => {
          if (!processingStartedAt) return;
          const elapsedSeconds = Math.max(0, Math.round((Date.now() - processingStartedAt) / 1000));
          onProgress({
            loaded: 1,
            total: 1,
            percent: 100,
            phase: "processing",
            processingElapsedSeconds: elapsedSeconds,
          });
        }, 1000);
      };

      xhr.onerror = () => {
        clearProcessingTimer();
        reject(new Error("No se pudo conectar con el backend durante la subida del ZIP."));
      };
      xhr.ontimeout = () => {
        clearProcessingTimer();
        reject(new Error("La subida del ZIP excedio el tiempo de espera."));
      };

      xhr.onload = () => {
        clearProcessingTimer();

        if (onProgress) {
          const elapsedSeconds = processingStartedAt
            ? Math.max(0, Math.round((Date.now() - processingStartedAt) / 1000))
            : 0;
          onProgress({
            loaded: 1,
            total: 1,
            percent: 100,
            phase: "completed",
            processingElapsedSeconds: elapsedSeconds,
          });
        }

        const responseText = xhr.responseText || "";
        const response = new Response(responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
        });
        resolve(response);
      };

      xhr.send(formData);
    });
  };

  let res = await uploadOnce();

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      clearStoredAuthSession();
      window.location.href = "/login";
      throw new Error("Sesion expirada. Por favor, inicia sesion nuevamente.");
    }
    res = await uploadOnce();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let errorMessage = `Error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
        errorMessage = parsed.detail;
      } else {
        errorMessage = text ? `Error ${res.status}: ${text}` : `Error ${res.status}: ${res.statusText}`;
      }
    } catch {
      errorMessage = text ? `Error ${res.status}: ${text}` : `Error ${res.status}: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return res.json() as Promise<T>;
}