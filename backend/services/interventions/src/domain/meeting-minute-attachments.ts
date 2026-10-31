
import { z } from 'zod';

export const MEETING_MINUTE_ATTACHMENT_MAX_BYTES = 52_428_800;

export const MEETING_MINUTE_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/webm',
] as const;

export const meetingMinuteAttachmentStatusSchema = z.enum([
  'reservado',
  'disponible',
  'fallido',
]);

export type MeetingMinuteAttachmentStatus =
  z.infer<typeof meetingMinuteAttachmentStatusSchema>;

export const createMeetingMinuteAttachmentSchema = z.object({
  id_acta: z.string().uuid(),
  nombre_original: z.string().trim().min(1).max(255),
  mime_type: z.enum(MEETING_MINUTE_ATTACHMENT_MIME_TYPES),
  tamano_bytes: z.number()
    .int()
    .min(1)
    .max(MEETING_MINUTE_ATTACHMENT_MAX_BYTES),
});

export type CreateMeetingMinuteAttachmentInput =
  z.infer<typeof createMeetingMinuteAttachmentSchema>;

export type MeetingMinuteAttachment = {
  id_adjunto: string;
  id_acta: string;
  bucket_id: 'fge-evidencias';
  ruta_objeto: string;
  nombre_original: string;
  mime_type: typeof MEETING_MINUTE_ATTACHMENT_MIME_TYPES[number];
  tamano_bytes: number;
  estado_carga: MeetingMinuteAttachmentStatus;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type MeetingMinuteAttachmentFile = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

export type MeetingMinuteAttachmentFilters = {
  id_acta: string;
};

export interface MeetingMinuteAttachmentsRepository {
  list(
    token: string,
    filters: MeetingMinuteAttachmentFilters,
  ): Promise<MeetingMinuteAttachment[]>;

  getById(
    token: string,
    id: string,
  ): Promise<MeetingMinuteAttachment>;

  create(
    token: string,
    input: CreateMeetingMinuteAttachmentInput,
  ): Promise<MeetingMinuteAttachment>;

  upload(
    token: string,
    id: string,
    expectedVersion: number,
    bytes: Buffer,
    mimeType: string,
  ): Promise<MeetingMinuteAttachment>;

  download(
    token: string,
    id: string,
  ): Promise<MeetingMinuteAttachmentFile>;

  delete(
    token: string,
    id: string,
  ): Promise<void>;
}
 
export function parseCreateMeetingMinuteAttachment(
  input: unknown,
): CreateMeetingMinuteAttachmentInput {
  return createMeetingMinuteAttachmentSchema.parse(input);
}
