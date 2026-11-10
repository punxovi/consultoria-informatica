import { z } from 'zod';

const uuid = (campo: string) =>
  z.string({ error: `${campo} debe ser texto.` }).uuid(`${campo} debe ser un UUID válido.`);

const textoObligatorio = (campo: string, maximo: number) =>
  z
    .string({ error: `${campo} debe ser texto.` })
    .trim()
    .min(1, `${campo} es obligatorio.`)
    .max(maximo, `${campo} no puede superar ${maximo} caracteres.`);

const fechaISO = (campo: string) =>
  z
    .string({ error: `${campo} debe ser texto.` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} debe usar el formato AAAA-MM-DD.`)
    .refine((valor) => {
      const fecha = new Date(`${valor}T00:00:00.000Z`);
      return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
    }, `${campo} debe ser una fecha válida.`);

export const PERIODO_ANUAL_MINIMO = 2000;
export const PERIODO_ANUAL_MAXIMO = 2100;
const MENSAJE_PERIODO_ANUAL = `El período anual debe ser un año de 4 dígitos entre ${PERIODO_ANUAL_MINIMO} y ${PERIODO_ANUAL_MAXIMO}.`;

const periodoAnual = z.number({ error: 'El período anual debe ser un año numérico.' })
  .int('El período anual debe ser entero.')
  .min(PERIODO_ANUAL_MINIMO, MENSAJE_PERIODO_ANUAL)
  .max(PERIODO_ANUAL_MAXIMO, MENSAJE_PERIODO_ANUAL);

// Los filtros siguen aceptando cualquier año para poder consultar registros históricos.
const periodoAnualFiltro = z.number({ error: 'El período anual debe ser un año numérico.' })
  .int('El período anual debe ser entero.')
  .min(1, 'El período anual debe ser mayor que cero.')
  .max(9999, 'El período anual no puede superar 9999.');

export const camposPlanSchema = z
  .object({
    id_organizacion: uuid('La organización'),
    id_programa: uuid('El programa'),
    nombre: textoObligatorio('El nombre', 150),
    situacion_necesidad: textoObligatorio('La situación o necesidad', 5000),
    objetivo_general: textoObligatorio('El objetivo general', 3000),
    objetivos_especificos: textoObligatorio('Los objetivos específicos', 5000),
    resultado_esperado: textoObligatorio('El resultado esperado', 5000),
    responsable_nombre: textoObligatorio('El responsable', 150),
    periodo_anual: periodoAnual,
    fecha_inicio: fechaISO('La fecha de inicio'),
    fecha_termino: fechaISO('La fecha de término'),
  })
  .strict();

function validarOrdenFechas(
  datos: { fecha_inicio?: string; fecha_termino?: string },
  contexto: z.RefinementCtx,
) {
  if (
    datos.fecha_inicio &&
    datos.fecha_termino &&
    datos.fecha_termino < datos.fecha_inicio
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['fecha_termino'],
      message: 'La fecha de término no puede ser anterior a la fecha de inicio.',
    });
  }
}

export const crearPlanSchema = camposPlanSchema.superRefine(validarOrdenFechas);

export const listarPlanesSchema = z
  .object({
    id_organizacion: uuid('La organización').optional(),
    id_programa: uuid('El programa').optional(),
    periodo_anual: periodoAnualFiltro.optional(),
    incluir_archivados: z.boolean({ error: 'incluir_archivados debe ser booleano.' }).default(false),
  })
  .strict();

export const obtenerPlanPorIdSchema = z
  .object({ id_plan: uuid('El plan') })
  .strict();

const cambiosPlanSchema = camposPlanSchema.partial().superRefine((datos, contexto) => {
  if (Object.keys(datos).length === 0) {
    contexto.addIssue({ code: 'custom', message: 'Debes enviar al menos un campo para actualizar.' });
  }
  validarOrdenFechas(datos, contexto);
});

export const actualizarPlanSchema = z
  .object({
    id_plan: uuid('El plan'),
    version_esperada: z
      .number({ error: 'La versión esperada debe ser numérica.' })
      .int('La versión esperada debe ser entera.')
      .positive('La versión esperada debe ser mayor que cero.'),
    cambios: cambiosPlanSchema,
  })
  .strict();

export type CrearPlanInput = z.infer<typeof crearPlanSchema>;
export type ActualizarPlanInput = z.infer<typeof actualizarPlanSchema>;
export type ListarPlanesInput = z.infer<typeof listarPlanesSchema>;
export type ObtenerPlanPorIdInput = z.infer<typeof obtenerPlanPorIdSchema>;

export interface ErrorValidacionPlan {
  campo: string;
  codigo: string;
  mensaje: string;
}

export function formatearErroresPlan(error: z.ZodError): ErrorValidacionPlan[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
