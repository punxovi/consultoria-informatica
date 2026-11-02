import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createAuthApplication, type AuthApplication } from './application/auth-service.ts';
import { routeAuth } from './http/routes.ts';
import { createSupabaseAuthRepositoryFromEnv } from './infrastructure/supabase-auth.repository.ts';
import { createCoordinatorApplication, type CoordinatorApplication } from './application/coordinators-service.ts';
import { createSupabaseCoordinatorRepositoryFromEnv } from './infrastructure/supabase-coordinators.repository.ts';
import { routeCoordinators } from './http/coordinators-routes.ts';

export interface AuthServerOptions {
  application?: AuthApplication;
  coordinators?: CoordinatorApplication;
}

function defaultApplication(): AuthApplication {
  const repository = createSupabaseAuthRepositoryFromEnv();
  const redirectUrl = process.env.PASSWORD_RESET_REDIRECT_URL
    ?? 'http://127.0.0.1:4321/cambiar-contrasena';
  return createAuthApplication(repository, redirectUrl);
}

export function createAuthServer(options: AuthServerOptions = {}): Server {
  const application = options.application ?? defaultApplication();
  const coordinators = options.coordinators ?? createCoordinatorApplication(createSupabaseCoordinatorRepositoryFromEnv());
  return createServer((request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'auth.request', { requestId, method: request.method, path: request.url });
    const path = new URL(request.url ?? '/', 'http://auth.local').pathname;
    if (path === '/v1/coordinators' || path.startsWith('/v1/coordinators/')) {
      void routeCoordinators(request, response, requestId, coordinators);
    } else void routeAuth(request, response, requestId, application);
  });
}

export function authPort(): number {
  return readPort('AUTH_SERVICE_PORT', 4101);
}
