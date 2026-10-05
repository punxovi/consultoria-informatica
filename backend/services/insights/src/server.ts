import { createServer, type Server } from 'node:http';
import { readPort } from '../../../shared/config/src/index.ts';
import { getRequestId, logEvent } from '../../../shared/observability/src/index.ts';
import { createInsightsApplication, type InsightsApplication } from './application/insights-service.ts';
import { routeInsights } from './http/routes.ts';
import { createSupabaseInsightsRepositoryFromEnv } from './infrastructure/supabase-insights.repository.ts';

export function createInsightsServer(application?: InsightsApplication): Server {
  const resolved = application ?? createInsightsApplication(createSupabaseInsightsRepositoryFromEnv());
  return createServer(async (request, response) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    logEvent('info', 'insights.request', { requestId, method: request.method, path: request.url });
    await routeInsights(request, response, requestId, resolved);
  });
}
export function insightsPort(): number { return readPort('INSIGHTS_SERVICE_PORT', 4105); }
