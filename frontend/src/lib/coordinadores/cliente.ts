import { ApiError, createApiTransport } from '../api/transporte.ts';
import {
  coordinadorSchema,
  type Coordinador,
  type DatosCrearCoordinador,
  type DatosEditarCoordinador,
} from './modelo.ts';

// Cliente HTTP de cuentas de Coordinadores. Las rutas siguen el contrato propuesto en
// docs/CONTRATO-COORDINADORES.md; el Backend debe exponerlas a través del API Gateway.
export function crearClienteCoordinadores(
  baseUrl: string,
  token: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const http = createApiTransport(baseUrl, fetchImpl);
  const invalida = () => new ApiError('RESPUESTA_INVALIDA', 'Los datos de la cuenta recibidos no son válidos.', 502);

  function validar(valor: unknown, idEsperado?: string): Coordinador {
    const resultado = coordinadorSchema.safeParse(valor);
    if (!resultado.success || (idEsperado && resultado.data.id_usuario !== idEsperado)) throw invalida();
    return resultado.data;
  }

  const ruta = (id?: string) => `/api/v1/coordinators${id ? `/${encodeURIComponent(id)}` : ''}`;

  return {
    async listar(): Promise<Coordinador[]> {
      const respuesta = await http.request<{ coordinators: unknown }>(ruta(), { accessToken: await token() });
      if (!Array.isArray(respuesta.data?.coordinators)) throw invalida();
      return respuesta.data.coordinators.map((item) => validar(item));
    },

    async obtener(id: string): Promise<Coordinador> {
      const respuesta = await http.request<{ coordinator: unknown }>(ruta(id), { accessToken: await token() });
      return validar(respuesta.data?.coordinator, id);
    },

    async crear(datos: DatosCrearCoordinador): Promise<Coordinador> {
      const respuesta = await http.request<{ coordinator: unknown }>(ruta(), {
        method: 'POST',
        body: datos,
        accessToken: await token(),
      });
      return validar(respuesta.data?.coordinator);
    },

    async actualizar(id: string, versionEsperada: number, cambios: Partial<DatosEditarCoordinador>): Promise<Coordinador> {
      const respuesta = await http.request<{ coordinator: unknown }>(ruta(id), {
        method: 'PATCH',
        body: { version_esperada: versionEsperada, cambios },
        accessToken: await token(),
      });
      return validar(respuesta.data?.coordinator, id);
    },

    async cambiarEstado(id: string, versionEsperada: number, activo: boolean): Promise<Coordinador> {
      const respuesta = await http.request<{ coordinator: unknown }>(`${ruta(id)}/${activo ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        body: { version_esperada: versionEsperada },
        accessToken: await token(),
      });
      const actualizado = validar(respuesta.data?.coordinator, id);
      if (actualizado.activo !== activo) throw invalida();
      return actualizado;
    },
  };
}

export type ClienteCoordinadores = ReturnType<typeof crearClienteCoordinadores>;

// Mensajes para la interfaz según el error del servicio.
export function mensajeErrorCoordinadores(error: unknown, accion: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'RUTA_NO_ENCONTRADA') return 'El servicio de cuentas de Coordinadores todavía no está disponible.';
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'Solo el Administrador puede gestionar cuentas de Coordinadores.';
    if (error.status === 404) return 'La cuenta solicitada no existe o ya no está disponible.';
    if (error.status === 409) return 'La cuenta cambió en otra sesión. Recarga la información antes de volver a intentarlo.';
    if (error.status === 0 || error.status >= 500) return `No fue posible ${accion}. Revisa tu conexión e inténtalo nuevamente.`;
    return error.message || `No fue posible ${accion}.`;
  }
  return `No fue posible ${accion}. Inténtalo nuevamente.`;
}

export function clienteCoordinadoresNavegador(): ClienteCoordinadores {
  return crearClienteCoordinadores(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { getSupabaseClient } = await import('../supabase.ts');
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
}
