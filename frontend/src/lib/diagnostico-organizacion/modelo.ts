import { z } from 'zod';

const texto = (max: number) =>
  z.string().trim().max(max, `No puede superar ${max} caracteres.`);

const textoObligatorio = (max: number) =>
  texto(max).min(1, 'Este campo es obligatorio.');

export const camposDiagnosticoSchema = z
  .object({
    mision: textoObligatorio(500),

    vision: textoObligatorio(500),

    tiene_espacio_fisico: z.boolean().nullable(),

    caracteristicas_infraestructura: textoObligatorio(500),

    espacios_disponibles: textoObligatorio(500),

    recursos_existentes: textoObligatorio(500),

    danos_detectados: textoObligatorio(500),

    necesidades_prioritarias: textoObligatorio(500),

    observaciones: textoObligatorio(1000),

    raciones: z
      .number()
      .int('Debe ser un número entero.')
      .min(0, 'No puede ser menor que 0.')
      .max(2147483647, 'La cantidad de raciones es demasiado grande.')
      .nullable(),

    periodo_raciones: z
      .enum(['diaria', 'semanal', 'mensual'])
      .nullable(),
  })
  .strict()
  .superRefine((datos, ctx) => {
    if (datos.raciones !== null && datos.periodo_raciones === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodo_raciones'],
        message: 'Debes seleccionar una periodicidad.',
      });
    }

    if (datos.raciones === null && datos.periodo_raciones !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['raciones'],
        message: 'Debes ingresar la cantidad de raciones.',
      });
    }
  });

export type CamposDiagnostico = z.infer<typeof camposDiagnosticoSchema>;

export interface Diagnostico extends CamposDiagnostico {
  id_diagnostico: string;
  id_organizacion: string;
  fecha_diagnostico: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface GuardarDiagnostico {
  campos: CamposDiagnostico;
}

export interface ServicioDiagnostico {
  obtener(idOrganizacion: string): Promise<Diagnostico | null>;

  crear(
    idOrganizacion: string,
    entrada: GuardarDiagnostico,
  ): Promise<Diagnostico>;

  actualizar(
    idOrganizacion: string,
    idDiagnostico: string,
    version: number,
    entrada: GuardarDiagnostico,
  ): Promise<Diagnostico>;
}
