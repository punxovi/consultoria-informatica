import { ApiError, createApiTransport } from '../api/transporte.ts';
import {
  donacionSchema,
  respaldoSchema,
  type DatosDonacionForm,
  type Donacion,
  type RespaldoDonacion,
  type ReservaRespaldo,
} from './modelo.ts';

export function crearClienteDonaciones(
  baseUrl: string,
  token: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const http = createApiTransport(baseUrl, fetchImpl);
  const cleanBase = baseUrl.replace(/\/$/, '');

  function validarDonacion(valor: unknown): Donacion {
    const parseado = donacionSchema.safeParse(valor);
    if (!parseado.success) {
      throw new ApiError(
        'RESPUESTA_INVALIDA',
        'Los datos de la donación recibidos no son válidos.',
        502,
      );
    }
    return parseado.data;
  }

  function validarRespaldo(valor: unknown, idDonacion?: string, idArchivo?: string): RespaldoDonacion {
    const parseado = respaldoSchema.safeParse(valor);
    if (!parseado.success) {
      throw new ApiError(
        'RESPUESTA_INVALIDA',
        'Los datos del respaldo documental recibido no son válidos.',
        502,
      );
    }
    if (idDonacion && parseado.data.id_donacion !== idDonacion) {
      throw new ApiError(
        'RESPUESTA_INVALIDA',
        'El respaldo recibido no corresponde a la donación solicitada.',
        502,
      );
    }
    if (idArchivo && parseado.data.id_archivo !== idArchivo) {
      throw new ApiError(
        'RESPUESTA_INVALIDA',
        'El respaldo recibido no corresponde al identificador solicitado.',
        502,
      );
    }
    return parseado.data;
  }

  async function binario(path: string, options: RequestInit): Promise<Response> {
    const accessToken = await token();
    let response: Response;
    try {
      response = await fetchImpl(`${cleanBase}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
    } catch {
      throw new ApiError(
        'SERVICIO_NO_DISPONIBLE',
        'No fue posible conectar con el servicio de archivos de donaciones.',
        0,
      );
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        payload?.error?.code ?? 'ERROR_ARCHIVO',
        payload?.error?.message ?? 'No fue posible completar la operación del archivo.',
        response.status,
      );
    }
    return response;
  }

  return {
    async listarDonaciones(idOrganizacion: string): Promise<Donacion[]> {
      const accessToken = await token();
      const respuesta = await http.request<{ donations: unknown[] }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations`,
        { accessToken },
      );
      if (!Array.isArray(respuesta.data?.donations)) {
        throw new ApiError(
          'RESPUESTA_INVALIDA',
          'No fue posible interpretar el listado de donaciones.',
          502,
        );
      }
      return respuesta.data.donations.map(validarDonacion);
    },

    async obtenerDonacion(idOrganizacion: string, idDonacion: string): Promise<Donacion> {
      const accessToken = await token();
      const respuesta = await http.request<{ donation: unknown }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(idDonacion)}`,
        { accessToken },
      );
      return validarDonacion(respuesta.data?.donation);
    },

    async crearDonacion(idOrganizacion: string, datos: DatosDonacionForm): Promise<Donacion> {
      const accessToken = await token();
      const respuesta = await http.request<{ donation: unknown }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations`,
        {
          method: 'POST',
          body: datos,
          accessToken,
        },
      );
      return validarDonacion(respuesta.data?.donation);
    },

    async listarRespaldos(idOrganizacion: string, idDonacion: string): Promise<RespaldoDonacion[]> {
      const accessToken = await token();
      const respuesta = await http.request<{ files: unknown[] }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(idDonacion)}/files`,
        { accessToken },
      );
      if (!Array.isArray(respuesta.data?.files)) {
        throw new ApiError(
          'RESPUESTA_INVALIDA',
          'No fue posible interpretar los respaldos de la donación.',
          502,
        );
      }
      return respuesta.data.files.map((item) => validarRespaldo(item, idDonacion));
    },

    async obtenerRespaldo(
      idOrganizacion: string,
      idDonacion: string,
      idArchivo: string,
    ): Promise<RespaldoDonacion> {
      const accessToken = await token();
      const respuesta = await http.request<{ file: unknown }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(idDonacion)}/files/${encodeURIComponent(idArchivo)}`,
        { accessToken },
      );
      return validarRespaldo(respuesta.data?.file, idDonacion, idArchivo);
    },

    async reservarRespaldo(
      idOrganizacion: string,
      idDonacion: string,
      reserva: ReservaRespaldo,
    ): Promise<RespaldoDonacion> {
      const accessToken = await token();
      const respuesta = await http.request<{ file: unknown }>(
        `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(idDonacion)}/files`,
        {
          method: 'POST',
          body: reserva,
          accessToken,
        },
      );
      return validarRespaldo(respuesta.data?.file, idDonacion);
    },

    async subirRespaldo(
      idOrganizacion: string,
      item: RespaldoDonacion,
      file: File | Blob,
    ): Promise<RespaldoDonacion> {
      const url = `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(item.id_donacion)}/files/${encodeURIComponent(item.id_archivo)}/file?version_esperada=${item.version}`;
      const response = await binario(url, {
        method: 'PUT',
        headers: {
          'content-type': item.mime_type,
        },
        body: file,
      });
      const json = await response.json().catch(() => null);
      if (!json?.ok) {
        throw new ApiError(
          'RESPUESTA_INVALIDA',
          'No se pudo confirmar la carga del respaldo.',
          502,
        );
      }
      const guardado = validarRespaldo(json.data?.file, item.id_donacion, item.id_archivo);
      if (guardado.estado_carga !== 'disponible') {
        throw new ApiError(
          'CARGA_PENDIENTE',
          'El archivo no quedó en estado disponible tras la carga.',
          502,
        );
      }
      return guardado;
    },

    async descargarRespaldo(
      idOrganizacion: string,
      item: RespaldoDonacion,
    ): Promise<Blob> {
      const url = `/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/donations/${encodeURIComponent(item.id_donacion)}/files/${encodeURIComponent(item.id_archivo)}/file`;
      const response = await binario(url, {
        method: 'GET',
      });
      return response.blob();
    },
  };
}
