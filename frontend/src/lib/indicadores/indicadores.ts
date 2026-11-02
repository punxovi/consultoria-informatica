import { defineAction } from 'astro:actions';
import { z } from 'zod';
import { catalogoSchema, indicadorAccionSchema, resultadoSchema, numeroFormularioSchema, resultadoFormularioSchema } from './modelo.ts';
import { getSupabaseClient } from '../supabase.ts';

// Clase de error local autocontenida
class ServiceError extends Error {
  codigo: string;
  status: number;
  detalles?: unknown;

  constructor(codigo: string, mensaje: string, status = 500, detalles?: unknown) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
    this.name = 'ServiceError';
  }
}

// 1. Obtener el catálogo global de indicadores estándar
export const obtenerCatalogoIndicadores = defineAction({
  handler: async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('indicadores')
      .select('id_indicador, nombre, descripcion, unidad_medida')
      .is('archived_at', null)
      .is('id_accion', null);

    if (error) {
      throw new ServiceError('ERROR_BASE_DATOS', 'No se pudo obtener el catálogo de indicadores.', 500);
    }

    const catalogoFormateado = (data || []).map((item: any) => ({
      id_indicador: item.id_indicador,
      codigo: item.nombre.toLowerCase().replace(/\s+/g, '_'),
      nombre: item.nombre,
      unidad_medida: item.unidad_medida,
      descripcion: item.descripcion ?? '',
    }));

    return { catalogo: catalogoFormateado };
  },
});

// 2. Listar indicadores asociados a una Acción
export const listarIndicadoresAccion = defineAction({
  handler: async ({ accionId }: { accionId: string }) => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('accion_indicadores')
      .select(`
        id_accion_indicador,
        id_accion,
        id_indicador,
        meta,
        version,
        indicadores (
          nombre,
          unidad_medida,
          descripcion
        ),
        resultados (
          id_resultado,
          id_accion_indicador,
          valor_medido,
          fecha_medicion,
          observaciones,
          version
        )
      `)
      .eq('id_accion', accionId);

    if (error) {
      throw new ServiceError('ERROR_BASE_DATOS', 'No se pudieron listar los indicadores de la acción.', 500);
    }

    const indicadoresFormateados = (data || []).map((ai: any) => ({
      id_indicador: ai.id_accion_indicador,
      id_accion: ai.id_accion,
      id_catalogo: ai.id_indicador,
      meta: ai.meta,
      nombre: ai.indicadores?.nombre,
      unidad_medida: ai.indicadores?.unidad_medida,
      descripcion: ai.indicadores?.descripcion,
      version: ai.version,
      resultado: ai.resultados && ai.resultados.length > 0 ? {
        id_resultado: ai.resultados[0].id_resultado,
        id_indicador: ai.resultados[0].id_accion_indicador,
        valor_medido: ai.resultados[0].valor_medido,
        fecha_medicion: ai.resultados[0].fecha_medicion,
        observaciones: ai.resultados[0].observaciones,
        version: ai.resultados[0].version,
      } : null,
    }));

    return { indicadores: indicadoresFormateados };
  },
});

// 3. Asociar indicadores a una Acción
export const asociarIndicadoresAccion = defineAction({
  accept: 'json',
  handler: async ({ accionId, indicadores }: { accionId: string; indicadores: Array<{ id_indicador: string; meta: number }> }) => {
    const supabase = getSupabaseClient();

    for (const ind of indicadores) {
      if (typeof ind.meta !== 'number' || ind.meta < 0) {
        throw new ServiceError('DATOS_INVALIDOS', 'La meta debe ser un valor numérico mayor o igual a cero.', 400);
      }
    }

    const inserciones = indicadores.map((ind) => ({
      id_accion: accionId,
      id_indicador: ind.id_indicador,
      meta: ind.meta,
    }));

    const { data, error } = await supabase
      .from('accion_indicadores')
      .insert(inserciones)
      .select(`
        id_accion_indicador,
        id_accion,
        id_indicador,
        meta,
        version,
        indicadores (
          nombre,
          unidad_medida,
          descripcion
        )
      `);

    if (error) {
      throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible asociar los indicadores.', 400, { original: error.message });
    }

    const resultadosMapeados = (data || []).map((ai: any) => ({
      id_indicador: ai.id_accion_indicador,
      id_accion: ai.id_accion,
      id_catalogo: ai.id_indicador,
      meta: ai.meta,
      nombre: ai.indicadores?.nombre,
      unidad_medida: ai.indicadores?.unidad_medida,
      descripcion: ai.indicadores?.descripcion,
      version: ai.version,
      resultado: null,
    }));

    return { indicadores: resultadosMapeados };
  },
});

