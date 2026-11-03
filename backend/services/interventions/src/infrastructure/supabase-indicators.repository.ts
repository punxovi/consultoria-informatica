import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { readSupabaseConnection, validateSupabaseConnection } from '../../../../shared/config/src/supabase.ts';
import type { IndicatorsRepository } from '../domain/indicators.ts';

interface Options { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }

export function createSupabaseIndicatorsRepository(options: Options): IndicatorsRepository {
  function rpc(name: string, token: string, input: object, array: true): Promise<unknown[]>;
  function rpc(name: string, token: string, input: object): Promise<Record<string, unknown>>;
  async function rpc(name: string, token: string, input: object, array = false): Promise<unknown[] | Record<string, unknown>> {
    validateSupabaseConnection(options.supabaseUrl, options.anonKey);
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(`${options.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
      });
    } catch (error) { throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con Supabase. Recarga antes de volver a guardar.', 503, error); }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.code;
      if (response.status === 401 && /invalid api key|invalid apikey/i.test(body?.message ?? '')) {
        throw new ServiceError('CREDENCIALES_SUPABASE_INVALIDAS', 'La credencial de conexión del Backend no es válida para el proyecto Supabase.', 503);
      }
      if (code === '40001') throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El registro cambió. Actualiza los indicadores antes de guardar.', 409);
      if (code === '23505') throw new ServiceError('INDICADOR_YA_ASOCIADO', 'Uno de los indicadores ya está asociado a esta Acción. Actualiza la lista.', 409);
      if (response.status === 401) throw new ServiceError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
      if (code === '42501' || response.status === 403) throw new ServiceError('SIN_PERMISO', 'No tienes permiso para gestionar estos indicadores o resultados.', 403);
      if (code === 'P0002') throw new ServiceError('NO_ENCONTRADO', 'La Acción, el indicador o el resultado no existe o no está disponible para tu usuario.', 404);
      if (['22023', '23514', '23502', '22P02', '22007', '22008'].includes(code)) throw new ServiceError('DATOS_INVALIDOS', 'Revisa los valores, las fechas y las asociaciones del registro.', 400);
      if (['PGRST202', 'PGRST205', '42883', '42703', '42P01'].includes(code)) throw new ServiceError('MIGRACION_PENDIENTE', 'Falta aplicar la migración de Indicadores y Resultados en Supabase.', 503);
      throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación de Indicadores y Resultados.', 502);
    }
    if (array ? !Array.isArray(body) : !body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'Supabase devolvió una respuesta de Indicadores inválida.', 502);
    }
    return body;
  }
  return {
    catalog: token => rpc('consultar_catalogo_indicadores', token, {}, true),
    list: (token, action) => rpc('listar_indicadores_accion', token, { p_accion: action }, true),
    associate: (token, action, input) => rpc('asociar_indicadores_accion', token, { p_accion: action, p_indicadores: input.indicadores }, true),
    updateGoal: (token, id, input) => rpc('actualizar_meta_indicador', token, { p_id: id, p_version: input.version_esperada, p_meta: input.cambios.meta }),
    createResult: (token, input) => rpc('guardar_resultado_indicador', token, {
      p_indicador: input.id_indicador, p_valor: input.valor_medido, p_fecha: input.fecha_medicion, p_observaciones: input.observaciones ?? null,
    }),
    updateResult: (token, id, input) => rpc('guardar_resultado_indicador', token, {
      p_indicador: null, p_id: id, p_version: input.version_esperada,
      p_valor: input.cambios.valor_medido, p_fecha: input.cambios.fecha_medicion, p_observaciones: input.cambios.observaciones ?? null,
    }),
  };
}

export function createSupabaseIndicatorsRepositoryFromEnv(): IndicatorsRepository {
  return createSupabaseIndicatorsRepository(readSupabaseConnection());
}
