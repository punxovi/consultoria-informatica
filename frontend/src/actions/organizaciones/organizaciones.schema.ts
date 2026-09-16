import { z } from 'zod';

const TIPOS_ORGANIZACION = [
  'comedor_merendero',
  'centro_comunitario',
  'emprendimiento_uv',
  'otra',
] as const;

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

export const tipoOrganizacionSchema = z.enum(TIPOS_ORGANIZACION, {
  error:
    'El tipo de organización debe ser comedor_merendero, centro_comunitario, emprendimiento_uv u otra.',
});

/** Campos persistibles compartidos por las Actions de creación y actualización. */
export const camposOrganizacionSchema = z
  .object({
    id_pais: uuid('El país'),
    nombre: textoObligatorio('El nombre', 150),
    nombre_representante: textoObligatorio('El nombre del representante', 150),
    telefono: textoObligatorio('El teléfono', 30).regex(
      /^[+0-9() .-]{6,30}$/,
      'El teléfono contiene caracteres no permitidos.',
    ),
    correo: z
      .string({ error: 'El correo debe ser texto.' })
      .trim()
      .email('El correo debe tener un formato válido.')
      .max(254, 'El correo no puede superar 254 caracteres.')
      .transform((value) => value.toLowerCase()),
    region_departamento: textoObligatorio('La región o departamento', 120),
    comuna_municipio_ciudad: textoObligatorio(
      'La comuna, municipio o ciudad',
      120,
    ),
    direccion: textoObligatorio('La dirección', 250),
    publico_objetivo: textoObligatorio('El público objetivo', 500),
    descripcion_breve: textoObligatorio('La descripción', 1000),
    tipo_organizacion: tipoOrganizacionSchema,
    tipo_organizacion_otro: z
      .string({ error: 'El otro tipo de organización debe ser texto.' })
      .trim()
      .min(2, 'El otro tipo de organización debe tener al menos 2 caracteres.')
      .max(100, 'El otro tipo de organización no puede superar 100 caracteres.')
      .nullable()
      .optional(),
    numero_beneficiarios: z
      .number({ error: 'El número de beneficiarios debe ser numérico.' })
      .int('El número de beneficiarios debe ser entero.')
      .min(0, 'El número de beneficiarios no puede ser negativo.')
      .max(
        10_000_000,
        'El número de beneficiarios no puede superar 10000000.',
      ),
  })
  .strict('No se permiten campos adicionales en la organización.');

function validarTipoOtro(
  datos: {
    tipo_organizacion?: (typeof TIPOS_ORGANIZACION)[number];
    tipo_organizacion_otro?: string | null;
  },
  contexto: z.RefinementCtx,
) {
  if (
    datos.tipo_organizacion === 'otra' &&
    !datos.tipo_organizacion_otro
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['tipo_organizacion_otro'],
      message: 'Debes especificar el otro tipo de organización.',
    });
  }

  if (
    datos.tipo_organizacion !== undefined &&
    datos.tipo_organizacion !== 'otra' &&
    datos.tipo_organizacion_otro
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['tipo_organizacion_otro'],
      message:
        'El otro tipo solo se utiliza cuando el tipo de organización es otra.',
    });
  }
}

/** Schema Zod completo de una Organización nueva. */
export const organizacionSchema = camposOrganizacionSchema.superRefine(
  validarTipoOtro,
);

export const listarOrganizacionesSchema = z
  .object({
    id_pais: uuid('El país').optional(),
    incluir_archivadas: z
      .boolean({ error: 'incluir_archivadas debe ser booleano.' })
      .default(false),
  })
  .strict('No se permiten filtros adicionales.');

export const obtenerOrganizacionPorIdSchema = z
  .object({
    id_organizacion: uuid('La organización'),
  })
  .strict('No se permiten campos adicionales.');

export const crearOrganizacionSchema = organizacionSchema;

const cambiosOrganizacionSchema = camposOrganizacionSchema
  .partial()
  .superRefine((datos, contexto) => {
    if (Object.keys(datos).length === 0) {
      contexto.addIssue({
        code: 'custom',
        message: 'Debes enviar al menos un campo para actualizar.',
      });
    }

    validarTipoOtro(datos, contexto);
  });

export const actualizarOrganizacionSchema = z
  .object({
    id_organizacion: uuid('La organización'),
    version_esperada: z
      .number({ error: 'La versión esperada debe ser numérica.' })
      .int('La versión esperada debe ser entera.')
      .positive('La versión esperada debe ser mayor que cero.')
      .optional(),
    cambios: cambiosOrganizacionSchema,
  })
  .strict('No se permiten campos adicionales.');

export type ListarOrganizacionesInput = z.infer<
  typeof listarOrganizacionesSchema
>;
export type ObtenerOrganizacionPorIdInput = z.infer<
  typeof obtenerOrganizacionPorIdSchema
>;
export type CrearOrganizacionActionInput = z.infer<
  typeof crearOrganizacionSchema
>;
export type ActualizarOrganizacionActionInput = z.infer<
  typeof actualizarOrganizacionSchema
>;

export interface ErrorValidacionOrganizacion {
  campo: string;
  codigo: string;
  mensaje: string;
}

/** Convierte ZodError a una estructura estable para formularios y pruebas. */
export function formatearErroresOrganizacion(
  error: z.ZodError,
): ErrorValidacionOrganizacion[] {
  return error.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : '_entrada',
    codigo: issue.code,
    mensaje: issue.message,
  }));
}
