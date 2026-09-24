import type { SupabaseClient } from '@supabase/supabase-js';

import {
  actualizarLineaAccionPrograma,
  archivarLineaAccionPrograma,
  crearLineaAccionPrograma,
  ErrorOperacionLineaAccionPrograma,
  listarLineasAccionPrograma,
  type LineaAccionPrograma,
} from '../../lib/server/programa-lineas-accion.ts';
import {
  actualizarPrograma,
  crearPrograma,
  ErrorOperacionPrograma,
  listarProgramas,
  obtenerProgramaPorId,
  type Programa,
} from '../../lib/server/programas.ts';
import type {
  ActualizarProgramaInput,
  CrearProgramaInput,
  LineaAccionProgramaInput,
  ObtenerProgramaPorIdInput,
} from './programas.schema.ts';

export interface ProgramaConLineas extends Programa {
  lineas_accion: LineaAccionPrograma[];
}

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
  crearPrograma: typeof crearPrograma;
  actualizarPrograma: typeof actualizarPrograma;
  listarLineas: typeof listarLineasAccionPrograma;
  crearLinea: typeof crearLineaAccionPrograma;
  actualizarLinea: typeof actualizarLineaAccionPrograma;
  archivarLinea: typeof archivarLineaAccionPrograma;
}

export const operacionesProgramasSupabase: OperacionesProgramas = {
  listarProgramas,
  obtenerProgramaPorId,
  crearPrograma,
  actualizarPrograma,
  listarLineas: listarLineasAccionPrograma,
  crearLinea: crearLineaAccionPrograma,
  actualizarLinea: actualizarLineaAccionPrograma,
  archivarLinea: archivarLineaAccionPrograma,
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

function camposLegadosDeLineas(lineas: LineaAccionProgramaInput[]) {
  return {
    componentes_linea_accion: lineas
      .map(({ linea_accion }) => linea_accion)
      .join('\n'),
    resultados_esperados: lineas
      .map(({ resultado_esperado }) => resultado_esperado)
      .join('\n'),
  };
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

async function sincronizarLineas(
  cliente: SupabaseClient,
  idPrograma: string,
  lineasDeseadas: LineaAccionProgramaInput[],
  operaciones: OperacionesProgramas,
): Promise<LineaAccionPrograma[]> {
  const lineasActuales = await operaciones.listarLineas(cliente, idPrograma);
  const lineasDisponibles = [...lineasActuales];
  const resultado: LineaAccionPrograma[] = [];

  for (const lineaDeseada of lineasDeseadas) {
    const nombreNormalizado = lineaDeseada.linea_accion.toLocaleLowerCase('es');
    let indiceActual = lineasDisponibles.findIndex(
      ({ linea_accion }) =>
        linea_accion.trim().toLocaleLowerCase('es') === nombreNormalizado,
    );

    if (indiceActual === -1 && lineasDisponibles.length > 0) {
      indiceActual = 0;
    }

    const [lineaActual] =
      indiceActual >= 0 ? lineasDisponibles.splice(indiceActual, 1) : [];

    if (lineaActual) {
      resultado.push(
        await operaciones.actualizarLinea(
          cliente,
          lineaActual.id_linea_accion,
          lineaDeseada,
          lineaActual.version,
        ),
      );
    } else {
      resultado.push(
        await operaciones.crearLinea(cliente, {
          id_programa: idPrograma,
          ...lineaDeseada,
        }),
      );
    }
  }

  for (const lineaSobrante of lineasDisponibles) {
    await operaciones.archivarLinea(
      cliente,
      lineaSobrante.id_linea_accion,
      lineaSobrante.version,
    );
  }

  return resultado;
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
    async () => {
      const { lineas_accion, ...camposPrograma } = input;
      const programa = await operaciones.crearPrograma(cliente, {
        ...camposPrograma,
        ...camposLegadosDeLineas(lineas_accion),
      });
      const lineas: LineaAccionPrograma[] = [];

      for (const linea of lineas_accion) {
        lineas.push(
          await operaciones.crearLinea(cliente, {
            id_programa: programa.id_programa,
            ...linea,
          }),
        );
      }

      return { ...programa, lineas_accion: lineas };
    },
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
    async () => {
      const { lineas_accion, ...camposPrograma } = input.cambios;
      const cambios = lineas_accion
        ? { ...camposPrograma, ...camposLegadosDeLineas(lineas_accion) }
        : camposPrograma;
      const programa = await operaciones.actualizarPrograma(
        cliente,
        input.id_programa,
        cambios,
        input.version_esperada,
      );
      const lineas = lineas_accion
        ? await sincronizarLineas(
            cliente,
            input.id_programa,
            lineas_accion,
            operaciones,
          )
        : await operaciones.listarLineas(cliente, input.id_programa);

      return { ...programa, lineas_accion: lineas };
    },
  );
}
