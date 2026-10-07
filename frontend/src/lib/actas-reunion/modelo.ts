import { z } from 'zod';
import type { CamposCompromiso } from '../compromisos/modelo';

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`);

const fecha = texto(10).refine(
  (valor) =>
    /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
    !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) &&
    new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor,
  'Ingresa una fecha válida.',
);

export const camposActaSchema = z
  .object({
    id_plan: texto(100),
    id_accion: texto(100),
    fecha_reunion: fecha,
    asistentes: z.array(texto(150)).min(1, 'Debes seleccionar al menos un asistente.'),
    asistentes_externos: texto(500),
    objetivo: texto(1000),
    observaciones: texto(2000),
  })
  .strict();

export type CamposActa = z.infer<typeof camposActaSchema>;

export interface ActaReunion extends CamposActa {
  id_acta: string;
  id_organizacion: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GuardarActa {
  campos: CamposActa;
  compromisos?: CamposCompromiso[];
}

export interface ServicioActasReunion {
  obtener(idOrganizacion: string): Promise<ActaReunion[]>;
  crear(idOrganizacion: string, entrada: GuardarActa): Promise<ActaReunion>;
  actualizar(
    idOrganizacion: string,
    idActa: string,
    version: number,
    entrada: GuardarActa,
  ): Promise<ActaReunion>;
}