// 4. Actualizar meta de un indicador asociado
export const actualizarMetaIndicador = defineAction({
  accept: 'json',
  handler: async ({ id, cambios }: { id: string; version_esperada?: number; cambios: { meta: number } }) => {
    const supabase = getSupabaseClient();

    if (typeof cambios.meta !== 'number' || cambios.meta < 0) {
      throw new ServiceError('DATOS_INVALIDOS', 'La meta no puede ser un valor negativo.', 400);
    }

    const { data, error } = await supabase
      .from('accion_indicadores')
      .update({ meta: cambios.meta, updated_at: new Date().toISOString() })
      .eq('id_accion_indicador', id)
      .select(`
        id_accion_indicador,
        id_accion,
        id_indicador,
        meta,
        version,
        indicadores (
          nombre,
          unidad_medida,
          descripcion
        ),
        resultados (
          id_resultado,
          id_accion_indicador,
          valor_medido,
          fecha_medicion,
          observaciones,
          version
        )
      `)
      .single();

    if (error) {
      throw new ServiceError('ERROR_BASE_DATOS', 'No se pudo actualizar la meta.', 400);
    }

    const actualizado = {
      id_indicador: data.id_accion_indicador,
      id_accion: data.id_accion,
      id_catalogo: data.id_indicador,
      meta: data.meta,
      nombre: (data.indicadores as any)?.nombre,
      unidad_medida: (data.indicadores as any)?.unidad_medida,
      descripcion: (data.indicadores as any)?.descripcion,
      version: data.version,
      resultado: (data.resultados as any)?.[0] ? {
        id_resultado: (data.resultados as any)[0].id_resultado,
        id_indicador: (data.resultados as any)[0].id_accion_indicador,
        valor_medido: (data.resultados as any)[0].valor_medido,
        fecha_medicion: (data.resultados as any)[0].fecha_medicion,
        observaciones: (data.resultados as any)[0].observaciones,
        version: (data.resultados as any)[0].version,
      } : null,
    };

    return { indicador: actualizado };
  },
});

// 5. Guardar o actualizar resultados
export const guardarResultadoIndicador = defineAction({
  accept: 'json',
  handler: async (input: { id_resultado?: string; id_indicador?: string; valor_medido: number; fecha_medicion: string; observaciones?: string | null }) => {
    const supabase = getSupabaseClient();

    if (typeof input.valor_medido !== 'number' || input.valor_medido < 0) {
      throw new ServiceError('DATOS_INVALIDOS', 'El valor medido debe ser mayor o igual a cero.', 400);
    }

    let dataRes;
    if (input.id_resultado) {
      const { data, error } = await supabase
        .from('resultados')
        .update({
          valor_medido: input.valor_medido,
          fecha_medicion: input.fecha_medicion,
          observaciones: input.observaciones,
          updated_at: new Date().toISOString(),
        })
        .eq('id_resultado', input.id_resultado)
        .select()
        .single();

      if (error) throw new ServiceError('ERROR_BASE_DATOS', 'No se pudo actualizar el resultado.', 400);
      dataRes = data;
    } else {
      const { data, error } = await supabase
        .from('resultados')
        .insert({
          id_accion_indicador: input.id_indicador,
          valor_medido: input.valor_medido,
          fecha_medicion: input.fecha_medicion,
          observaciones: input.observaciones,
        })
        .select()
        .single();

      if (error) throw new ServiceError('ERROR_BASE_DATOS', 'No se pudo registrar el resultado.', 400);
      dataRes = data;
    }

    return {
      resultado: {
        id_resultado: dataRes.id_resultado,
        id_indicador: dataRes.id_accion_indicador,
        valor_medido: dataRes.valor_medido,
        fecha_medicion: dataRes.fecha_medicion,
        observaciones: dataRes.observaciones,
        version: dataRes.version,
      },
    };
  },
});