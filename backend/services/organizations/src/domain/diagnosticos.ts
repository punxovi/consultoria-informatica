import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const ESTADOS_DIAGNOSTICO = ['borrador', 'en_revision', 'completado', 'archivado'] as const;
export type EstadoDiagnostico = typeof ESTADOS_DIAGNOSTICO[number];

export interface Diagnostico {
  id_diagnostico: string;
  id_organizacion: string;
  titulo: string;
  descripcion: string;
  estado: EstadoDiagnostico;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Debe ser un UUID válido.' }
);

const crearDiagnosticoZodSchema = z.object({
  titulo: z.string().trim().min(1, { message: 'El título del diagnóstico es obligatorio.' }).max(150, { message: 'El título no puede superar los 150 caracteres.' }),
  descripcion: z.string().trim().min(1, { message: 'La descripción del diagnóstico es obligatoria.' }).max(2000, { message: 'La descripción no puede superar los 2000 caracteres.' }),
  estado: z.enum(ESTADOS_DIAGNOSTICO, { message: 'El estado del diagnóstico no es válido.' }).optional(),
}).strict();

const actualizarDiagnosticoZodSchema = z.object({
  version_esperada: z.number().int().min(1, { message: 'La versión esperada debe ser un entero mayor que cero.' }).optional(),
  cambios: z.object({
    titulo: z.string().trim().min(1, { message: 'El título es obligatorio.' }).max(150).optional(),
    descripcion: z.string().trim().min(1, { message: 'La descripción es obligatoria.' }).max(2000).optional(),
    estado: z.enum(ESTADOS_DIAGNOSTICO, { message: 'El estado no es válido.' }).optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar.',
  }),
}).strict();

export type CamposDiagnostico = z.infer<typeof crearDiagnosticoZodSchema>;

export interface ActualizarDiagnosticoInput {
  versionEsperada?: number;
  cambios: z.infer<typeof actualizarDiagnosticoZodSchema>['cambios'];
}

function errorZod(error: z.ZodError): never {
  const issue = error.issues[0];
  const camino = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new ServiceError('DATOS_INVALIDOS', `${issue?.message ?? 'Los datos no son válidos.'}${camino}`, 400);
}

export function parseCamposDiagnostico(value: unknown): CamposDiagnostico {
  const resultado = crearDiagnosticoZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return resultado.data as CamposDiagnostico;
}

export function parseActualizarDiagnosticoInput(value: unknown): ActualizarDiagnosticoInput {
  const resultado = actualizarDiagnosticoZodSchema.safeParse(value);
  if (!resultado.success) {
    errorZod(resultado.error);
  }
  return {
    versionEsperada: resultado.data.version_esperada,
    cambios: resultado.data.cambios as ActualizarDiagnosticoInput['cambios'],
  };
}