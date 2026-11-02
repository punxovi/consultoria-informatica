import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createProgramsApplication, type ProgramsApplication } from './application/programs-service.ts';
import { routePrograms } from './http/routes.ts';
import { createSupabaseProgramsRepositoryFromEnv } from './infrastructure/supabase-programs.repository.ts';

export function createProgramsServer(application?: ProgramsApplication): Server {
  const resolved = application ?? createProgramsApplication(createSupabaseProgramsRepositoryFromEnv());
  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'programs.request', { requestId, method: request.method, path: request.url });
    await routePrograms(request, response, requestId, resolved);
  });
}

export function programsPort(): number {
  return readPort('PROGRAMS_SERVICE_PORT', 4103);
}
