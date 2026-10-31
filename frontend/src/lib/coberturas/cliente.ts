import { ApiError, createApiTransport } from '../api/transporte.ts';
import type { CoberturaTemporalVista, CrearCoberturaFormulario } from './modelo.ts';

type CoberturaApi = {
  id_permiso_temporal: string;
  id_usuario_beneficiario: string;
  coordinador_nombre: string;
  id_pais: string;
  pais_nombre: string;
  motivo: string;
  inicio_at: string;
  fin_at: string;
  revocado_at: string | null;
  version: number;
  condicion: CoberturaTemporalVista['condicion'];
  puede_extender: boolean;
  puede_revocar: boolean;
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function errorRespuesta(): ApiError {
  return new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió una cobertura inválida.', 502);
}

function validarCobertura(valor: unknown): CoberturaTemporalVista {
  if (!esObjeto(valor)) throw errorRespuesta();
  const cobertura = valor as unknown as CoberturaApi;
  const condicionValida = ['vigente', 'futura', 'vencida', 'revocada'].includes(cobertura.condicion);
  if (
    ![
      cobertura.id_permiso_temporal,
      cobertura.id_usuario_beneficiario,
      cobertura.coordinador_nombre,
      cobertura.id_pais,
      cobertura.pais_nombre,
      cobertura.motivo,
      cobertura.inicio_at,
      cobertura.fin_at,
    ].every((campo) => typeof campo === 'string' && campo.length > 0)
    || typeof cobertura.version !== 'number'
    || !Number.isSafeInteger(cobertura.version)
    || cobertura.version < 1
    || !(cobertura.revocado_at === null || typeof cobertura.revocado_at === 'string')
    || !condicionValida
    || typeof cobertura.puede_extender !== 'boolean'
    || typeof cobertura.puede_revocar !== 'boolean'
  ) throw errorRespuesta();

  return {
    id_permiso_temporal: cobertura.id_permiso_temporal,
    id_usuario_beneficiario: cobertura.id_usuario_beneficiario,
    coordinador_nombre: cobertura.coordinador_nombre,
    id_pais: cobertura.id_pais,
    pais_nombre: cobertura.pais_nombre,
    motivo: cobertura.motivo,
    inicio_at: cobertura.inicio_at,
    fin_at: cobertura.fin_at,
    revocado_at: cobertura.revocado_at,
    version: cobertura.version,
    condicion: cobertura.condicion,
    puedeExtender: cobertura.puede_extender,
    puedeRevocar: cobertura.puede_revocar,
  };
}

export function crearClienteCoberturas(
  baseUrl: string,
  token: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const http = createApiTransport(baseUrl, fetchImpl);
  const ruta = (id?: string, accion?: 'extend' | 'revoke') => {
    const base = '/api/v1/organizations/temporary-coverages';
    return id ? `${base}/${encodeURIComponent(id)}/${accion}` : base;
  };

  return {
    async listar(): Promise<CoberturaTemporalVista[]> {
      const respuesta = await http.request<{ coverages: unknown }>(ruta(), { accessToken: await token() });
      if (!Array.isArray(respuesta.data?.coverages)) throw errorRespuesta();
      return respuesta.data.coverages.map(validarCobertura);
    },

    async crear(datos: CrearCoberturaFormulario): Promise<CoberturaTemporalVista> {
      const respuesta = await http.request<{ coverage: unknown }>(ruta(), {
        method: 'POST',
        accessToken: await token(),
        body: {
          id_usuario_beneficiario: datos.id_usuario_beneficiario,
          id_pais: datos.id_pais,
          inicio_at: datos.fecha_inicio,
          fin_at: datos.fecha_termino,
          motivo: datos.motivo,
        },
      });
      return validarCobertura(respuesta.data?.coverage);
    },

    async extender(
      id: string,
      version: number,
      nuevaFechaTermino: string,
      motivo?: string,
    ): Promise<CoberturaTemporalVista> {
      const respuesta = await http.request<{ coverage: unknown }>(ruta(id, 'extend'), {
        method: 'PATCH',
        accessToken: await token(),
        body: {
          version_esperada: version,
          nueva_fin_at: nuevaFechaTermino,
          ...(motivo?.trim() ? { motivo: motivo.trim() } : {}),
        },
      });
      return validarCobertura(respuesta.data?.coverage);
    },

    async revocar(
      id: string,
      version: number,
      motivo: string,
    ): Promise<CoberturaTemporalVista> {
      const respuesta = await http.request<{ coverage: unknown }>(ruta(id, 'revoke'), {
        method: 'PATCH',
        accessToken: await token(),
        body: { version_esperada: version, motivo_revocacion: motivo.trim() },
      });
      return validarCobertura(respuesta.data?.coverage);
    },
  };
}

export type ClienteCoberturas = ReturnType<typeof crearClienteCoberturas>;

export function clienteCoberturasNavegador(): ClienteCoberturas {
  return crearClienteCoberturas(
    import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000',
    async () => {
      const { getSupabaseClient } = await import('../supabase.ts');
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error || !data.session) {
        throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
      }
      return data.session.access_token;
    },
  );
}

export function mensajeErrorCoberturas(error: unknown, accion: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'MIGRACION_COBERTURAS_PENDIENTE') return 'La administración de coberturas requiere una migración pendiente en Supabase.';
    if (error.code === 'CONFIGURACION_SUPABASE') return 'El servicio de coberturas no tiene configurada su conexión a Supabase.';
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'Solo un Administrador puede gestionar coberturas.';
    if (error.status === 404) return 'La cobertura ya no existe o no está disponible.';
    if (error.status === 409) return error.message || 'La cobertura cambió. Recarga antes de reintentar.';
    if (error.status === 0 || error.status >= 500) return `No fue posible ${accion}. Revisa tu conexión e inténtalo nuevamente.`;
    return error.message || `No fue posible ${accion}.`;
  }
  return `No fue posible ${accion}. Inténtalo nuevamente.`;
}
