import type { SupabaseClient } from '@supabase/supabase-js';
import {
  actualizarAccion,
  crearAccion,
  ErrorOperacionAccion,
  listarAcciones,
  obtenerAccionPorId,
  type Accion,
} from '../../lib/server/acciones.ts';
import type {
  ActualizarAccionInput,
  CrearAccionInput,
  ListarAccionesInput,
  ObtenerAccionPorIdInput,
} from './acciones.schema.ts';

export type CodigoExitoAccion =
  | 'ACCIONES_LISTADAS'
  | 'ACCION_OBTENIDA'
  | 'ACCION_CREADA'
  | 'ACCION_ACTUALIZADA';

export type CodigoErrorActionAccion =
  | 'NO_ENCONTRADA'
  | 'PLAN_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS'
  | 'CONFIGURACION_SUPABASE'
  | 'ERROR_INTERNO';

export type RespuestaActionAccion<T> =
  | { ok: true; codigo: CodigoExitoAccion; mensaje: string; datos: T }
  | { ok: false; codigo: CodigoErrorActionAccion; mensaje: string; datos: null };

export interface OperacionesAcciones {
  listar: typeof listarAcciones;
  obtenerPorId: typeof obtenerAccionPorId;
  crear: typeof crearAccion;
  actualizar: typeof actualizarAccion;
}

export const operacionesAccionesSupabase: OperacionesAcciones = {
  listar: listarAcciones,
  obtenerPorId: obtenerAccionPorId,
  crear: crearAccion,
  actualizar: actualizarAccion,
};

export function crearRespuestaErrorAccion<T>(error: unknown): RespuestaActionAccion<T> {
  if (error instanceof ErrorOperacionAccion) {
    return { ok: false, codigo: error.codigo, mensaje: error.message, datos: null };
  }
  if (error instanceof Error && error.name === 'ErrorConfiguracionSupabase') {
    return { ok: false, codigo: 'CONFIGURACION_SUPABASE', mensaje: error.message, datos: null };
  }
  return {
    ok: false,
    codigo: 'ERROR_INTERNO',
    mensaje: 'Ocurrió un error inesperado al gestionar la acción.',
    datos: null,
  };
}

async function ejecutar<T>(
  codigo: CodigoExitoAccion,
  mensaje: string,
  operacion: () => Promise<T>,
): Promise<RespuestaActionAccion<T>> {
  try {
    return { ok: true, codigo, mensaje, datos: await operacion() };
  } catch (error) {
    return crearRespuestaErrorAccion<T>(error);
  }
}

export function manejarListarAcciones(
  cliente: SupabaseClient,
  input: ListarAccionesInput,
  operaciones = operacionesAccionesSupabase,
) {
  return ejecutar<Accion[]>('ACCIONES_LISTADAS', 'Las acciones fueron consultadas correctamente.', () =>
    operaciones.listar(cliente, {
      idPlan: input.id_plan,
      estado: input.estado,
      incluirArchivadas: input.incluir_archivadas,
    }),
  );
}

export function manejarObtenerAccionPorId(
  cliente: SupabaseClient,
  input: ObtenerAccionPorIdInput,
  operaciones = operacionesAccionesSupabase,
) {
  return ejecutar<Accion>('ACCION_OBTENIDA', 'La acción fue consultada correctamente.', () =>
    operaciones.obtenerPorId(cliente, input.id_accion),
  );
}

export function manejarCrearAccion(
  cliente: SupabaseClient,
  input: CrearAccionInput,
  operaciones = operacionesAccionesSupabase,
) {
  return ejecutar<Accion>('ACCION_CREADA', 'La acción fue creada correctamente.', () =>
    operaciones.crear(cliente, input),
  );
}

export function manejarActualizarAccion(
  cliente: SupabaseClient,
  input: ActualizarAccionInput,
  operaciones = operacionesAccionesSupabase,
) {
  return ejecutar<Accion>('ACCION_ACTUALIZADA', 'La acción fue actualizada correctamente.', () =>
    operaciones.actualizar(cliente, input.id_accion, input.cambios, input.version_esperada),
  );
}
