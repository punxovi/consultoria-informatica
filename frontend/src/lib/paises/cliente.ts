
import { ApiError, createApiTransport } from '../api/transporte.ts';
import type {
  Pais,
  DatosCrearPais,
  DatosActualizarPais,
} from './modelo.ts';

const API_BASE_URL =
  import.meta.env?.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';

async function obtenerToken(): Promise<string> {
  const { getSupabaseClient } = await import('../supabase.ts');
  const { data, error } = await getSupabaseClient().auth.getSession();

  if (error || !data.session) {
    throw new ApiError(
      'SESION_REQUERIDA',
      'Tu sesión ha expirado. Vuelve a iniciar sesión.',
      401,
    );
  }

  return data.session.access_token;
}

function crearErrorRespuesta(): ApiError {
  return new ApiError(
    'RESPUESTA_INVALIDA',
    'El servicio devolvió datos de un país inválidos.',
    502,
  );
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function validarPais(valor: unknown, idEsperado?: string): Pais {
  if (!esObjeto(valor)) {
    throw crearErrorRespuesta();
  }

  const camposTexto = [
    'id_pais',
    'nombre',
    'codigo_iso',
    'created_at',
    'updated_at',
  ] as const;

  if (
    !camposTexto.every((campo) => typeof valor[campo] === 'string') ||
    (idEsperado !== undefined && valor.id_pais !== idEsperado) ||
    !(
      valor.codigo_area_telefonica === null ||
      typeof valor.codigo_area_telefonica === 'string'
    ) ||
    !(
      valor.zona_horaria === null ||
      typeof valor.zona_horaria === 'string'
    ) ||
    typeof valor.version !== 'number' ||
    !Number.isSafeInteger(valor.version) ||
    valor.version < 1 ||
    typeof valor.configuracion_pendiente !== 'boolean'
  ) {
    throw crearErrorRespuesta();
  }

  return valor as unknown as Pais;
}

export function crearClientePaises(
  baseUrl: string,
  token: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const http = createApiTransport(baseUrl, fetchImpl);
  const ruta = (id?: string) =>
    `/api/v1/countries${
      id !== undefined ? `/${encodeURIComponent(id)}` : ''
    }`;

  return {
    async listar(): Promise<Pais[]> {
      const respuesta = await http.request<{ countries: unknown }>(
        ruta(),
        { accessToken: await token() },
      );

      if (!Array.isArray(respuesta.data?.countries)) {
        throw crearErrorRespuesta();
      }

      return respuesta.data.countries.map((pais) => validarPais(pais));
    },

    async obtener(id: string): Promise<Pais> {
      const respuesta = await http.request<{ country: unknown }>(
        ruta(id),
        { accessToken: await token() },
      );

      return validarPais(respuesta.data?.country, id);
    },

    async crear(datos: DatosCrearPais): Promise<Pais> {
      const respuesta = await http.request<{ country: unknown }>(
        ruta(),
        {
          method: 'POST',
          body: datos,
          accessToken: await token(),
        },
      );

      return validarPais(respuesta.data?.country);
    },

    async actualizar(
      id: string,
      versionEsperada: number,
      cambios: DatosActualizarPais,
    ): Promise<Pais> {
      if (!Number.isSafeInteger(versionEsperada) || versionEsperada < 1) {
        throw new Error('La versión esperada del país no es válida.');
      }

      if (Object.keys(cambios).length === 0) {
        throw new Error('Debes indicar al menos un cambio.');
      }

      const respuesta = await http.request<{ country: unknown }>(
        ruta(id),
        {
          method: 'PATCH',
          body: {
            version_esperada: versionEsperada,
            cambios,
          },
          accessToken: await token(),
        },
      );

      return validarPais(respuesta.data?.country, id);
    },
  };
}

export type ClientePaises = ReturnType<typeof crearClientePaises>;

export function mensajeErrorPaises(error: unknown, accion: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'RUTA_NO_ENCONTRADA') {
      return 'El servicio de países todavía no está disponible.';
    }
    if (error.code === 'MIGRACION_PAISES_PENDIENTE') {
      return 'La administración de países requiere una migración pendiente en Supabase.';
    }
    if (error.code === 'CONFIGURACION_SUPABASE') {
      return 'El servicio de países no tiene configurada su conexión a Supabase.';
    }
    if (error.status === 401) {
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    }
    if (error.status === 403) {
      return 'Solo un Administrador puede administrar los países.';
    }
    if (error.status === 404) {
      return 'El país solicitado no existe o ya no está disponible.';
    }
    if (error.status === 409) {
      return 'El país cambió en otra sesión. Recarga la información antes de volver a intentarlo.';
    }
    if (error.status === 0 || error.status >= 500) {
      return `No fue posible ${accion}. Revisa tu conexión e inténtalo nuevamente.`;
    }
    return error.message || `No fue posible ${accion}.`;
  }

  return `No fue posible ${accion}. Inténtalo nuevamente.`;
}

export function clientePaisesNavegador(): ClientePaises {
  return crearClientePaises(
    API_BASE_URL,
    obtenerToken,
  );
}
