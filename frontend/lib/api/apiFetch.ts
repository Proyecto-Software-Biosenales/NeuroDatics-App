import { clearStoredAuthSession, getAccessToken, isAccessTokenExpired } from "@/lib/auth/sessionStore";

const BASE = "";
const API_REQUEST_TIMEOUT_MS = 5 * 60_000;
const ZIP_UPLOAD_TIMEOUT_MS = 30 * 60_000;
const BLOB_CACHE_TTL_MS = 5 * 60_000;
const BLOB_CACHE_MAX_ITEMS = 128;
const SESSION_EXPIRED_MESSAGE = "Sesion expirada. Por favor, inicia sesion nuevamente.";

type BlobCacheEntry = {
  blob: Blob;
  expiresAt: number;
};

const blobCache = new Map<string, BlobCacheEntry>();
const inflightBlobRequests = new Map<string, Promise<Blob>>();

function pruneBlobCache(now: number) {
  for (const [key, entry] of blobCache.entries()) {
    if (entry.expiresAt <= now) {
      blobCache.delete(key);
    }
  }

  while (blobCache.size > BLOB_CACHE_MAX_ITEMS) {
    const oldestKey = blobCache.keys().next().value;
    if (!oldestKey) break;
    blobCache.delete(oldestKey);
  }
}

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

function redirectToLogin(message = SESSION_EXPIRED_MESSAGE): never {
  clearStoredAuthSession();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
  throw new Error(message);
}

function ensureAccessTokenIsValid() {
  if (isAccessTokenExpired()) {
    redirectToLogin();
  }
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init;

  ensureAccessTokenIsValid();

  const token = getAccessToken();

  const headers = new Headers(requestInit.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const isForm = requestInit.body instanceof FormData;
  if (!isForm) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, { ...requestInit, headers, cache: "no-store" }, timeoutMs);
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError"
      ? `Timeout de la peticion (${Math.round(timeoutMs / 1000)}s)`
      : error instanceof Error
        ? error.message
        : "Network error";
    throw new Error(`No se pudo conectar con el backend. ${reason}`);
  }

  if (res.status === 401) {
    redirectToLogin();
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
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<T> {
  ensureAccessTokenIsValid();

  const uploadOnce = async (): Promise<Response> => {
    const token = getAccessToken();

    return new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let processingTimer: ReturnType<typeof setInterval> | null = null;
      let processingStartedAt: number | null = null;
      let settled = false;

      const finalizeReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const finalizeResolve = (response: Response) => {
        if (settled) return;
        settled = true;
        resolve(response);
      };

      const clearProcessingTimer = () => {
        if (processingTimer) {
          clearInterval(processingTimer);
          processingTimer = null;
        }
      };

      const onAbortRequest = () => {
        clearProcessingTimer();
        try {
          xhr.abort();
        } catch {
          // ignore abort errors
        }
        finalizeReject(new Error("Subida cancelada por el usuario."));
      };

      if (signal) {
        if (signal.aborted) {
          onAbortRequest();
          return;
        }
        signal.addEventListener("abort", onAbortRequest, { once: true });
      }

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
        finalizeReject(new Error("No se pudo conectar con el backend durante la subida del ZIP."));
      };
      xhr.ontimeout = () => {
        clearProcessingTimer();
        finalizeReject(new Error("La subida del ZIP excedio el tiempo de espera."));
      };
      xhr.onabort = () => {
        clearProcessingTimer();
        finalizeReject(new Error("Subida cancelada por el usuario."));
      };

      xhr.onload = () => {
        clearProcessingTimer();
        if (signal) {
          signal.removeEventListener("abort", onAbortRequest);
        }

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
        finalizeResolve(response);
      };

      xhr.send(formData);
    });
  };

  const res = await uploadOnce();

  if (res.status === 401) {
    redirectToLogin();
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

export async function apiFetchBlob(path: string, init: ApiRequestInit = {}): Promise<Blob> {
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...requestInit } = init;

  ensureAccessTokenIsValid();

  const token = getAccessToken();
  const cacheKey = `${token ?? "anon"}:${path}`;
  const now = Date.now();
  pruneBlobCache(now);

  const cached = blobCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.blob;
  }

  const inflight = inflightBlobRequests.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const headers = new Headers(requestInit.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const cacheMode = requestInit.cache ?? "default";

  const blobPromise = (async (): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${BASE}${path}`, { ...requestInit, headers, cache: cacheMode }, timeoutMs);
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? `Timeout de la peticion (${Math.round(timeoutMs / 1000)}s)`
        : error instanceof Error
          ? error.message
          : "Network error";
      throw new Error(`No se pudo conectar con el backend. ${reason}`);
    }

    if (res.status === 401) {
      redirectToLogin();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }

    const blob = await res.blob();
    blobCache.set(cacheKey, { blob, expiresAt: Date.now() + BLOB_CACHE_TTL_MS });
    pruneBlobCache(Date.now());
    return blob;
  })().finally(() => {
    inflightBlobRequests.delete(cacheKey);
  });

  inflightBlobRequests.set(cacheKey, blobPromise);

  return blobPromise;
}
