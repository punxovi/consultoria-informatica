import type { ActualizarOrganizacionInput, CrearOrganizacionInput, FiltrosOrganizaciones, Organizacion, PaisResumen,} from '../modelos/organizaciones.ts';
import { ApiError, createApiTransport, type ApiTransport } from '../api/transporte.ts';

const API_BASE_URL = import.meta.env?.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);

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
    // El cliente conserva `q` en el estado de la pantalla; el contrato Backend
    // denomina `search` al texto de búsqueda.
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
  return response.data.countries;
}

export { ApiError as OrganizacionesApiError } from '../api/transporte.ts';
