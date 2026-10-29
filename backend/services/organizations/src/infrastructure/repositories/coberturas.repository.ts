import { ServiceError } from '../../../../../shared/errors/src/index.ts';
import type { OtorgarCoberturaInput, ExtenderCoberturaInput, RevocarCoberturaInput, PermisoTemporalResponse } from '@backend/shared-contracts';

export class CoberturaRepository {
  public supabaseClient: any;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }
  async otorgar(data: OtorgarCoberturaInput & { id_usuario_otorga: string }): Promise<PermisoTemporalResponse> {
    console.log('DEBUG REPOSITORY - Objeto insertando a Supabase:', {
      id_usuario_beneficiario: data.id_usuario_beneficiario,
      id_usuario_otorga: data.id_usuario_otorga,
      id_pais: data.id_pais,
      inicio_at: data.inicio_at,
      fin_at: data.fin_at,
      motivo: data.motivo,
    });
    const { data: permisoData, error: permisoError } = await this.supabaseClient
      .from('permisos_temporales')
      .insert({
        id_usuario_beneficiario: data.id_usuario_beneficiario,
        id_usuario_otorga: data.id_usuario_otorga,
        id_pais: data.id_pais,
        inicio_at: data.inicio_at,
        fin_at: data.fin_at,
        motivo: data.motivo,
      })
      .select()
      .single();

    if (permisoError) {
      throw new Error(`Error al otorgar cobertura temporal: ${permisoError.message}`);
    }

    // -------------------------------------------------------------
    // NUEVO: Registrar el evento de otorgamiento en el historial
    // -------------------------------------------------------------
    const { error: historialError } = await this.supabaseClient
      .from('permisos_temporales_historial')
      .insert({
        id_permiso_temporal: permisoData.id_permiso_temporal,
        tipo_evento: 'OTORGAR',
        fin_at_anterior: null,
        fin_at_nuevo: data.fin_at,
        motivo: data.motivo,
        accion_por: data.id_usuario_otorga,
      });

    if (historialError) {
      throw new Error(`Error al registrar el historial de otorgamiento: ${historialError.message}`);
    }

    if (data.permisos && data.permisos.length > 0) {
      const detallesInserts = data.permisos.map((idPermiso) => ({
        id_permiso_temporal: permisoData.id_permiso_temporal,
        id_permiso: idPermiso,
        created_by: data.id_usuario_otorga,
        updated_by: data.id_usuario_otorga,
      }));

      const { error: detallesError } = await this.supabaseClient
        .from('permiso_temporal_detalles')
        .insert(detallesInserts);

      if (detallesError) {
        throw new Error(`Error al asociar permisos detallados: ${detallesError.message}`);
      }
    }

    return permisoData as PermisoTemporalResponse;
  }

  async buscarPorId(idPermisoTemporal: string): Promise<PermisoTemporalResponse | null> {
    const { data, error } = await this.supabaseClient
      .from('permisos_temporales')
      .select('*')
      .eq('id_permiso_temporal', idPermisoTemporal)
      .single();

    if (error || !data) {
      return null;
    }

    return data as PermisoTemporalResponse;
  }

  async extender(idPermisoTemporal: string, data: ExtenderCoberturaInput & { id_usuario_admin: string }): Promise<PermisoTemporalResponse> {
    // 1. Obtener la cobertura actual para conocer la fecha fin anterior
    const actual = await this.buscarPorId(idPermisoTemporal);
    if (!actual) {
      throw new Error('La cobertura temporal a extender no existe.');
    }
    const finAtAnterior = actual.fin_at;

    // 2. Actualizar el registro con la nueva fecha de fin
    const { data: updatedData, error } = await this.supabaseClient
      .from('permisos_temporales')
      .update({
        fin_at: data.nueva_fin_at,
        updated_at: new Date().toISOString(),
        updated_by: data.id_usuario_admin,
      })
      .eq('id_permiso_temporal', idPermisoTemporal)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al extender la cobertura temporal: ${error.message}`);
    }

    // 3. Registrar el evento en el historial append-only
    const { error: historialError } = await this.supabaseClient
      .from('permisos_temporales_historial')
      .insert({
        id_permiso_temporal: idPermisoTemporal,
        tipo_evento: 'EXTENDER',
        fin_at_anterior: finAtAnterior,
        fin_at_nuevo: data.nueva_fin_at,
        motivo: data.motivo || 'Extensión de cobertura temporal',
        accion_por: data.id_usuario_admin,
      });

    if (historialError) {
      throw new Error(`Error al registrar el historial de extensión: ${historialError.message}`);
    }

    return updatedData as PermisoTemporalResponse;
  }

  async revocar(idPermisoTemporal: string, data: RevocarCoberturaInput & { id_usuario_admin: string }): Promise<PermisoTemporalResponse> {
    // 1. Obtener la cobertura actual para conocer los detalles previos si es necesario
    const actual = await this.buscarPorId(idPermisoTemporal);
    if (!actual) {
      throw new Error('La cobertura temporal a revocar no existe.');
    }

    // 2. Actualizar el registro marcándolo como revocado
    const { data: updatedData, error } = await this.supabaseClient
      .from('permisos_temporales')
      .update({
        revocado_at: new Date().toISOString(),
        revocado_por: data.id_usuario_admin,
        motivo_revocacion: data.motivo_revocacion,
        updated_at: new Date().toISOString(),
        updated_by: data.id_usuario_admin,
      })
      .eq('id_permiso_temporal', idPermisoTemporal)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al revocar la cobertura temporal: ${error.message}`);
    }

    // 3. Registrar el evento en el historial append-only
    const { error: historialError } = await this.supabaseClient
      .from('permisos_temporales_historial')
      .insert({
        id_permiso_temporal: idPermisoTemporal,
        tipo_evento: 'REVOCAR',
        fin_at_anterior: actual.fin_at,
        fin_at_nuevo: actual.fin_at, // Al revocar, la fecha fin se mantiene como referencia del cierre
        motivo: data.motivo_revocacion,
        accion_por: data.id_usuario_admin,
      });

    if (historialError) {
      throw new Error(`Error al registrar el historial de revocación: ${historialError.message}`);
    }

    return updatedData as PermisoTemporalResponse;
  }

  

  async listarHistorialAuditoria(filtros: {
    accion_por?: string;
    id_pais?: string;
    tipo_evento?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    id_permiso_temporal?: string;
    limit: number;
    offset: number;
  }) {
    // Construimos la consulta base uniendo el historial con la tabla de permisos temporales para poder filtrar por país u otros campos
    let query = this.supabaseClient
      .from('permisos_temporales_historial')
      .select(`
        id_historial,
        id_permiso_temporal,
        tipo_evento,
        fin_at_anterior,
        fin_at_nuevo,
        motivo,
        accion_por,
        created_at,
        permisos_temporales!inner (
          id_pais,
          id_usuario_beneficiario
        )
      `, { count: 'exact' });

    // Aplicar filtros condicionales
    if (filtros.accion_por) {
      query = query.eq('accion_por', filtros.accion_por);
    }
    if (filtros.tipo_evento) {
      query = query.eq('tipo_evento', filtros.tipo_evento);
    }
    if (filtros.id_permiso_temporal) {
      query = query.eq('id_permiso_temporal', filtros.id_permiso_temporal);
    }
    if (filtros.id_pais) {
      query = query.eq('permisos_temporales.id_pais', filtros.id_pais);
    }
    if (filtros.fecha_desde) {
      query = query.gte('created_at', filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      query = query.lte('created_at', filtros.fecha_hasta);
    }

    // Paginación para asegurar el rendimiento (RNF14: <= 1.5s)
    const limit = filtros.limit || 20;
    const offset = filtros.offset || 0;
    query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error al consultar el historial de auditoría: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  

  

}