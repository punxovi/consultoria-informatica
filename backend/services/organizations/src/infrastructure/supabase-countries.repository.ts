import { CountryError, type CountriesRepository } from '../domain/countries.ts';
interface Options { url: string; anonKey: string; fetchImpl?: typeof fetch }
export function createSupabaseCountriesRepository(options: Options): CountriesRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async execute(token, operation, input) {
      if (!options.url || !options.anonKey) throw new CountryError('CONFIGURACION_SUPABASE', 'El servicio no tiene configurada su conexión a Supabase.', 503);
      let response: Response;
      try {
        response = await fetchImpl(`${options.url.replace(/\/$/, '')}/rest/v1/rpc/administrar_paises`, {
          method: 'POST', headers: { apikey: options.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ p_operacion: operation, p_datos: input }), signal: AbortSignal.timeout(10000),
        });
      } catch { throw new CountryError('PAISES_NO_DISPONIBLES', 'No fue posible conectar con el servicio de países.', 503); }
      let body: any;
      try { body = await response.json(); } catch { throw new CountryError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', 502); }
      if (!response.ok) {
        const errors: Record<string, [string, string, number, string?]> = {
          '42501': ['SIN_PERMISO', 'Solo un Administrador activo puede administrar países.', 403],
          P0149: ['PAIS_NO_ENCONTRADO', 'El país solicitado no existe o está archivado.', 404],
          P0150: ['CONFLICTO_VERSION', 'El país cambió. Recarga antes de reintentar.', 409],
          '23505': ['PAIS_DUPLICADO', 'Ya existe un país con ese nombre o código ISO.', 409],
          P0151: ['ZONA_HORARIA_INVALIDA', 'La zona horaria no está disponible en la base de datos.', 400, 'zona_horaria'],
          '22023': ['DATOS_INVALIDOS', 'Revisa los campos obligatorios y sus formatos.', 400],
          '23514': ['DATOS_INVALIDOS', 'Los datos no cumplen las restricciones del país.', 400],
          '23502': ['DATOS_INVALIDOS', 'Faltan campos obligatorios del país.', 400],
          PGRST202: ['MIGRACION_PAISES_PENDIENTE', 'Falta aplicar la migración de administración de países.', 503],
        };
        const known = errors[body?.code];
        if (known) throw new CountryError(known[0], known[1], known[2], known[3] ? { [known[3]]: [known[1]] } : undefined);
        if (response.status === 401) throw new CountryError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
        if (response.status === 429) throw new CountryError('DEMASIADAS_SOLICITUDES', 'Inténtalo nuevamente más tarde.', 429);
        throw new CountryError('PAISES_NO_DISPONIBLES', 'No fue posible completar la operación de países.', 503);
      }
      if (operation === 'authorize' ? body?.authorized !== true : operation === 'list' ? !Array.isArray(body) : !body || typeof body.id_pais !== 'string') {
        throw new CountryError('RESPUESTA_INVALIDA', 'El contrato de países recibido no es válido.', 502);
      }
      return body;
    },
  };
}
export function createSupabaseCountriesRepositoryFromEnv(): CountriesRepository {
  return createSupabaseCountriesRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  });
}
