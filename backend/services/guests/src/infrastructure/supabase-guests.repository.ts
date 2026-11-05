import { GuestError, type GuestRepository, type CreateGuestInput } from '../domain/guests.ts';

interface Options { url: string; anonKey: string; adminKey?: string; redirectUrl: string; fetchImpl?: typeof fetch }

export function createSupabaseGuestRepository(options: Options): GuestRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.url.replace(/\/$/, '');

  async function request(path: string, key: string, token: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          apikey: key,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new GuestError('SERVICIO_NO_DISPONIBLE', 'No fue posible conectar con el servicio de invitados.', 503);
    }

    let data: any;
    try {
      // Leemos como texto primero para evitar caídas si viene vacío, y luego parseamos
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new GuestError('RESPUESTA_INVALIDA', 'El servicio devolvió una respuesta inválida.', 502);
    }


    if (!response.ok) {
      const codes: Record<string, [string, string, number, string?]> = {
        '42501': ['SIN_PERMISO', 'Solo un Administrador activo puede gestionar invitados.', 403],
        G0145: ['DATOS_INVALIDOS', 'Los datos proporcionados no son válidos.', 400],
        G0146: ['INVITADO_NO_ENCONTRADO', 'La solicitud de invitado no existe.', 404],
        G0147: ['CONFLICTO_VERSION', 'El registro cambió. Recarga antes de reintentar.', 409],
        G0148: ['CORREO_EN_USO', 'Ya existe una solicitud pendiente o activa para este correo.', 409, 'correo'],
      };

      const known = codes[data?.code] ?? codes[data?.error_code];
      if (known) {
        throw new GuestError(known[0], known[1], known[2], known[3] ? { [known[3]]: [known[1]] } : undefined);
      }
      if (response.status === 401) throw new GuestError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
      if (response.status === 429) throw new GuestError('DEMASIADAS_SOLICITUDES', 'Inténtalo nuevamente más tarde.', 429);
      
      throw new GuestError('ERROR_INTERNO', 'No fue posible completar la operación de invitados.', 503);
    }

    return data;
  }

  return {
    async execute(token, operation, input) {
      const result = await request(
        '/rest/v1/rpc/gestionar_invitados',
        options.anonKey,
        token || options.anonKey,
        { p_operacion: operation, p_datos: input },
      );
      if (result === null) return null;
      if (!result || typeof result !== 'object') {
        throw new GuestError('RESPUESTA_INVALIDA', 'La respuesta del servicio no es válida.', 502);
      }
      return result;
    },

    async sendGuestAccessLink(correo, link) {
      try {
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(link)}`, options.anonKey, options.anonKey, { email: correo });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createSupabaseGuestRepositoryFromEnv(): GuestRepository {
  return createSupabaseGuestRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    adminKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    redirectUrl: process.env.GUEST_ACCESS_REDIRECT_URL ?? 'http://127.0.0.1:4321/invitado/acceso',
  });
}