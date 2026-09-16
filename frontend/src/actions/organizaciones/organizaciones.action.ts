import { defineAction } from 'astro:actions';

import type { Organizacion } from '../../lib/server/organizaciones';
import { crearClienteSupabaseParaAction } from '../../lib/server/supabase-actions';
import {
  crearRespuestaErrorOrganizacion,
  manejarActualizarOrganizacion,
  manejarCrearOrganizacion,
  manejarListarOrganizaciones,
  manejarObtenerOrganizacionPorId,
} from './organizaciones.handler';
import {
  actualizarOrganizacionSchema,
  crearOrganizacionSchema,
  listarOrganizacionesSchema,
  obtenerOrganizacionPorIdSchema,
} from './organizaciones.schema';

export const listarOrganizacionesAction = defineAction({
  accept: 'json',
  input: listarOrganizacionesSchema,
  handler: async (input, context) => {
    try {
      return await manejarListarOrganizaciones(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorOrganizacion<Organizacion[]>(error);
    }
  },
});

export const obtenerOrganizacionPorIdAction = defineAction({
  accept: 'json',
  input: obtenerOrganizacionPorIdSchema,
  handler: async (input, context) => {
    try {
      return await manejarObtenerOrganizacionPorId(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorOrganizacion<Organizacion>(error);
    }
  },
});

export const crearOrganizacionAction = defineAction({
  accept: 'json',
  input: crearOrganizacionSchema,
  handler: async (input, context) => {
    try {
      return await manejarCrearOrganizacion(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorOrganizacion<Organizacion>(error);
    }
  },
});

export const actualizarOrganizacionAction = defineAction({
  accept: 'json',
  input: actualizarOrganizacionSchema,
  handler: async (input, context) => {
    try {
      return await manejarActualizarOrganizacion(
        crearClienteSupabaseParaAction(context.request),
        input,
      );
    } catch (error) {
      return crearRespuestaErrorOrganizacion<Organizacion>(error);
    }
  },
});
