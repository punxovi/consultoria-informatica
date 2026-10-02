import { defineAction } from 'astro:actions';
import type { Accion } from '../../lib/server/acciones';
import { crearClienteSupabaseParaAction } from '../../lib/server/supabase-actions';
import {
  crearRespuestaErrorAccion,
  manejarActualizarAccion,
  manejarCrearAccion,
  manejarListarAcciones,
  manejarObtenerAccionPorId,
} from './acciones.handler';
import {
  actualizarAccionSchema,
  crearAccionSchema,
  listarAccionesSchema,
  obtenerAccionPorIdSchema,
} from './acciones.schema';

export const listarAccionesAction = defineAction({
  accept: 'json',
  input: listarAccionesSchema,
  handler: async (input, context) => {
    try {
      return await manejarListarAcciones(crearClienteSupabaseParaAction(context.request, context.clientAddress), input);
    } catch (error) {
      return crearRespuestaErrorAccion<Accion[]>(error);
    }
  },
});

export const obtenerAccionPorIdAction = defineAction({
  accept: 'json',
  input: obtenerAccionPorIdSchema,
  handler: async (input, context) => {
    try {
      return await manejarObtenerAccionPorId(crearClienteSupabaseParaAction(context.request, context.clientAddress), input);
    } catch (error) {
      return crearRespuestaErrorAccion<Accion>(error);
    }
  },
});

export const crearAccionAction = defineAction({
  accept: 'json',
  input: crearAccionSchema,
  handler: async (input, context) => {
    try {
      return await manejarCrearAccion(crearClienteSupabaseParaAction(context.request, context.clientAddress), input);
    } catch (error) {
      return crearRespuestaErrorAccion<Accion>(error);
    }
  },
});

export const actualizarAccionAction = defineAction({
  accept: 'json',
  input: actualizarAccionSchema,
  handler: async (input, context) => {
    try {
      return await manejarActualizarAccion(crearClienteSupabaseParaAction(context.request, context.clientAddress), input);
    } catch (error) {
      return crearRespuestaErrorAccion<Accion>(error);
    }
  },
});
