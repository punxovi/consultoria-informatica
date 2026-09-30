import { defineAction } from 'astro:actions';
import type { Plan } from '../../lib/server/planes';
import { crearClienteSupabaseParaAction } from '../../lib/server/supabase-actions';
import {
  crearRespuestaErrorPlan,
  manejarActualizarPlan,
  manejarCrearPlan,
  manejarListarPlanes,
  manejarObtenerPlanPorId,
} from './planes.handler';
import {
  actualizarPlanSchema,
  crearPlanSchema,
  listarPlanesSchema,
  obtenerPlanPorIdSchema,
} from './planes.schema';

export const listarPlanesAction = defineAction({
  accept: 'json',
  input: listarPlanesSchema,
  handler: async (input, context) => {
    try {
      return await manejarListarPlanes(crearClienteSupabaseParaAction(context.request), input);
    } catch (error) {
      return crearRespuestaErrorPlan<Plan[]>(error);
    }
  },
});

export const obtenerPlanPorIdAction = defineAction({
  accept: 'json',
  input: obtenerPlanPorIdSchema,
  handler: async (input, context) => {
    try {
      return await manejarObtenerPlanPorId(crearClienteSupabaseParaAction(context.request), input);
    } catch (error) {
      return crearRespuestaErrorPlan<Plan>(error);
    }
  },
});

export const crearPlanAction = defineAction({
  accept: 'json',
  input: crearPlanSchema,
  handler: async (input, context) => {
    try {
      return await manejarCrearPlan(crearClienteSupabaseParaAction(context.request), input);
    } catch (error) {
      return crearRespuestaErrorPlan<Plan>(error);
    }
  },
});

export const actualizarPlanAction = defineAction({
  accept: 'json',
  input: actualizarPlanSchema,
  handler: async (input, context) => {
    try {
      return await manejarActualizarPlan(crearClienteSupabaseParaAction(context.request), input);
    } catch (error) {
      return crearRespuestaErrorPlan<Plan>(error);
    }
  },
});
