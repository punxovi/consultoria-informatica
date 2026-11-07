import {
  AuditError,
  auditEventSchema,
  encodeAuditCursor,
  type AuditFilters,
  type AuditPage,
  type AuditRepository,
} from '../domain/audit.ts';

interface Options { url: string; anonKey: string; fetchImpl?: typeof fetch }

export function createSupabaseAuditRepository(options: Options): AuditRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.url.replace(/\/$/, '');
  return {
    async list(token: string, filters: AuditFilters): Promise<AuditPage> {
      if (!base || !options.anonKey) {
        throw new AuditError('CONFIGURACION_SUPABASE', 'El servicio de auditoría no tiene configurada su conexión.', 503);
      }
      let response: Response;
      try {
        response = await fetchImpl(`${base}/rest/v1/rpc/consultar_eventos_auditoria`, {
          method: 'POST',
          headers: { apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            p_filtros: {
              usuario: filters.usuario ?? null,
              pais: filters.pais ?? null,
              desde: filters.desde ?? null,
              hasta: filters.hasta ?? null,
              operacion: filters.operacion ?? null,
              entidad: filters.entidad ?? null,
              zona_horaria: filters.zonaHoraria ?? null,
              limit: filters.limit,
              cursor_fecha: filters.cursor?.fecha_hora ?? null,
              cursor_id: filters.cursor?.id ?? null,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new AuditError('AUDITORIA_NO_DISPONIBLE', 'No fue posible conectar con el servicio de auditoría.', 503);
      }
      let body: unknown;
      try { body = await response.json(); } catch {
        throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', 502);
      }
      if (!response.ok) {
        const code = typeof (body as { code?: unknown })?.code === 'string' ? (body as { code: string }).code : '';
        if (code === '42501') throw new AuditError('SIN_PERMISO', 'Solo un Administrador activo puede consultar la auditoría.', 403);
        if (code === '22023') throw new AuditError('DATOS_INVALIDOS', 'Los filtros de auditoría no son válidos.', 400);
        if (code === 'PGRST202') throw new AuditError('MIGRACION_AUDITORIA_PENDIENTE', 'Falta aplicar la migración de consulta de auditoría.', 503);
        if (response.status === 401) throw new AuditError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
        throw new AuditError('AUDITORIA_NO_DISPONIBLE', 'No fue posible consultar el historial de auditoría.', 503);
      }
      const value = body as { events?: unknown; next_cursor?: unknown };
      if (!value || !Array.isArray(value.events)) {
        throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió un historial inválido.', 502);
      }
      const events = value.events.map(event => {
        const parsed = auditEventSchema.safeParse(event);
        if (!parsed.success) throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió un evento de auditoría inválido.', 502);
        return parsed.data;
      });
      const next = value.next_cursor;
      if (next === null || next === undefined) return { events, nextCursor: null };
      if (!next || typeof next !== 'object' || typeof (next as any).fecha_hora !== 'string' || typeof (next as any).id !== 'string') {
        throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió una página de auditoría inválida.', 502);
      }
      return { events, nextCursor: encodeAuditCursor(next as { fecha_hora: string; id: string }) };
    },
  };
}

export function createSupabaseAuditRepositoryFromEnv(): AuditRepository {
  return createSupabaseAuditRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  });
}
