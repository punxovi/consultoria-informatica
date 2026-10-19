import { z } from 'zod';

export const MAX_BYTES = 52_428_800; // 50 MiB

export const tiposArchivos = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
} as const;

export const accept = '.pdf,.jpg,.jpeg,.png,.webp';

export const TIPOS_RESPALDO = ['comprobante', 'acta_entrega', 'certificado', 'fotografia'] as const;
export type TipoRespaldo = (typeof TIPOS_RESPALDO)[number];

export const etiquetasTipoRespaldo: Record<TipoRespaldo, string> = {
  comprobante: 'Comprobante',
  acta_entrega: 'Acta de entrega',
  certificado: 'Certificado',
  fotografia: 'Fotografía',
};

export function normalizarTipoRespaldo(tipo: string): TipoRespaldo {
  const norm = tipo.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  if (norm === 'comprobante') return 'comprobante';
  if (norm === 'acta_de_entrega' || norm === 'acta_entrega') return 'acta_entrega';
  if (norm === 'certificado') return 'certificado';
  if (norm === 'fotografia') return 'fotografia';
  throw new Error('El tipo de respaldo debe ser comprobante, acta de entrega, certificado o fotografía.');
}

export function tipoArchivo(file: Pick<File, 'name' | 'type' | 'size'>): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const tipo = Object.entries(tiposArchivos).find(([, extensiones]) =>
    (extensiones as readonly string[]).includes(extension ?? '')
  )?.[0];

  if (!tipo || (file.type && file.type !== tipo)) {
    throw new Error('El formato del archivo debe ser PDF, JPG, PNG o WebP.');
  }
  if (!file.size || file.size <= 0) {
    throw new Error('El archivo seleccionado está vacío.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('El archivo supera el límite de 50 MiB.');
  }
  if (file.name.length > 255) {
    throw new Error('El nombre del archivo no puede superar 255 caracteres.');
  }
  return tipo;
}

export const donacionFormSchema = z
  .object({
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingresa una fecha válida (AAAA-MM-DD).'),
    tipo_movimiento: z.enum(['recibida', 'entregada'], {
      error: 'Selecciona si la donación fue recibida o entregada.',
    }),
    contraparte_nombre: z
      .string()
      .trim()
      .min(1, 'Indica el nombre de la contraparte o donante.')
      .max(200, 'El nombre no puede superar 200 caracteres.'),
    descripcion: z
      .string()
      .trim()
      .min(1, 'Describe la donación.')
      .max(2000, 'La descripción no puede superar 2000 caracteres.'),
    tipo_aporte: z.enum(['dinero', 'recurso'], {
      error: 'Selecciona si el aporte es en dinero o en recursos.',
    }),
    monto: z.number().positive('El monto debe ser mayor a cero.').optional(),
    moneda: z.string().trim().regex(/^[A-Z]{3}$/, 'La moneda debe ser un código de 3 letras (ej. CLP).').optional(),
    cantidad: z.number().positive('La cantidad debe ser mayor a cero.').optional(),
    unidad: z.string().trim().min(1, 'Especifica la unidad de medida (ej. cajas, kg).').max(50).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.tipo_aporte === 'dinero') {
      if (!d.monto || d.monto <= 0) {
        ctx.addIssue({ code: 'custom', path: ['monto'], message: 'El aporte en dinero exige un monto mayor a 0.' });
      }
      if (!d.moneda) {
        ctx.addIssue({ code: 'custom', path: ['moneda'], message: 'Indica la moneda del aporte (ej. CLP).' });
      }
    } else {
      if (!d.cantidad || d.cantidad <= 0) {
        ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'El aporte en recursos exige una cantidad mayor a 0.' });
      }
      if (!d.unidad) {
        ctx.addIssue({ code: 'custom', path: ['unidad'], message: 'Indica la unidad de medida (ej. cajas).' });
      }
    }
  });

export type DatosDonacionForm = z.infer<typeof donacionFormSchema>;

export const respaldoFormSchema = z.object({
  tipo_respaldo: z.enum(TIPOS_RESPALDO, {
    error: 'Selecciona un tipo de respaldo válido (comprobante, acta de entrega, certificado o fotografía).',
  }),
  descripcion: z.string().trim().max(2000).optional(),
});

export type DatosRespaldoForm = z.infer<typeof respaldoFormSchema>;

export const donacionSchema = z.object({
  id_donacion: z.string().uuid(),
  id_organizacion: z.string().uuid(),
  fecha: z.string(),
  tipo_movimiento: z.enum(['recibida', 'entregada']),
  contraparte_nombre: z.string(),
  descripcion: z.string(),
  tipo_aporte: z.enum(['dinero', 'recurso']),
  cantidad: z.number().nullable().optional(),
  unidad: z.string().nullable().optional(),
  monto: z.number().nullable().optional(),
  moneda: z.string().nullable().optional(),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Donacion = z.infer<typeof donacionSchema>;

export const respaldoSchema = z.object({
  id_archivo: z.string().uuid(),
  id_donacion: z.string().uuid(),
  bucket_id: z.string(),
  ruta_objeto: z.string(),
  nombre_original: z.string(),
  mime_type: z.string(),
  tamano_bytes: z.number().int().positive(),
  categoria: z.string(),
  tipo_respaldo: z.enum(TIPOS_RESPALDO),
  descripcion: z.string().nullable().optional(),
  estado_carga: z.enum(['reservado', 'disponible', 'fallido']),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type RespaldoDonacion = z.infer<typeof respaldoSchema>;

export type ReservaRespaldo = {
  id_donacion?: string;
  tipo_respaldo: TipoRespaldo;
  descripcion?: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
};
