import { randomBytes } from 'node:crypto';
import { CoordinatorError, type CoordinatorRepository, type CreateCoordinator } from '../domain/coordinators.ts';

interface Options { url: string; anonKey: string; adminKey?: string; redirectUrl: string; fetchImpl?: typeof fetch }
export function createSupabaseCoordinatorRepository(options: Options): CoordinatorRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.url.replace(/\/$/, '');
  async function request(path: string, key: string, token: string, body: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { method: 'POST', headers: {
        apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json',
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch {
      throw new CoordinatorError('CUENTAS_NO_DISPONIBLES', 'No fue posible conectar con el servicio de cuentas. Recarga el listado antes de reintentar.', 503);
    }
    let data: any;
    try { data = await response.json(); } catch { throw new CoordinatorError('RESPUESTA_CUENTAS_INVALIDA', 'El servicio devolvió una respuesta inválida.', 502); }
    if (!response.ok) {
      // Only translate known codes. Never return/log provider bodies, keys or tokens.
      const codes: Record<string, [string, string, number, string?]> = {
        '42501': ['SIN_PERMISO', 'Solo un Administrador activo puede administrar Coordinadores.', 403],
        P0145: ['PAIS_PRINCIPAL_INVALIDO', 'Selecciona un país principal existente y activo.', 400, 'id_pais'],
        P0146: ['COORDINADOR_NO_ENCONTRADO', 'La cuenta de Coordinador no existe.', 404],
        P0147: ['CONFLICTO_VERSION', 'La cuenta cambió. Recarga antes de reintentar.', 409],
        P0148: ['CORREO_EN_USO', 'El correo ya está registrado.', 409, 'correo'],
        P0149: ['CUENTA_NO_ADMINISTRABLE', 'La cuenta tiene otras asignaciones y requiere revisión.', 409],
        '22023': ['DATOS_INVALIDOS', 'Los parámetros no son válidos.', 400],
        email_exists: ['CORREO_EN_USO', 'El correo ya está registrado.', 409, 'correo'],
        email_exists_already: ['CORREO_EN_USO', 'El correo ya está registrado.', 409, 'correo'],
        user_already_exists: ['CORREO_EN_USO', 'El correo ya está registrado.', 409, 'correo'],
        email_address_invalid: ['DATOS_INVALIDOS', 'Ingresa un correo válido.', 400, 'correo'],
      };
      const known = codes[data?.code] ?? codes[data?.error_code];
      if (known) throw new CoordinatorError(known[0], known[1], known[2], known[3] ? { [known[3]]: [known[1]] } : undefined);
      if (response.status === 401) throw new CoordinatorError('SESION_INVALIDA', 'La sesión no es válida o ha expirado.', 401);
      if (response.status === 429) throw new CoordinatorError('DEMASIADAS_SOLICITUDES', 'Inténtalo nuevamente más tarde.', 429);
      if (data?.code === 'PGRST202') throw new CoordinatorError('MIGRACION_COORDINADORES_PENDIENTE', 'Falta aplicar la migración de cuentas de Coordinadores.', 503);
      throw new CoordinatorError('CUENTAS_NO_DISPONIBLES', 'No fue posible completar la operación de cuentas.', 503);
    }
    return data;
  }
  return {
    assertProvisioningConfigured() {
      if (!options.adminKey) throw new CoordinatorError('CONFIGURACION_CUENTAS', 'El alta requiere configurar la credencial privada de Auth en el Backend.', 503);
    },
    async execute(token, operation, input) {
      const result = await request('/rest/v1/rpc/administrar_coordinadores', options.anonKey, token, { p_operacion: operation, p_datos: input });
      if (!result || typeof result !== 'object') throw new CoordinatorError('RESPUESTA_CUENTAS_INVALIDA', 'La respuesta de cuentas no es válida.', 502);
      if (result.denied) throw new CoordinatorError('SIN_PERMISO', 'Solo un Administrador activo puede administrar Coordinadores.', 403);
      return result;
    },
    async provision(input: CreateCoordinator, requestId: string) {
      this.assertProvisioningConfigured();
      const data = await request('/auth/v1/admin/users', options.adminKey!, options.adminKey!, {
        email: input.correo, password: randomBytes(48).toString('base64url'), email_confirm: true,
        user_metadata: { full_name: input.nombre }, app_metadata: { fge_coordinator_request: requestId },
      });
      if (typeof data?.id !== 'string') throw new CoordinatorError('RESPUESTA_CUENTAS_INVALIDA', 'No se pudo confirmar el alta. Recarga el listado.', 502);
      return data.id;
    },
    async sendAccess(correo) {
      try {
        await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(options.redirectUrl)}`, options.anonKey, options.anonKey, { email: correo });
        return true;
      } catch { return false; }
    },
  };
}
export function createSupabaseCoordinatorRepositoryFromEnv(): CoordinatorRepository {
  return createSupabaseCoordinatorRepository({
    url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
    adminKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    redirectUrl: process.env.PASSWORD_RESET_REDIRECT_URL ?? 'http://127.0.0.1:4321/cambiar-contrasena',
  });
}
