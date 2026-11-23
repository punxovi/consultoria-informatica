import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Debe ser un UUID válido.' }
);

const fechaIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'La fecha de medición debe tener el formato YYYY-MM-DD.',
}).refine((val) => {
  const fecha = new Date(val);
  const hoy = new Date();
  return !isNaN(fecha.getTime()) && fecha <= hoy;
}, {
  message: 'La fecha de medición no puede ser una fecha futura.',
});

export const crearResultadoZodSchema = z.object({
  id_indicador: uuidSchema,
  valor_medido: z.number({ message: 'El valor medido es obligatorio y debe ser numérico.' }).nonnegative({ message: 'El valor medido no puede ser negativo.' }),
  fecha_medicion: fechaIsoSchema,
  observaciones: z.string().trim().max(1000, { message: 'Las observaciones no pueden superar los 1000 caracteres.' }).nullable().optional(),
}).strict();

export const actualizarResultadoZodSchema = z.object({
  version_esperada: z.number().int().min(1, { message: 'La versión esperada debe ser un entero mayor que cero.' }).optional(),
  cambios: z.object({
    valor_medido: z.number().nonnegative({ message: 'El valor medido no puede ser negativo.' }).optional(),
    fecha_medicion: fechaIsoSchema.optional(),
    observaciones: z.string().trim().max(1000).nullable().optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar.',
  }),
}).strict();

export type CamposResultado = z.infer<typeof crearResultadoZodSchema>;

function errorZod(error: z.ZodError): never {
  const issue = error.issues[0];
  const camino = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new ServiceError('DATOS_INVALIDOS', `${issue?.message ?? 'Los datos no son válidos.'}${camino}`, 400);
}

export function parseCamposResultado(value: unknown): CamposResultado {
  const resultado = crearResultadoZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return resultado.data as CamposResultado;
}