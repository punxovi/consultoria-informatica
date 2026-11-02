import { CoverageError, type CoveragesRepository } from '../domain/coverages-api.ts';

interface Options {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

function databaseError(status: number, body: any): CoverageError {
  const code = typeof body?.code === 'string' ? body.code : '';
  const mapped: Record<string, [string, string, number]> = {
    '42501': ['SIN_PERMISO', 'Solo un Administrador activo puede administrar coberturas.', 403],
    P0160: ['COBERTURA_NO_ENCONTRADA', 'La cobertura no existe o ya no está disponible.', 404],
    P0161: ['CONFLICTO_VERSION', 'La cobertura cambió en otra sesión. Recarga antes de reintentar.', 409],
    P0162: ['COBERTURA_NO_EDITABLE', 'La cobertura está vencida o revocada y ya no puede modificarse.', 409],
    P0163: ['TERRITORIO_YA_ASIGNADO', 'El Coordinador ya tiene acceso permanente a ese país.', 409],
    P0164: ['COBERTURA_SOLAPADA', 'Ya existe una cobertura que se superpone para ese Coordinador y país.', 409],
    PGRST202: ['MIGRACION_COBERTURAS_PENDIENTE', 'Falta aplicar la migración de administración de coberturas.', 503],
    '22023': ['DATOS_INVALIDOS', 'Los datos de la cobertura no son válidos.', 400],
    '23503': ['REFERENCIA_INVALIDA', 'El Coordinador o país indicado ya no está disponible.', 409],
  };
  const known = mapped[code];
  if (known) return new CoverageError(...known);
  if (status === 401) return new CoverageError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
  if (status === 403) return new CoverageError('SIN_PERMISO', 'No tienes permisos para esta operación.', 403);
  return new CoverageError('COBERTURAS_NO_DISPONIBLES', 'No fue posible completar la operación de coberturas.', 503);
}

export function createSupabaseCoveragesRepository(options: Options): CoveragesRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.url.replace(/\/$/, '');

  return {
    async execute(token, operation, input) {
      if (!baseUrl || !options.anonKey) {
        throw new CoverageError('CONFIGURACION_SUPABASE', 'El servicio no tiene configurada su conexión a Supabase.', 503);
      }

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/rest/v1/rpc/administrar_coberturas`, {
          method: 'POST',
          headers: {
            apikey: options.anonKey,
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ p_operacion: operation, p_datos: input }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new CoverageError('COBERTURAS_NO_DISPONIBLES', 'No fue posible conectar con el servicio de coberturas.', 503);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new CoverageError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', 502);
      }
      if (!response.ok) throw databaseError(response.status, body);
      if ((operation === 'list' || operation === 'mine' || operation === 'history') && !Array.isArray(body)) {
        throw new CoverageError('RESPUESTA_INVALIDA', 'El servicio devolvió un listado de coberturas inválido.', 502);
      }
      if (!['list', 'mine'].includes(operation) && (!body || typeof body !== 'object' || Array.isArray(body))) {
        throw new CoverageError('RESPUESTA_INVALIDA', 'El servicio devolvió una cobertura inválida.', 502);
      }
      return body;
    },
  };
}

export function createSupabaseCoveragesRepositoryFromEnv(): CoveragesRepository {
  return createSupabaseCoveragesRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  });
}
