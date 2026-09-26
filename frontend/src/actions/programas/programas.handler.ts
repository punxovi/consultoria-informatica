import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ErrorOperacionLineaAccionPrograma,
  listarLineasAccionPrograma,
} from '../../lib/server/programa-lineas-accion.ts';
import {
  ErrorOperacionPrograma,
  listarProgramas,
  obtenerProgramaPorId,
  type Programa,
} from '../../lib/server/programas.ts';
import type {
  ActualizarProgramaInput,
  CrearProgramaInput,
  ObtenerProgramaPorIdInput,
} from './programas.schema.ts';

import {
  crearProgramaCompleto,
  actualizarProgramaCompleto,
  type ProgramaConLineas,
} from '../../lib/server/programas-completos.ts';
export type { ProgramaConLineas } from '../../lib/server/programas-completos';

export type CodigoExitoPrograma =
  | 'PROGRAMAS_LISTADOS'
  | 'PROGRAMA_OBTENIDO'
  | 'PROGRAMA_CREADO'
  | 'PROGRAMA_ACTUALIZADO';

export type CodigoErrorActionPrograma =
  | 'NO_ENCONTRADO'
  | 'LINEA_NO_ENCONTRADA'
  | 'PROGRAMA_NO_EXISTE'
  | 'LINEA_DUPLICADA'
  | 'RESTRICCION_INCUMPLIDA'
  | 'CONFLICTO_CONCURRENCIA'
  | 'SIN_PERMISO'
  | 'ERROR_BASE_DATOS'
  | 'CONFIGURACION_SUPABASE'
  | 'ERROR_INTERNO';

export type RespuestaActionPrograma<T> =
  | {
      ok: true;
      codigo: CodigoExitoPrograma;
      mensaje: string;
      datos: T;
    }
  | {
      ok: false;
      codigo: CodigoErrorActionPrograma;
      mensaje: string;
      datos: null;
    };

export interface OperacionesProgramas {
  listarProgramas: typeof listarProgramas;
  obtenerProgramaPorId: typeof obtenerProgramaPorId;
  crearPrograma: typeof crearProgramaCompleto;
  actualizarPrograma: typeof actualizarProgramaCompleto;
  listarLineas: typeof listarLineasAccionPrograma;
}

export const operacionesProgramasSupabase: OperacionesProgramas = {
  listarProgramas,
  obtenerProgramaPorId,
  crearPrograma: crearProgramaCompleto,
  actualizarPrograma: actualizarProgramaCompleto,
  listarLineas: listarLineasAccionPrograma,
};

export function crearRespuestaErrorPrograma<T>(
  error: unknown,
): RespuestaActionPrograma<T> {
  if (error instanceof ErrorOperacionPrograma) {
    return {
      ok: false,
      codigo: error.codigo,
      mensaje: error.message,
      datos: null,
    };
  }

  if (error instanceof ErrorOperacionLineaAccionPrograma) {
    return {
      ok: false,
      codigo:
        error.codigo === 'NO_ENCONTRADA'
          ? 'LINEA_NO_ENCONTRADA'
          : error.codigo,
      mensaje: error.message,
      datos: null,
    };
  }

  if (error instanceof Error && error.name === 'ErrorConfiguracionSupabase') {
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
    mensaje: 'Ocurrió un error inesperado al gestionar el programa.',
    datos: null,
  };
}

async function ejecutarOperacion<T>(
  codigo: CodigoExitoPrograma,
  mensaje: string,
  operacion: () => Promise<T>,
): Promise<RespuestaActionPrograma<T>> {
  try {
    return {
      ok: true,
      codigo,
      mensaje,
      datos: await operacion(),
    };
  } catch (error) {
    return crearRespuestaErrorPrograma<T>(error);
  }
}

async function adjuntarLineas(
  cliente: SupabaseClient,
  programa: Programa,
  operaciones: OperacionesProgramas,
): Promise<ProgramaConLineas> {
  return {
    ...programa,
    lineas_accion: await operaciones.listarLineas(
      cliente,
      programa.id_programa,
    ),
  };
}

export function manejarListarProgramas(
  cliente: SupabaseClient,
  operaciones = operacionesProgramasSupabase,
): Promise<RespuestaActionPrograma<ProgramaConLineas[]>> {
  return ejecutarOperacion(
    'PROGRAMAS_LISTADOS',
    'Los programas fueron consultados correctamente.',
    async () => {
      const programas = await operaciones.listarProgramas(cliente);
      return Promise.all(
        programas.map((programa) => adjuntarLineas(cliente, programa, operaciones)),
      );
    },
  );
}

export function manejarObtenerProgramaPorId(
  cliente: SupabaseClient,
  input: ObtenerProgramaPorIdInput,
  operaciones = operacionesProgramasSupabase,
): Promise<RespuestaActionPrograma<ProgramaConLineas>> {
  return ejecutarOperacion(
    'PROGRAMA_OBTENIDO',
    'El programa fue consultado correctamente.',
    async () =>
      adjuntarLineas(
        cliente,
        await operaciones.obtenerProgramaPorId(cliente, input.id_programa),
        operaciones,
      ),
  );
}

export function manejarCrearPrograma(
  cliente: SupabaseClient,
  input: CrearProgramaInput,
  operaciones = operacionesProgramasSupabase,
): Promise<RespuestaActionPrograma<ProgramaConLineas>> {
  return ejecutarOperacion(
    'PROGRAMA_CREADO',
    'El programa fue creado correctamente.',
    () => operaciones.crearPrograma(cliente, input),
  );
}

export function manejarActualizarPrograma(
  cliente: SupabaseClient,
  input: ActualizarProgramaInput,
  operaciones = operacionesProgramasSupabase,
): Promise<RespuestaActionPrograma<ProgramaConLineas>> {
  return ejecutarOperacion(
    'PROGRAMA_ACTUALIZADO',
    'El programa fue actualizado correctamente.',
    () => operaciones.actualizarPrograma(cliente, input),
  );
}
