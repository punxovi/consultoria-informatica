import type {
  ActualizarOrganizacionInput,
  CrearOrganizacionInput,
  FiltrosOrganizaciones,
  Organizacion,
  PaisResumen,
} from '../modelos/organizaciones.ts';
import { getSupabaseClient } from '../supabase.ts';
import { ApiError, createApiTransport } from '../api/transporte.ts';

const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
const transport = createApiTransport(API_BASE_URL);

async function accessToken(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error || !data.session) {
    throw new ApiError('SESION_REQUERIDA', 'Tu sesión ha expirado. Vuelve a iniciar sesión.', 401);
  }
  return data.session.access_token;
}

export async function listarOrganizaciones(
  filtros: FiltrosOrganizaciones = {},
): Promise<Organizacion[]> {
  const params = new URLSearchParams();
  if (filtros.idPais) params.set('id_pais', filtros.idPais);
  if (filtros.incluirArchivadas) params.set('incluir_archivadas', 'true');
  const query = params.size > 0 ? `?${params}` : '';
  const response = await transport.request<{ organizations: Organizacion[] }>(
    `/api/v1/organizations${query}`,
    { accessToken: await accessToken() },
  );
  return response.data.organizations;
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
