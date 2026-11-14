import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { ESTADOS_COMPROMISO } from './compromisos.ts';

export const MAX_PDF_COMMITMENTS = 500;
const date = z.iso.date();
const optionalText = (max: number) => z.string().max(max).nullable();

/** Proyección validada de los registros persistidos, no de datos del cliente. */
export const pdfCommitmentSchema = z.object({
  id_compromiso: z.uuid(),
  id_organizacion: z.uuid(),
  id_acta: z.uuid(),
  descripcion: z.string().trim().min(1).max(2000),
  responsable_nombre: z.string().trim().min(1).max(150),
  responsable_contacto: optionalText(300),
  fecha_limite: date,
  estado: z.enum(ESTADOS_COMPROMISO),
  observaciones: optionalText(2000),
  cumplido_at: z.iso.datetime({ offset: true }).nullable(),
  archived_at: z.null(),
}).refine(item => (item.estado === 'cumplido') === (item.cumplido_at !== null));

const contextSchema = z.object({
  id_organizacion: z.uuid(),
  id_acta: z.uuid().optional(),
}).strict();

export type CommitmentsPdfContext = z.infer<typeof contextSchema>;
export type PdfCommitment = z.infer<typeof pdfCommitmentSchema>;
export interface CommitmentsPdfDocument {
  organization: { id_organizacion: string; nombre: string; pais?: { nombre: string } | null };
  context: CommitmentsPdfContext;
  commitments: PdfCommitment[];
  /** Nombre legible de cada acta de origen («Acta del AAAA-MM-DD: título»), si está disponible. */
  actas?: Record<string, string>;
  /** Momento de generación (ISO); por defecto, el instante actual. */
  generatedAt?: string;
}
export interface CommitmentsPdfFile {
  bytes: Buffer;
  fileName: string;
  mimeType: 'application/pdf';
}
export type CommitmentsPdfRenderer = (document: CommitmentsPdfDocument) => Promise<Buffer>;

export function parseCommitmentsPdfContext(value: unknown): CommitmentsPdfContext {
  const result = contextSchema.safeParse(value);
  if (!result.success) {
    throw new ServiceError('DATOS_INVALIDOS', 'Indica una organización y un acta de filtro válidas.', 400);
  }
  return result.data;
}

export function parseCommitmentsPdfQuery(orgId: string, params: URLSearchParams): CommitmentsPdfContext {
  for (const key of params.keys()) {
    if (key !== 'id_acta' || params.getAll(key).length !== 1) {
      throw new ServiceError('DATOS_INVALIDOS', 'Solo se admite un filtro id_acta en la descarga.', 400);
    }
  }
  return parseCommitmentsPdfContext({
    id_organizacion: orgId,
    ...(params.has('id_acta') ? { id_acta: params.get('id_acta') } : {}),
  });
}
