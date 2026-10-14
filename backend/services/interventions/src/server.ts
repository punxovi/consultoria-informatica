import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createInterventionsApplication, type InterventionsApplication } from './application/interventions-service.ts';
import { routeInterventions } from './http/routes.ts';
import { createSupabaseInterventionsRepositoriesFromEnv } from './infrastructure/supabase-interventions.repository.ts';
import { createSupabaseEvidencesRepositoryFromEnv } from './infrastructure/supabase-evidences.repository.ts';

export function createInterventionsServer(application?: InterventionsApplication): Server {
  const repositories = application ? undefined : createSupabaseInterventionsRepositoriesFromEnv();
  const resolved = application ?? createInterventionsApplication(
    repositories!.plans,
    repositories!.actions,
    repositories!.meetingMinutes,
    createSupabaseEvidencesRepositoryFromEnv(),
  );
  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'interventions.request', { requestId, method: request.method, path: request.url });
    await routeInterventions(request, response, requestId, resolved);
  });
}

export function interventionsPort(): number { return readPort('INTERVENTIONS_SERVICE_PORT', 4104); }
