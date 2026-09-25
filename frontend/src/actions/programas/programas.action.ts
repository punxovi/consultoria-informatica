import { defineAction } from 'astro:actions';

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
  crearProgramaSchema,
  listarProgramasSchema,
  obtenerProgramaPorIdSchema,
} from './programas.schema';

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
