import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Debe ser un UUID válido.' }
);

export const crearIndicadorZodSchema = z.object({
  id_accion: uuidSchema,
  nombre: z.string().trim().min(1, { message: 'El nombre del indicador es obligatorio.' }).max(150, { message: 'El nombre no puede superar los 150 caracteres.' }),
  descripcion: z.string().trim().max(1000, { message: 'La descripción no puede superar los 1000 caracteres.' }).nullable().optional(),
  unidad_medida: z.string().trim().min(1, { message: 'La unidad de medida es obligatoria.' }).max(50),
  meta: z.number({ message: 'La meta debe ser un valor numérico.' }).nonnegative({ message: 'La meta no puede ser un valor negativo.' }).nullable().optional(),
  criterio_medicion: z.string().trim().max(500).nullable().optional(),
}).strict();

export const asociarIndicadorAccionZodSchema = z.object({
  id_accion: uuidSchema,
  id_indicador: uuidSchema,
  meta: z.number({ message: 'La meta es obligatoria y debe ser un valor numérico.' }).nonnegative({ message: 'La meta no puede ser un valor negativo.' }),
}).strict();

export const actualizarIndicadorZodSchema = z.object({
  version_esperada: z.number().int().min(1, { message: 'La versión esperada debe ser un entero mayor que cero.' }).optional(),
  cambios: z.object({
    nombre: z.string().trim().min(1).max(150).optional(),
    descripcion: z.string().trim().max(1000).nullable().optional(),
    unidad_medida: z.string().trim().min(1).max(50).optional(),
    meta: z.number().nonnegative({ message: 'La meta no puede ser un valor negativo.' }).nullable().optional(),
    criterio_medicion: z.string().trim().max(500).nullable().optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar.',
  }),
}).strict();

export type CamposIndicador = z.infer<typeof crearIndicadorZodSchema>;
export type CamposAsociacionIndicador = z.infer<typeof asociarIndicadorAccionZodSchema>;

function errorZod(error: z.ZodError): never {
  const issue = error.issues[0];
  const camino = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new ServiceError('DATOS_INVALIDOS', `${issue?.message ?? 'Los datos no son válidos.'}${camino}`, 400);
}

export function parseCamposIndicador(value: unknown): CamposIndicador {
  const resultado = crearIndicadorZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return resultado.data as CamposIndicador;
}

export function parseAsociacionIndicador(value: unknown): CamposAsociacionIndicador {
  const resultado = asociarIndicadorAccionZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return resultado.data as CamposAsociacionIndicador;
}