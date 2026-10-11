import { ServiceError } from '../../../../shared/errors/src/index.ts';
import {
  crearDiagnosticoZodSchema, actualizarDiagnosticoZodSchema,
  type CrearDiagnosticoData,
} from './diagnosticos.schema.ts';

export type CamposDiagnostico = CrearDiagnosticoData;

export interface Diagnostico extends CamposDiagnostico {
  id_diagnostico: string;
  id_organizacion: string;
  fecha_diagnostico: string;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActualizarDiagnosticoInput {
  versionEsperada: number;
  cambios: CamposDiagnostico;
}

export function parseCamposDiagnostico(value: unknown): CamposDiagnostico {
  const resultado = crearDiagnosticoZodSchema.safeParse(value);
  if (!resultado.success) {
    const issue = resultado.error.issues[0];
    throw new ServiceError('DATOS_INVALIDOS', `${issue.message} (${issue.path.join('.')})`, 400);
  }
  return resultado.data;
}

export function parseActualizarDiagnosticoInput(value: unknown): ActualizarDiagnosticoInput {
  const resultado = actualizarDiagnosticoZodSchema.safeParse(value);
  if (!resultado.success) {
    const issue = resultado.error.issues[0];
    throw new ServiceError('DATOS_INVALIDOS', `${issue.message} (${issue.path.join('.')})`, 400);
  }
  return { versionEsperada: resultado.data.version_esperada, cambios: resultado.data.cambios };
}
