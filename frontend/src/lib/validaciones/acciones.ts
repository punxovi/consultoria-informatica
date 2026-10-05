import { z } from 'zod';

export const estadosAccion = [
  'no_iniciada',
  'en_desarrollo',
  'cancelada',
  'cumplida',
] as const;

const uuid = (campo: string) =>
  z.string({ error: `${campo} debe ser texto.` }).uuid(`${campo} debe ser un UUID válido.`);

const textoObligatorio = (campo: string, maximo: number) =>
  z.string({ error: `${campo} debe ser texto.` })
    .trim()
    .min(1, `${campo} es obligatorio.`)
    .max(maximo, `${campo} no puede superar ${maximo} caracteres.`);

const textoOpcional = (campo: string, maximo: number) =>
  z.union([z.string({ error: `${campo} debe ser texto.` }).trim().max(maximo), z.null()])
    .transform((valor) => valor === '' ? null : valor)
    .optional();

const fechaISO = (campo: string) =>
  z.string({ error: `${campo} debe ser texto.` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} debe usar el formato AAAA-MM-DD.`)
    .refine((valor) => {
      const fecha = new Date(`${valor}T00:00:00.000Z`);
      return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
    }, `${campo} debe ser una fecha válida.`);

const camposAccionBase = z.object({
  id_plan: uuid('El plan'),
  nombre: textoObligatorio('El nombre', 150),
  responsable_nombre: textoObligatorio('El responsable', 150),
  fecha_inicio: fechaISO('La fecha de inicio'),
  fecha_termino: fechaISO('La fecha de término'),
  estado: z.enum(estadosAccion, { error: 'El estado de la acción no es válido.' }),
  descripcion: textoOpcional('La descripción', 5000),
  observacion_motivo: textoOpcional('La observación o motivo', 3000),
  resultado_esperado: textoOpcional('El resultado esperado', 5000),
}).strict();

function validarReglas(
  datos: { fecha_inicio?: string; fecha_termino?: string; estado?: string; observacion_motivo?: string | null },
  contexto: z.RefinementCtx,
  parcial = false,
) {
  if (datos.fecha_inicio && datos.fecha_termino && datos.fecha_termino < datos.fecha_inicio) {
    contexto.addIssue({
      code: 'custom',
      path: ['fecha_termino'],
      message: 'La fecha de término no puede ser anterior a la fecha de inicio.',
    });
  }
  if (datos.estado === 'cancelada' && (!parcial || datos.observacion_motivo !== undefined) && !datos.observacion_motivo?.trim()) {
    contexto.addIssue({
      code: 'custom',
      path: ['observacion_motivo'],
      message: 'Debes indicar el motivo cuando la acción está cancelada.',
    });
  }
}

export const crearAccionSchema = camposAccionBase
  .extend({ estado: z.enum(estadosAccion).default('no_iniciada') })
  .superRefine(validarReglas);

export const listarAccionesSchema = z.object({
  id_plan: uuid('El plan').optional(),
  estado: z.enum(estadosAccion, { error: 'El estado de la acción no es válido.' }).optional(),
  incluir_archivadas: z.boolean({ error: 'incluir_archivadas debe ser booleano.' }).default(false),
}).strict();

export const obtenerAccionPorIdSchema = z.object({
  id_accion: uuid('La acción'),
}).strict();

const cambiosAccionSchema = camposAccionBase.partial().superRefine((datos, contexto) => {
  if (Object.keys(datos).length === 0) {
    contexto.addIssue({ code: 'custom', message: 'Debes enviar al menos un campo para actualizar.' });
  }
  validarReglas(datos, contexto, true);
});

export const actualizarAccionSchema = z.object({
  id_accion: uuid('La acción'),
  version_esperada: z.number({ error: 'La versión esperada debe ser numérica.' })
    .int('La versión esperada debe ser entera.')
    .positive('La versión esperada debe ser mayor que cero.'),
  cambios: cambiosAccionSchema,
}).strict();

export type CrearAccionInput = z.infer<typeof crearAccionSchema>;
export type ListarAccionesInput = z.infer<typeof listarAccionesSchema>;
export type ObtenerAccionPorIdInput = z.infer<typeof obtenerAccionPorIdSchema>;
export type ActualizarAccionInput = z.infer<typeof actualizarAccionSchema>;

export function formatearErroresAccion(error: z.ZodError) {
  return error.issues.map((issue) => ({
    campo: issue.path.length ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
