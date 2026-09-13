import { useCallback, useEffect, useRef } from "react";
import { ProjectsApi, type ApiDriveUploadProgress } from "../api/projectsApi";

/** One browser operation, including packaging, transfer and follow-up reads. */
export const useZipUploadAttempt = (scope?: string) => {
  const active = useRef<ReturnType<typeof createAttempt> | null>(null);
  const reset = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.cancel();
  }, []);
  useEffect(() => reset, [reset, scope]);

  const begin = () => {
    if (active.current) return null;
    const attempt = createAttempt(() => active.current === attempt);
    active.current = attempt;
    return attempt;
  };
  const finish = (attempt: NonNullable<typeof active.current>) => {
    attempt.stopPolling();
    if (active.current === attempt) active.current = null;
  };
  return { begin, finish, reset, cancel: () => active.current?.cancel() };
};

function createAttempt(isCurrent: () => boolean) {
  // getRandomValues also works for local HTTP installations where randomUUID
  // is unavailable. Every request, poll and cancel uses this same UUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const controller = new AbortController();
  let projectId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollingController: AbortController | null = null;
  let cancelRequested = false;
  const stopPolling = () => {
    clearTimeout(timer);
    pollingController?.abort();
    pollingController = null;
  };
  return {
    id,
    signal: controller.signal,
    isCurrent,
    assertActive() {
      if (!isCurrent() || controller.signal.aborted) {
        throw new Error("Subida cancelada por el usuario.");
      }
    },
    markRequestStarted(value: string) { projectId = value; },
    markRequestCompleted() { projectId = null; stopPolling(); },
    stopPolling,
    cancel() {
      stopPolling();
      controller.abort();
      if (projectId && !cancelRequested) {
        cancelRequested = true;
        void ProjectsApi.cancelZipUpload(projectId, id).catch((error: unknown) => {
          console.warn("[Upload] backend cancel request failed", error);
        });
      }
    },
    startPolling(value: string, onSnapshot: (snapshot: ApiDriveUploadProgress) => void) {
      stopPolling();
      const pollController = new AbortController();
      pollingController = pollController;
      let previous: { bytes: number; time: number } | null = null;
      const canPoll = () => isCurrent() && !controller.signal.aborted && !pollController.signal.aborted;
      const poll = async () => {
        if (!canPoll()) return;
        try {
          const snapshot = await ProjectsApi.getZipUploadProgress(value, id, pollController.signal);
          if (!canPoll()) return;
          // Explicit mismatches are ignored even if an intermediary returns a
          // cached snapshot. An omitted ID supports older API deployments.
          if (!snapshot.upload_id || snapshot.upload_id === id) {
            const now = Date.now();
            const normalized = normalizeProgress(snapshot, previous, now);
            previous = { bytes: normalized.uploaded_bytes, time: now };
            onSnapshot(normalized);
          }
        } catch (error) {
          if (canPoll()) console.warn("[Upload] progress poll failed", error);
        } finally {
          // Serial polling prevents slow responses from piling up or arriving
          // out of order. The upload response remains the outcome authority.
          if (canPoll()) timer = setTimeout(() => void poll(), 1000);
        }
      };
      timer = setTimeout(() => void poll(), 1000);
    },
  };
}

function normalizeProgress(
  snapshot: ApiDriveUploadProgress,
  previous: { bytes: number; time: number } | null,
  now: number,
): ApiDriveUploadProgress {
  const nonnegative = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) && value >= 0 ? value : null;
  const total = nonnegative(snapshot.total_bytes) ?? 0;
  const uploaded = nonnegative(snapshot.uploaded_bytes) ?? 0;
  const sampledSpeed = previous && now > previous.time
    ? Math.max(0, uploaded - previous.bytes) / ((now - previous.time) / 1000) / (1024 * 1024)
    : null;
  const speed = nonnegative(snapshot.speed_mbps) ?? sampledSpeed;
  const eta = nonnegative(snapshot.eta_seconds) ?? (
    speed && speed > 0 ? Math.max(0, Math.round((total - uploaded) / (speed * 1024 * 1024))) : null
  );
  return {
    ...snapshot,
    total_bytes: total,
    uploaded_bytes: uploaded,
    percent: Math.min(100, nonnegative(snapshot.percent) ?? (total > 0 ? Math.round(uploaded / total * 100) : 0)),
    speed_mbps: speed,
    eta_seconds: eta,
    elapsed_seconds: nonnegative(snapshot.elapsed_seconds) ?? 0,
  };
}
