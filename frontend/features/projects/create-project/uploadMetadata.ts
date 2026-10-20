import type { UploadedProjectZip } from "../types";
import { isSensorType } from "../projectMapping";
import { newParticipantData, type ParticipantData } from "./types";

export function detectedUploadMetadata(upload: UploadedProjectZip, previous: ParticipantData[]) {
  const existing = new Map(previous.map((participant) => [participant.id, participant]));
  const codes = upload.participants?.length
    ? [...upload.participants].sort((a, b) => a.user_index - b.user_index).map((participant) => participant.participant_code)
    : upload.acquisition?.default_participant_codes ?? [];
  return {
    sensors: (upload.detected_sensors ?? []).filter(isSensorType),
    participants: [...new Set(codes)].map((id): ParticipantData => (
      existing.get(id) ?? newParticipantData(id)
    )),
  };
}
