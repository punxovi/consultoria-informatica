import type {
  ActualizarOrganizacionInput,
  CrearOrganizacionInput,
  FiltrosOrganizaciones,
  ImagenOrganizacion,
  Organizacion,
  PaisResumen,
} from '../modelos/organizaciones.ts';
import { ApiError, createApiTransport, type ApiTransport } from '../api/transporte.ts';

const API_BASE_URL = import.meta.env?.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);

export interface CoberturaTerritorialVigente {
  id_permiso_temporal: string;
  id_pais: string;
  inicio_at: string;
  fin_at: string;
}

async function accessToken(): Promise<string> {
  const { getSupabaseClient } = await import('../supabase.ts');
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) {
    throw new ApiError('SESION_REQUERIDA', 'Tu sesión ha expirado. Vuelve a iniciar sesión.', 401);
  }
  return data.session.access_token;
}

const listar = crearClienteListadoOrganizaciones(transport, accessToken);

export async function listarOrganizaciones(
  filtros: FiltrosOrganizaciones = {},
): Promise<Organizacion[]> {
  return listar(filtros);
}

export function crearClienteListadoOrganizaciones(
  clienteHttp: ApiTransport,
  obtenerToken: () => Promise<string>,
): (filtros?: FiltrosOrganizaciones) => Promise<Organizacion[]> {
  return async (filtros = {}) => {
    const params = new URLSearchParams();
    const consulta = filtros.q?.trim();

    if (consulta) params.set('search', consulta);
    if (filtros.idPais) params.set('id_pais', filtros.idPais);
    if (filtros.idPrograma) params.set('id_programa', filtros.idPrograma);
    if (filtros.incluirArchivadas) params.set('incluir_archivadas', 'true');

    const query = params.size > 0 ? `?${params}` : '';
    const response = await clienteHttp.request<{ organizations: Organizacion[] }>(
      `/api/v1/organizations${query}`,
      { accessToken: await obtenerToken() },
    );
    const organizaciones = response.data.organizations;
    if (!Array.isArray(organizaciones)) {
      throw new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió un listado de organizaciones inválido.', 502);
    }
    return [...new Map(organizaciones.map((organizacion) => [organizacion.id_organizacion, organizacion])).values()];
  };
}

export async function obtenerOrganizacion(id: string): Promise<Organizacion> {
  const response = await transport.request<{ organization: Organizacion }>(
    `/api/v1/organizations/${encodeURIComponent(id)}`,
    { accessToken: await accessToken() },
  );
  return response.data.organization;
}

export async function crearOrganizacion(input: CrearOrganizacionInput): Promise<Organizacion> {
  const response = await transport.request<{ organization: Organizacion }>(
    '/api/v1/organizations',
    { method: 'POST', accessToken: await accessToken(), body: input },
  );
  return response.data.organization;
}

export async function actualizarOrganizacion(
  id: string,
  cambios: ActualizarOrganizacionInput,
  versionEsperada?: number,
): Promise<Organizacion> {
  const response = await transport.request<{ organization: Organizacion }>(
    `/api/v1/organizations/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      accessToken: await accessToken(),
      body: { cambios, ...(versionEsperada === undefined ? {} : { version_esperada: versionEsperada }) },
    },
  );
  return response.data.organization;
}

export async function listarPaisesOrganizaciones(): Promise<PaisResumen[]> {
  const response = await transport.request<{ countries: PaisResumen[] }>(
    '/api/v1/organizations/countries',
    { accessToken: await accessToken() },
  );

  if (!Array.isArray(response.data.countries)) {
    throw new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió un catálogo de países inválido.', 502);
  }

  return response.data.countries;
}

export async function listarMisCoberturasVigentes(): Promise<CoberturaTerritorialVigente[]> {
  const response = await transport.request<{
    coverages: CoberturaTerritorialVigente[];
  }>(
    '/api/v1/organizations/temporary-coverages/mine',
    { accessToken: await accessToken() },
  );

  if (!Array.isArray(response.data.coverages)) {
    throw new ApiError(
      'RESPUESTA_INVALIDA',
      'El servicio devolvió una lista de coberturas vigente inválida.',
      502,
    );
  }

  return response.data.coverages;
}

export function crearClienteImagenOrganizacion(
  baseUrl: string,
  obtenerToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
) {
  const base = baseUrl.replace(/\/$/, '');
  const ruta = (idOrganizacion: string) => `${base}/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/image`;

  async function solicitar(url: string, init: RequestInit): Promise<Response> {
    const token = await obtenerToken();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('SERVICIO_NO_DISPONIBLE', 'No fue posible conectar con el servicio de imágenes.', 0);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        payload?.error?.code ?? 'ERROR_IMAGEN',
        payload?.error?.message ?? (response.status === 413
          ? 'La imagen supera el tamaño permitido.'
          : 'No fue posible completar la operación con la imagen.'),
        response.status,
        payload?.error?.requestId,
      );
    }
    return response;
  }

  return {
    async subir(idOrganizacion: string, archivo: File): Promise<ImagenOrganizacion> {
      const response = await solicitar(`${ruta(idOrganizacion)}?nombre=${encodeURIComponent(archivo.name)}`, {
        method: 'PUT',
        headers: { 'content-type': archivo.type },
        body: archivo,
      });
      const payload = await response.json().catch(() => null);
      const imagen = payload?.data?.imagen;
      if (!payload?.ok || typeof imagen?.id_archivo !== 'string') {
        throw new ApiError('RESPUESTA_INVALIDA', 'No se pudo confirmar la carga de la imagen.', 502);
      }
      return imagen as ImagenOrganizacion;
    },

    async descargar(idOrganizacion: string): Promise<Blob> {
      const response = await solicitar(ruta(idOrganizacion), { method: 'GET' });
      return response.blob();
    },
  };
}

const imagenes = crearClienteImagenOrganizacion(API_BASE_URL, accessToken);

export function subirImagenOrganizacion(idOrganizacion: string, archivo: File): Promise<ImagenOrganizacion> {
  return imagenes.subir(idOrganizacion, archivo);
}

export function descargarImagenOrganizacion(idOrganizacion: string): Promise<Blob> {
  return imagenes.descargar(idOrganizacion);
}

export { ApiError as OrganizacionesApiError } from '../api/transporte.ts';
