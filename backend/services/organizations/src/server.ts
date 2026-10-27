import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createOrganizationsApplication, type OrganizationsApplication } from './application/organizations-service.ts';
import { routeOrganizations } from './http/routes.ts';
import { createSupabaseOrganizationsRepositoryFromEnv } from './infrastructure/supabase-organizations.repository.ts';
import { createCountriesApplication, type CountriesApplication } from './application/countries-service.ts';
import { createSupabaseCountriesRepositoryFromEnv } from './infrastructure/supabase-countries.repository.ts';
import { routeCountries } from './http/countries-routes.ts';

export function createOrganizationsServer(application?: OrganizationsApplication, countries?: CountriesApplication): Server {
  const resolved = application ?? createOrganizationsApplication(createSupabaseOrganizationsRepositoryFromEnv());
  const resolvedCountries = countries ?? createCountriesApplication(createSupabaseCountriesRepositoryFromEnv());
  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'organizations.request', { requestId, method: request.method, path: request.url });
    const path = new URL(request.url ?? '/', 'http://organizations.local').pathname;
    if (path === '/v1/countries' || path.startsWith('/v1/countries/')) await routeCountries(request, response, requestId, resolvedCountries);
    else await routeOrganizations(request, response, requestId, resolved);
  });
}

export function organizationsPort(): number {
  return readPort('ORGANIZATIONS_SERVICE_PORT', 4102);
}
