import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createAuthApplication, type AuthApplication } from './application/auth-service.ts';
import { routeAuth } from './http/routes.ts';
import { createSupabaseAuthRepositoryFromEnv } from './infrastructure/supabase-auth.repository.ts';

export interface AuthServerOptions {
  application?: AuthApplication;
}

function defaultApplication(): AuthApplication {
  const repository = createSupabaseAuthRepositoryFromEnv();
  const redirectUrl = process.env.PASSWORD_RESET_REDIRECT_URL
    ?? 'http://127.0.0.1:4321/cambiar-contrasena';
  return createAuthApplication(repository, redirectUrl);
}

export function createAuthServer(options: AuthServerOptions = {}): Server {
  const application = options.application ?? defaultApplication();
  return createServer((request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'auth.request', { requestId, method: request.method, path: request.url });
    void routeAuth(request, response, requestId, application);
  });
}

export function authPort(): number {
  return readPort('AUTH_SERVICE_PORT', 4101);
}
