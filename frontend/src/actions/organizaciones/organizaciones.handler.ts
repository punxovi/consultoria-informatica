import type { SupabaseClient } from '@supabase/supabase-js';

import {
  actualizarOrganizacion,
  crearOrganizacion,
  ErrorOperacionOrganizacion,
  listarOrganizaciones,
  obtenerOrganizacionPorId,
  type Organizacion,
} from '../../lib/server/organizaciones.ts';
import type {
  ActualizarOrganizacionActionInput,
  CrearOrganizacionActionInput,
  ListarOrganizacionesInput,
  ObtenerOrganizacionPorIdInput,
} from './organizaciones.schema';

export type CodigoExitoOrganizacion =
  | 'ORGANIZACIONES_LISTADAS'
  | 'ORGANIZACION_OBTENIDA'
  | 'ORGANIZACION_CREADA'
  | 'ORGANIZACION_ACTUALIZADA';

export type CodigoErrorActionOrganizacion =
  | 'NO_ENCONTRADA'
  | 'PAIS_NO_EXISTE'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS'
  | 'CONFIGURACION_SUPABASE'
  | 'ERROR_INTERNO';

export type RespuestaActionOrganizacion<T> =
  | {
      ok: true;
      codigo: CodigoExitoOrganizacion;
      mensaje: string;
      datos: T;
    }
  | {
      ok: false;
      codigo: CodigoErrorActionOrganizacion;
      mensaje: string;
      datos: null;
    };

export interface OperacionesOrganizaciones {
  listar: typeof listarOrganizaciones;
  obtenerPorId: typeof obtenerOrganizacionPorId;
  crear: typeof crearOrganizacion;
  actualizar: typeof actualizarOrganizacion;
}

export const operacionesOrganizacionesSupabase: OperacionesOrganizaciones = {
  listar: listarOrganizaciones,
  obtenerPorId: obtenerOrganizacionPorId,
  crear: crearOrganizacion,
  actualizar: actualizarOrganizacion,
};

export function crearRespuestaErrorOrganizacion<T>(
  error: unknown,
): RespuestaActionOrganizacion<T> {
  if (error instanceof ErrorOperacionOrganizacion) {
    return {
      ok: false,
      codigo: error.codigo,
      mensaje: error.message,
      datos: null,
    };
  }

  if (
    error instanceof Error &&
    error.name === 'ErrorConfiguracionSupabase'
  ) {
    return {
      ok: false,
      codigo: 'CONFIGURACION_SUPABASE',
      mensaje: error.message,
      datos: null,
    };
  }

  return {
    ok: false,
    codigo: 'ERROR_INTERNO',
    mensaje: 'Ocurrió un error inesperado al gestionar la organización.',
    datos: null,
  };
}

async function ejecutarOperacion<T>(
  codigo: CodigoExitoOrganizacion,
  mensaje: string,
  operacion: () => Promise<T>,
): Promise<RespuestaActionOrganizacion<T>> {
  try {
    return {
      ok: true,
      codigo,
      mensaje,
      datos: await operacion(),
    };
  } catch (error) {
    return crearRespuestaErrorOrganizacion<T>(error);
  }
}

export function manejarListarOrganizaciones(
  cliente: SupabaseClient,
  input: ListarOrganizacionesInput,
  operaciones = operacionesOrganizacionesSupabase,
): Promise<RespuestaActionOrganizacion<Organizacion[]>> {
  return ejecutarOperacion(
    'ORGANIZACIONES_LISTADAS',
    'Las organizaciones fueron consultadas correctamente.',
    () =>
      operaciones.listar(cliente, {
        idPais: input.id_pais,
        incluirArchivadas: input.incluir_archivadas,
      }),
  );
}

export function manejarObtenerOrganizacionPorId(
  cliente: SupabaseClient,
  input: ObtenerOrganizacionPorIdInput,
  operaciones = operacionesOrganizacionesSupabase,
): Promise<RespuestaActionOrganizacion<Organizacion>> {
  return ejecutarOperacion(
    'ORGANIZACION_OBTENIDA',
    'La organización fue consultada correctamente.',
    () => operaciones.obtenerPorId(cliente, input.id_organizacion),
  );
}

export function manejarCrearOrganizacion(
  cliente: SupabaseClient,
  input: CrearOrganizacionActionInput,
  operaciones = operacionesOrganizacionesSupabase,
): Promise<RespuestaActionOrganizacion<Organizacion>> {
  return ejecutarOperacion(
    'ORGANIZACION_CREADA',
    'La organización fue creada correctamente.',
    () => operaciones.crear(cliente, input),
  );
}

export function manejarActualizarOrganizacion(
  cliente: SupabaseClient,
  input: ActualizarOrganizacionActionInput,
  operaciones = operacionesOrganizacionesSupabase,
): Promise<RespuestaActionOrganizacion<Organizacion>> {
  return ejecutarOperacion(
    'ORGANIZACION_ACTUALIZADA',
    'La organización fue actualizada correctamente.',
    () =>
      operaciones.actualizar(
        cliente,
        input.id_organizacion,
        input.cambios,
        input.version_esperada,
      ),
  );
}
