import type { SupabaseClient } from '@supabase/supabase-js';
import {
  actualizarPlan,
  crearPlan,
  ErrorOperacionPlan,
  listarPlanes,
  listarOrganizacionesParaPlan,
  type OrganizacionParaPlan,
  obtenerPlanPorId,
  type Plan,
} from '../../lib/server/planes.ts';
import type {
  ActualizarPlanInput,
  CrearPlanInput,
  ListarPlanesInput,
  ObtenerPlanPorIdInput,
} from './planes.schema.ts';

export type CodigoExitoPlan = 'ORGANIZACIONES_PLAN_LISTADAS' | 'PLANES_LISTADOS' | 'PLAN_OBTENIDO' | 'PLAN_CREADO' | 'PLAN_ACTUALIZADO';
export type CodigoErrorActionPlan =
  | 'NO_ENCONTRADO'
  | 'ORGANIZACION_NO_EXISTE'
  | 'PROGRAMA_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS'
  | 'CONFIGURACION_SUPABASE'
  | 'ERROR_INTERNO';

export type RespuestaActionPlan<T> =
  | { ok: true; codigo: CodigoExitoPlan; mensaje: string; datos: T }
  | { ok: false; codigo: CodigoErrorActionPlan; mensaje: string; datos: null };

export interface OperacionesPlanes {
  listar: typeof listarPlanes;
  obtenerPorId: typeof obtenerPlanPorId;
  crear: typeof crearPlan;
  actualizar: typeof actualizarPlan;
}

export const operacionesPlanesSupabase: OperacionesPlanes = {
  listar: listarPlanes,
  obtenerPorId: obtenerPlanPorId,
  crear: crearPlan,
  actualizar: actualizarPlan,
};

export function crearRespuestaErrorPlan<T>(error: unknown): RespuestaActionPlan<T> {
  if (error instanceof ErrorOperacionPlan) {
    return { ok: false, codigo: error.codigo, mensaje: error.message, datos: null };
  }
  if (error instanceof Error && error.name === 'ErrorConfiguracionSupabase') {
    return { ok: false, codigo: 'CONFIGURACION_SUPABASE', mensaje: error.message, datos: null };
  }
  return { ok: false, codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado al gestionar el plan.', datos: null };
}

async function ejecutar<T>(
  codigo: CodigoExitoPlan,
  mensaje: string,
  operacion: () => Promise<T>,
): Promise<RespuestaActionPlan<T>> {
  try {
    return { ok: true, codigo, mensaje, datos: await operacion() };
  } catch (error) {
    return crearRespuestaErrorPlan<T>(error);
  }
}

export function manejarListarOrganizacionesParaPlan(cliente: SupabaseClient) {
  return ejecutar<OrganizacionParaPlan[]>('ORGANIZACIONES_PLAN_LISTADAS', 'Las organizaciones fueron consultadas correctamente.', () => listarOrganizacionesParaPlan(cliente));
}

export function manejarListarPlanes(
  cliente: SupabaseClient,
  input: ListarPlanesInput,
  operaciones = operacionesPlanesSupabase,
) {
  return ejecutar<Plan[]>('PLANES_LISTADOS', 'Los planes fueron consultados correctamente.', () =>
    operaciones.listar(cliente, {
      idOrganizacion: input.id_organizacion,
      idPrograma: input.id_programa,
      periodoAnual: input.periodo_anual,
      incluirArchivados: input.incluir_archivados,
    }),
  );
}

export function manejarObtenerPlanPorId(
  cliente: SupabaseClient,
  input: ObtenerPlanPorIdInput,
  operaciones = operacionesPlanesSupabase,
) {
  return ejecutar<Plan>('PLAN_OBTENIDO', 'El plan fue consultado correctamente.', () =>
    operaciones.obtenerPorId(cliente, input.id_plan),
  );
}

export function manejarCrearPlan(
  cliente: SupabaseClient,
  input: CrearPlanInput,
  operaciones = operacionesPlanesSupabase,
) {
  return ejecutar<Plan>('PLAN_CREADO', 'El plan fue creado correctamente.', () => operaciones.crear(cliente, input));
}

export function manejarActualizarPlan(
  cliente: SupabaseClient,
  input: ActualizarPlanInput,
  operaciones = operacionesPlanesSupabase,
) {
  return ejecutar<Plan>('PLAN_ACTUALIZADO', 'El plan fue actualizado correctamente.', () =>
    operaciones.actualizar(cliente, input.id_plan, input.cambios, input.version_esperada),
  );
}
