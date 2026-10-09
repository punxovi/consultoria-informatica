import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const ESTADOS_COMPROMISO = ['pendiente', 'en_proceso', 'cumplido', 'cancelado'] as const;
export type EstadoCompromiso = typeof ESTADOS_COMPROMISO[number];

export interface Compromiso {
  id_compromiso: string;
  id_organizacion: string;
  id_acta: string | null;
  descripcion: string;
  responsable_nombre: string;
  id_contacto_responsable: string | null;
  fecha_limite: string;
  estado: EstadoCompromiso;
  observaciones: string | null;
  version: number;
  cumplido_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Debe ser un UUID válido.' }
);

const fechaIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'La fecha límite debe tener el formato YYYY-MM-DD.',
});

const crearCompromisoZodSchema = z.object({
  id_acta: uuidSchema.nullable().optional(),
  descripcion: z.string().trim().min(1, { message: 'La descripción del compromiso es obligatoria.' }).max(1000, { message: 'La descripción no puede superar los 1000 caracteres.' }),
  responsable_nombre: z.string().trim().min(1, { message: 'El nombre del responsable es obligatorio.' }).max(150, { message: 'El nombre del responsable no puede superar los 150 caracteres.' }),
  id_contacto_responsable: uuidSchema.nullable().optional(),
  fecha_limite: fechaIsoSchema,
  observaciones: z.string().trim().max(1000, { message: 'Las observaciones no pueden superar los 1000 caracteres.' }).nullable().optional(),
}).strict();

const actualizarCompromisoZodSchema = z.object({
  version_esperada: z.number().int().min(1, { message: 'La versión esperada debe ser un entero mayor que cero.' }).optional(),
  cambios: z.object({
    id_acta: uuidSchema.nullable().optional(),
    descripcion: z.string().trim().min(1, { message: 'La descripción es obligatoria.' }).max(1000).optional(),
    responsable_nombre: z.string().trim().min(1, { message: 'El nombre del responsable es obligatorio.' }).max(150).optional(),
    id_contacto_responsable: uuidSchema.nullable().optional(),
    fecha_limite: fechaIsoSchema.optional(),
    estado: z.enum(ESTADOS_COMPROMISO, { message: 'El estado del compromiso no es válido.' }).optional(),
    observaciones: z.string().trim().max(1000).nullable().optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar.',
  }),
}).strict();

export type CamposCompromiso = z.infer<typeof crearCompromisoZodSchema>;

export interface ActualizarCompromisoInput {
  versionEsperada?: number;
  cambios: z.infer<typeof actualizarCompromisoZodSchema>['cambios'];
}

function errorZod(error: z.ZodError): never {
  const issue = error.issues[0];
  const camino = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new ServiceError('DATOS_INVALIDOS', `${issue?.message ?? 'Los datos no son válidos.'}${camino}`, 400);
}

export function parseCamposCompromiso(value: unknown): CamposCompromiso {
  const resultado = crearCompromisoZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return resultado.data as CamposCompromiso;
}

export function parseActualizarCompromisoInput(value: unknown): ActualizarCompromisoInput {
  const resultado = actualizarCompromisoZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return {
    versionEsperada: resultado.data.version_esperada,
    cambios: resultado.data.cambios as ActualizarCompromisoInput['cambios'],
  };
}