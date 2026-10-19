import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const TIPOS_RESPALDO = ['comprobante', 'acta_entrega', 'certificado', 'fotografia'] as const;
export type TipoRespaldo = (typeof TIPOS_RESPALDO)[number];

export const ALLOWED_DONATION_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_DONATION_FILE_BYTES = 52_428_800; // 50 MiB

const EXTENSIONS: Record<(typeof ALLOWED_DONATION_FILE_MIME_TYPES)[number], readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const uuid = (label: string) =>
  z.string({ error: `${label} debe ser un texto.` })
    .uuid(`${label} debe ser un UUID válido.`);

const text = (label: string, max: number) =>
  z.string({ error: `${label} debe ser un texto.` })
    .trim()
    .min(1, `${label} es obligatorio.`)
    .max(max, `${label} no puede superar ${max} caracteres.`);

export function normalizarTipoRespaldo(tipo: string): TipoRespaldo {
  const norm = tipo.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  if (norm === 'comprobante') return 'comprobante';
  if (norm === 'acta_de_entrega' || norm === 'acta_entrega') return 'acta_entrega';
  if (norm === 'certificado') return 'certificado';
  if (norm === 'fotografia') return 'fotografia';
  throw new ServiceError(
    'TIPO_RESPALDO_INVALIDO',
    'El tipo de respaldo debe ser comprobante, acta de entrega, certificado o fotografía.',
    400,
  );
}

export const createDonationSchema = z
  .object({
    id_organizacion: uuid('La organización').optional(),
    fecha: z
      .string({ error: 'La fecha debe ser un texto.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.'),
    tipo_movimiento: z.enum(['recibida', 'entregada'], {
      error: 'El tipo de movimiento debe ser recibida o entregada.',
    }),
    contraparte_nombre: text('El nombre de la contraparte', 200),
    descripcion: text('La descripción', 2000),
    tipo_aporte: z.enum(['dinero', 'recurso'], {
      error: 'El tipo de aporte debe ser dinero o recurso.',
    }),
    monto: z.number({ error: 'El monto debe ser numérico.' }).positive('El monto debe ser mayor a 0.').optional(),
    moneda: z
      .string({ error: 'La moneda debe ser un texto.' })
      .regex(/^[A-Z]{3}$/, 'La moneda debe ser un código ISO de 3 letras mayúsculas.')
      .optional(),
    cantidad: z.number({ error: 'La cantidad debe ser numérica.' }).positive('La cantidad debe ser mayor a 0.').optional(),
    unidad: z.string({ error: 'La unidad debe ser un texto.' }).trim().min(1, 'La unidad no puede estar vacía.').max(50).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.tipo_aporte === 'dinero') {
      if (data.monto === undefined || data.monto <= 0) {
        ctx.addIssue({ code: 'custom', path: ['monto'], message: 'El aporte en dinero exige un monto mayor a 0.' });
      }
      if (!data.moneda) {
        ctx.addIssue({ code: 'custom', path: ['moneda'], message: 'El aporte en dinero exige especificar la moneda (ej. CLP).' });
      }
      if (data.cantidad !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'El aporte en dinero no admite cantidad de recursos.' });
      }
      if (data.unidad !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['unidad'], message: 'El aporte en dinero no admite unidad de recursos.' });
      }
    } else {
      if (data.cantidad === undefined || data.cantidad <= 0) {
        ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'El aporte de recursos exige una cantidad mayor a 0.' });
      }
      if (!data.unidad || data.unidad.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['unidad'], message: 'El aporte de recursos exige especificar la unidad (ej. cajas, unidades).' });
      }
      if (data.monto !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['monto'], message: 'El aporte de recursos no admite monto en dinero.' });
      }
      if (data.moneda !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['moneda'], message: 'El aporte de recursos no admite moneda.' });
      }
    }
  });

export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const createDonationFileSchema = z
  .object({
    id_donacion: uuid('La donación').optional(),
    tipo_respaldo: z.string({ error: 'El tipo de respaldo es obligatorio.' }),
    descripcion: z.string().trim().max(2000, 'La descripción no puede superar 2000 caracteres.').optional(),
    nombre_original: text('El nombre del archivo', 255),
    mime_type: z.enum(ALLOWED_DONATION_FILE_MIME_TYPES, {
      error: 'El tipo de archivo no está permitido. Formatos admitidos: PDF, JPEG, PNG y WebP.',
    }),
    tamano_bytes: z
      .number({ error: 'El tamaño del archivo debe ser numérico.' })
      .int('El tamaño del archivo debe ser un entero.')
      .min(1, 'El archivo no puede estar vacío.')
      .max(MAX_DONATION_FILE_BYTES, 'El archivo supera el límite de 50 MiB.'),
  })
  .strict()
  .transform((data) => ({
    ...data,
    tipo_respaldo: normalizarTipoRespaldo(data.tipo_respaldo),
  }))
  .superRefine((input, context) => {
    const extension = input.nombre_original.split('.').at(-1)?.toLowerCase();
    if (!extension || !EXTENSIONS[input.mime_type].includes(extension)) {
      context.addIssue({
        code: 'custom',
        path: ['nombre_original'],
        message: 'La extensión del archivo no corresponde al tipo MIME declarado.',
      });
    }
  });

export type CreateDonationFileInput = z.infer<typeof createDonationFileSchema>;

export const uploadDonationFileSchema = z.object({
  version_esperada: z
    .number({ error: 'La versión esperada debe ser numérica.' })
    .int('La versión esperada debe ser un entero positivo.')
    .positive('La versión esperada debe ser un entero positivo.'),
}).strict();

export type UploadDonationFileInput = z.infer<typeof uploadDonationFileSchema>;

export type Donation = {
  id_donacion: string;
  id_organizacion: string;
  fecha: string;
  tipo_movimiento: 'recibida' | 'entregada';
  contraparte_nombre: string;
  descripcion: string;
  tipo_aporte: 'dinero' | 'recurso';
  cantidad: number | null;
  unidad: string | null;
  monto: number | null;
  moneda: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  archived_at?: string | null;
};

export type DonationFile = {
  id_archivo: string;
  id_donacion: string;
  bucket_id: string;
  ruta_objeto: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  categoria: string;
  tipo_respaldo: TipoRespaldo;
  descripcion: string | null;
  estado_carga: 'reservado' | 'disponible' | 'fallido';
  version: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  archived_at?: string | null;
};

export type DownloadedFile = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ServiceError(
    'DATOS_INVALIDOS',
    result.error.issues[0]?.message ?? 'Los datos de la donación no son válidos.',
    400,
    {
      issues: result.error.issues.map(({ path, message }) => ({ path, message })),
    },
  );
}

export const parseCreateDonation = (value: unknown): CreateDonationInput => parse(createDonationSchema, value);
export const parseCreateDonationFile = (value: unknown): CreateDonationFileInput => parse(createDonationFileSchema, value);
export const parseUploadDonationFile = (value: unknown): UploadDonationFileInput => parse(uploadDonationFileSchema, value);

export function assertFileSignature(bytes: Buffer, mimeType: string): void {
  const ascii = (from: number, to: number) => bytes.toString('ascii', from, to);
  const matches: Record<string, boolean> = {
    'application/pdf': ascii(0, 5) === '%PDF-',
    'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
  };
  if (!matches[mimeType]) {
    throw new ServiceError('ARCHIVO_INVALIDO', 'El contenido del archivo no corresponde al formato declarado.', 400);
  }
}
