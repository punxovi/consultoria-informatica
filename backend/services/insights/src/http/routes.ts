import type { IncomingMessage, ServerResponse } from 'node:http';
import { authContext } from '../../../../shared/auth-context/src/index.ts';
import { failure, health, success } from '../../../../shared/contracts/src/index.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { InsightsApplication } from '../application/insights-service.ts';
import { parseInsightFilters, parseReportRequest, parseConsolidatedFilters } from '../domain/insights.ts';

function respond(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

function tokenFrom(request: IncomingMessage): string {
  const value = request.headers.authorization;
  const context = authContext(Array.isArray(value) ? value[0] : value);
  if (!context.accessToken) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión para realizar esta operación.', 401);
  return context.accessToken;
}

export async function routeInsights(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  application: InsightsApplication,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://insights.local');
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      respond(response, 200, health('insights-service'), requestId); return;
    }
    
    // Actualizamos las capabilities para indicar que el reporte consolidado ya existe
    if (request.method === 'GET' && ['/v1/dashboard/capabilities', '/v1/reports/capabilities'].includes(url.pathname)) {
      respond(response, 200, success('INSIGHTS_MIGRADOS', 'El servicio de Dashboard y Reportes está disponible.', {
        migrated: true, dashboard: ['snapshot', 'country-filter'], reports: ['overview', 'consolidated'],
      }), requestId); return;
    }
    
    const token = tokenFrom(request);
    
    if (request.method === 'GET' && url.pathname === '/v1/dashboard') {
      const dashboard = await application.dashboard(token, parseInsightFilters(url));
      respond(response, 200, success('DASHBOARD_OBTENIDO', 'Las métricas fueron consultadas correctamente.', { dashboard }), requestId); return;
    }
    
    if (request.method === 'GET' && url.pathname === '/v1/reports/overview') {
      const reportRequest = parseReportRequest(url);
      const report = await application.reportOverview(token, reportRequest.filters, reportRequest.destination);
      respond(response, 200, success('REPORTE_RESUMEN_OBTENIDO', 'El resumen del reporte fue consultado correctamente.', { report }), requestId); return;
    }

    // --- NUEVA RUTA: REPORTE CONSOLIDADO ---
    if (request.method === 'GET' && url.pathname === '/v1/reports/consolidated') {
      const reportRequest = parseConsolidatedFilters(url);
      const report = await application.consolidatedReport(token, reportRequest);
      respond(response, 200, success('REPORTE_CONSOLIDADO_OBTENIDO', 'El reporte consolidado fue consultado correctamente.', { report }), requestId); 
      return;
    }

    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    respond(response, serviceError.status, failure(serviceError.code, serviceError.message, requestId), requestId);
  }
}