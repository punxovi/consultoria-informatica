import { z } from 'zod';

const MAXIMO_LINEAS_ACCION = 50;

const uuid = (campo: string) =>
  z
    .string({ error: `${campo} debe ser texto.` })
    .uuid(`${campo} debe ser un UUID válido.`);

const textoObligatorio = (campo: string, maximo: number) =>
  z
    .string({ error: `${campo} debe ser texto.` })
    .trim()
    .min(1, `${campo} es obligatorio.`)
    .max(maximo, `${campo} no puede superar ${maximo} caracteres.`);

/**
 * Mantiene unida cada línea de acción con el resultado que debe producir.
 * Así las Actions no pueden recibir dos listas con posiciones desalineadas.
 */
export const lineaAccionProgramaSchema = z
  .object({
    linea_accion: textoObligatorio('La línea de acción', 500),
    resultado_esperado: textoObligatorio('El resultado esperado', 2000),
  })
  .strict('No se permiten campos adicionales en la línea de acción.');

const lineasAccionProgramaSchema = z
  .array(lineaAccionProgramaSchema, {
    error: 'Las líneas de acción deben enviarse como una lista.',
  })
  .min(1, 'El programa debe incluir al menos una línea de acción.')
  .max(
    MAXIMO_LINEAS_ACCION,
    `El programa no puede incluir más de ${MAXIMO_LINEAS_ACCION} líneas de acción.`,
  );

/** Campos editables que comparten la creación y la actualización. */
export const camposProgramaSchema = z
  .object({
    nombre: textoObligatorio('El nombre', 150),
    descripcion: textoObligatorio('La descripción', 5000),
    objetivo_general: textoObligatorio('El objetivo general', 3000),
    objetivos_especificos: textoObligatorio(
      'Los objetivos específicos',
      5000,
    ),
    lineas_accion: lineasAccionProgramaSchema,
    referencias_ods: z.string().trim().max(2000, 'Las referencias ODS no pueden superar 2000 caracteres.').optional(),
    referencias_esg: z.string().trim().max(2000, 'Las referencias ESG no pueden superar 2000 caracteres.').optional(),
  })
  .strict('No se permiten campos adicionales en el programa.');

function validarLineasUnicas(
  datos: { lineas_accion?: Array<{ linea_accion: string }> },
  contexto: z.RefinementCtx,
) {
  if (!datos.lineas_accion) return;

  const posiciones = new Map<string, number>();

  datos.lineas_accion.forEach(({ linea_accion }, indice) => {
    const clave = linea_accion.trim().toLocaleLowerCase('es');
    const primeraPosicion = posiciones.get(clave);

    if (primeraPosicion !== undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['lineas_accion', indice, 'linea_accion'],
        message: `La línea de acción está repetida; ya fue incluida en la posición ${primeraPosicion + 1}.`,
      });
      return;
    }

    posiciones.set(clave, indice);
  });
}

/** Schema completo que debe utilizar la Action de creación de Programas. */
export const crearProgramaSchema = camposProgramaSchema.superRefine(
  validarLineasUnicas,
);

/** El listado no admite filtros hasta que el producto los defina. */
export const listarProgramasSchema = z
  .object({})
  .strict('No se permiten filtros adicionales.');

/** Identificador utilizado por la Action de detalle. */
export const obtenerProgramaPorIdSchema = z
  .object({
    id_programa: uuid('El programa'),
  })
  .strict('No se permiten campos adicionales.');

const cambiosProgramaSchema = camposProgramaSchema
  .partial()
  .superRefine((datos, contexto) => {
    if (Object.keys(datos).length === 0) {
      contexto.addIssue({
        code: 'custom',
        message: 'Debes enviar al menos un campo para actualizar.',
      });
    }

    validarLineasUnicas(datos, contexto);
  });

/** Schema que debe utilizar la Action de actualización de Programas. */
export const actualizarProgramaSchema = z
  .object({
    id_programa: uuid('El programa'),
    version_esperada: z
      .number({ error: 'La versión esperada debe ser numérica.' })
      .int('La versión esperada debe ser entera.')
      .positive('La versión esperada debe ser mayor que cero.')
      .optional(),
    cambios: cambiosProgramaSchema,
  })
  .strict('No se permiten campos adicionales.');

export type LineaAccionProgramaInput = z.infer<
  typeof lineaAccionProgramaSchema
>;
export const archivarProgramaSchema = z.object({
  id_programa: uuid('El programa'),
  version_esperada: z.number().int().positive(),
}).strict('No se permiten campos adicionales.');

export type ListarProgramasInput = z.infer<typeof listarProgramasSchema>;
export type ObtenerProgramaPorIdInput = z.infer<
  typeof obtenerProgramaPorIdSchema
>;
export type CrearProgramaInput = z.infer<typeof crearProgramaSchema>;
export type ActualizarProgramaInput = z.infer<
  typeof actualizarProgramaSchema
>;

export interface ErrorValidacionPrograma {
  campo: string;
  codigo: string;
  mensaje: string;
}

/** Convierte ZodError a una respuesta estable para formularios y Actions. */
export function formatearErroresPrograma(
  error: z.ZodError,
): ErrorValidacionPrograma[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
