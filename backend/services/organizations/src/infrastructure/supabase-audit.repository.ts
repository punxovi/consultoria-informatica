import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import {
  AuditError,
  auditEventSchema,
  cursorSchema,
  encodeAuditCursor,
  type AuditFilters,
  type AuditPage,
  type AuditRepository,
} from '../domain/audit.ts';

interface Options { url: string; anonKey: string; fetchImpl?: typeof fetch }

export function createSupabaseAuditRepository(options: Options): AuditRepository {
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.url);
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
              ...(filters.id_usuario ? { id_usuario: filters.id_usuario } : {}),
              ...(filters.id_pais ? { id_pais: filters.id_pais } : {}),
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
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = typeof (body as { code?: unknown })?.code === 'string' ? (body as { code: string }).code : '';
        if (response.status === 401) throw new AuditError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
        if (code === '42501' || response.status === 403) throw new AuditError('SIN_PERMISO', 'Solo un Administrador activo puede consultar la auditoría.', 403);
        if (code === '22023') throw new AuditError('DATOS_INVALIDOS', 'Los filtros de auditoría no son válidos.', 400);
        if (code === 'PGRST202') throw new AuditError('MIGRACION_AUDITORIA_PENDIENTE', 'Falta aplicar la migración de consulta de auditoría.', 503);
        throw new AuditError('AUDITORIA_NO_DISPONIBLE', 'No fue posible consultar el historial de auditoría.', 503);
      }
      const value = body as { events?: unknown; next_cursor?: unknown };
      if (!value || !Array.isArray(value.events) || value.events.length > filters.limit) {
        throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió un historial inválido.', 502);
      }
      const events = value.events.map(event => {
        const parsed = auditEventSchema.safeParse(event);
        if (!parsed.success) throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió un evento de auditoría inválido.', 502);
        return parsed.data;
      });
      const next = value.next_cursor;
      if (next === null || next === undefined) return { events, nextCursor: null };
      const cursor = cursorSchema.safeParse(next);
      const last = events.at(-1);
      if (!cursor.success || !last || cursor.data.id !== last.id || cursor.data.fecha_hora !== last.fecha_hora) {
        throw new AuditError('RESPUESTA_INVALIDA', 'El servicio devolvió un cursor de auditoría inválido.', 502);
      }
      return { events, nextCursor: encodeAuditCursor(cursor.data) };
    },
  };
}

export function createSupabaseAuditRepositoryFromEnv(): AuditRepository {
  return createSupabaseAuditRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  });
}
