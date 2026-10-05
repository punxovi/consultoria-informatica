import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createOrganizationsApplication, type OrganizationsApplication } from './application/organizations-service.ts';
import { routeOrganizations } from './http/routes.ts';
import { createSupabaseOrganizationsRepositoryFromEnv } from './infrastructure/supabase-organizations.repository.ts';

export function createOrganizationsServer(application?: OrganizationsApplication): Server {
  const resolved = application ?? createOrganizationsApplication(createSupabaseOrganizationsRepositoryFromEnv());
  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'organizations.request', { requestId, method: request.method, path: request.url });
    await routeOrganizations(request, response, requestId, resolved);
  });
}

export function organizationsPort(): number {
  return readPort('ORGANIZATIONS_SERVICE_PORT', 4102);
}
