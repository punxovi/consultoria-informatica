import { defineAction } from 'astro:actions';
import { archivarPrograma, type Programa } from '../../lib/server/programas';

import { crearClienteSupabaseParaAction } from '../../lib/server/supabase-actions';
import {
  crearRespuestaErrorPrograma,
  manejarActualizarPrograma,
  manejarCrearPrograma,
  manejarListarProgramas,
  manejarObtenerProgramaPorId,
  type ProgramaConLineas,
} from './programas.handler';
import {
  actualizarProgramaSchema,
  archivarProgramaSchema,
  crearProgramaSchema,
  listarProgramasSchema,
  obtenerProgramaPorIdSchema,
} from './programas.schema';

export const archivarProgramaAction = defineAction({
  accept: 'json',
  input: archivarProgramaSchema,
  handler: async (input, context) => {
    try {
      const datos = await archivarPrograma(
        crearClienteSupabaseParaAction(context.request),
        input.id_programa,
        input.version_esperada,
      );
      return { ok: true as const, codigo: 'PROGRAMA_ARCHIVADO' as const, mensaje: 'Programa eliminado del catálogo. Su historial se conserva.', datos };
    } catch (error) {
      return crearRespuestaErrorPrograma<Programa>(error);
    }
  },
});

export const listarProgramasAction = defineAction({
  accept: 'json',
  input: listarProgramasSchema,
  handler: async (_input, context) => {
    try {
      return await manejarListarProgramas(
        crearClienteSupabaseParaAction(context.request),
      );
    } catch (error) {
      return crearRespuestaErrorPrograma<ProgramaConLineas[]>(error);
    }
  },
});

export const obtenerProgramaPorIdAction = defineAction({
  accept: 'json',
  input: obtenerProgramaPorIdSchema,
  handler: async (input, context) => {
    try {
      return await manejarObtenerProgramaPorId(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorPrograma<ProgramaConLineas>(error);
    }
  },
});

export const crearProgramaAction = defineAction({
  accept: 'json',
  input: crearProgramaSchema,
  handler: async (input, context) => {
    try {
      return await manejarCrearPrograma(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorPrograma<ProgramaConLineas>(error);
    }
  },
});

export const actualizarProgramaAction = defineAction({
  accept: 'json',
  input: actualizarProgramaSchema,
  handler: async (input, context) => {
    try {
      return await manejarActualizarPrograma(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorPrograma<ProgramaConLineas>(error);
    }
  },
});
