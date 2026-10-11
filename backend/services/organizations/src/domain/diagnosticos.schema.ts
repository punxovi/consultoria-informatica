import { z } from 'zod';

const texto = (max: number) => z.string().trim().min(1, 'Este campo es obligatorio.').max(max);

// Un diagnóstico institucional completo por organización.
export const crearDiagnosticoZodSchema = z.object({
  mision: texto(500),
  vision: texto(500),
  tiene_espacio_fisico: z.boolean().nullable(),
  caracteristicas_infraestructura: texto(500),
  espacios_disponibles: texto(500),
  recursos_existentes: texto(500),
  danos_detectados: texto(500),
  necesidades_prioritarias: texto(500),
  observaciones: texto(1000),
  raciones: z.number().int().min(0).max(2147483647).nullable(),
  periodo_raciones: z.enum(['diaria', 'semanal', 'mensual']).nullable(),
}).strict().superRefine((datos, ctx) => {
  if (datos.raciones !== null && datos.periodo_raciones === null) {
    ctx.addIssue({ code: 'custom', path: ['periodo_raciones'], message: 'Debes seleccionar una periodicidad.' });
  }
  if (datos.raciones === null && datos.periodo_raciones !== null) {
    ctx.addIssue({ code: 'custom', path: ['raciones'], message: 'Debes ingresar la cantidad de raciones.' });
  }
});

export const actualizarDiagnosticoZodSchema = z.object({
  version_esperada: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  cambios: crearDiagnosticoZodSchema,
}).strict();

export type CrearDiagnosticoData = z.infer<typeof crearDiagnosticoZodSchema>;
export type ActualizarDiagnosticoData = z.infer<typeof actualizarDiagnosticoZodSchema>;
