import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'video/mp4', 'video/webm',
] as const;
export const MAX_EVIDENCE_BYTES = 52_428_800;
const EXTENSIONS: Record<(typeof ALLOWED_EVIDENCE_MIME_TYPES)[number], readonly string[]> = {
  'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'],
  'image/webp': ['webp'], 'audio/mpeg': ['mp3'], 'audio/ogg': ['ogg'],
  'audio/wav': ['wav'], 'video/mp4': ['mp4'], 'video/webm': ['webm'],
};

const uuid = z.string({ error: 'La acción debe ser texto.' }).uuid('La acción debe ser un UUID válido.');
const text = (label: string, max: number) => z.string({ error: `${label} debe ser texto.` })
  .trim().min(1, `${label} es obligatorio.`).max(max, `${label} no puede superar ${max} caracteres.`);
const consent = z.object({
  consentimiento_declarado: z.boolean({ error: 'El consentimiento debe ser booleano.' }),
  declaracion_consentimiento: text('La declaración de consentimiento', 5000),
}).strict();
const publication = z.enum(['no_publicada', 'publicada', 'retirada'], {
  error: 'El estado de publicación no es válido.',
});
const version = z.number({ error: 'La versión esperada debe ser numérica.' })
  .int('La versión esperada debe ser un entero positivo.')
  .positive('La versión esperada debe ser un entero positivo.');

export const createEvidenceSchema = z.object({
  id_accion: uuid,
  origen: text('El origen', 200),
  descripcion: text('La descripción', 5000),
  nombre_original: text('El nombre del archivo', 255),
  mime_type: z.enum(ALLOWED_EVIDENCE_MIME_TYPES, { error: 'El tipo de archivo no está permitido.' }),
  tamano_bytes: z.number({ error: 'El tamaño del archivo debe ser numérico.' })
    .int('El tamaño del archivo debe ser un entero.')
    .min(1, 'El archivo no puede estar vacío.')
    .max(MAX_EVIDENCE_BYTES, 'El archivo supera el límite de 50 MiB.'),
  consentimiento: consent.optional(),
}).strict().superRefine((input, context) => {
  const extension = input.nombre_original.split('.').at(-1)?.toLowerCase();
  if (!extension || !EXTENSIONS[input.mime_type].includes(extension)) {
    context.addIssue({ code: 'custom', path: ['nombre_original'],
      message: 'La extensión del archivo no corresponde al tipo declarado.' });
  }
});

export const updateEvidenceSchema = z.object({
  version_esperada: version,
  cambios: z.object({
    origen: text('El origen', 200),
    descripcion: text('La descripción', 5000),
    consentimiento: consent,
    estado_publicacion: publication,
  }).partial().strict().refine((value) => Object.keys(value).length > 0, 'Debes enviar al menos un cambio.'),
}).strict();

export const uploadEvidenceSchema = z.object({ version_esperada: version }).strict();

export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
export type EvidenceFilters = { actionId: string };
export type Evidence = {
  id_evidencia: string; id_accion: string; origen: string; descripcion: string;
  nombre_original: string; mime_type: string; tamano_bytes: number;
  estado_carga: 'reservado' | 'disponible' | 'fallido';
  estado_publicacion: 'no_publicada' | 'publicada' | 'retirada';
  consentimiento_declarado: boolean | null; declaracion_consentimiento: string | null;
  version: number; bucket_id: string; ruta_objeto: string;
  [key: string]: unknown;
};
export type EvidenceFile = { bytes: Buffer; mimeType: string; fileName: string };
export interface EvidencesRepository {
  list(token: string, filters: EvidenceFilters): Promise<Evidence[]>;
  getById(token: string, id: string): Promise<Evidence>;
  create(token: string, input: CreateEvidenceInput): Promise<Evidence>;
  update(token: string, id: string, input: UpdateEvidenceInput): Promise<Evidence>;
  upload(token: string, id: string, expectedVersion: number, bytes: Buffer, mimeType: string): Promise<Evidence>;
  download(token: string, id: string): Promise<EvidenceFile>;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ServiceError('DATOS_INVALIDOS', result.error.issues[0]?.message ?? 'Los datos de la evidencia no son válidos.', 400, {
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  });
}

export const parseCreateEvidence = (value: unknown) => parse(createEvidenceSchema, value);
export const parseUpdateEvidence = (value: unknown) => parse(updateEvidenceSchema, value);
export const parseUploadEvidence = (value: unknown) => parse(uploadEvidenceSchema, value);

export function parseEvidenceFilters(url: URL): EvidenceFilters {
  if ([...url.searchParams.keys()].some((key) => key !== 'id_accion')) {
    throw new ServiceError('DATOS_INVALIDOS', 'Solo se permite el filtro id_accion.', 400);
  }
  return { actionId: parse(uuid, url.searchParams.get('id_accion')) };
}

export function assertFileSignature(bytes: Buffer, mimeType: string): void {
  const ascii = (from: number, to: number) => bytes.toString('ascii', from, to);
  const matches: Record<string, boolean> = {
    'application/pdf': ascii(0, 5) === '%PDF-',
    'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
    'audio/mpeg': ascii(0, 3) === 'ID3' || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
    'audio/ogg': ascii(0, 4) === 'OggS',
    'audio/wav': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE',
    'video/mp4': ascii(4, 8) === 'ftyp',
    'video/webm': bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  };
  if (!matches[mimeType]) throw new ServiceError('ARCHIVO_INVALIDO', 'El contenido del archivo no corresponde al tipo declarado.', 400);
}

export function assertPublicationChange(current: Evidence, changes: UpdateEvidenceInput['cambios']): void {
  const nextState = changes.estado_publicacion ?? current.estado_publicacion;
  const consent = changes.consentimiento?.consentimiento_declarado ?? current.consentimiento_declarado;
  if (nextState === 'publicada' && current.estado_carga !== 'disponible') {
    throw new ServiceError('PUBLICACION_INVALIDA', 'Primero debes cargar el archivo antes de publicarlo.', 400);
  }
  if (nextState === 'publicada' && consent !== true) {
    throw new ServiceError('CONSENTIMIENTO_REQUERIDO', 'Para publicar se requiere consentimiento afirmativo.', 400);
  }
  if (current.estado_publicacion !== 'no_publicada' && nextState === 'no_publicada') {
    throw new ServiceError('PUBLICACION_INVALIDA', 'Una publicación previa debe conservarse como retirada.', 400);
  }
  if (current.estado_publicacion === 'no_publicada' && nextState === 'retirada') {
    throw new ServiceError('PUBLICACION_INVALIDA', 'Solo puedes retirar una evidencia publicada.', 400);
  }
}
