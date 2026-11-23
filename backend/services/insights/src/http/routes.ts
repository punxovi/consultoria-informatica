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
    
    if (request.method === 'GET' && ['/v1/dashboard/capabilities', '/v1/reports/capabilities'].includes(url.pathname)) {
      respond(response, 200, success('INSIGHTS_MIGRADOS', 'El servicio de Dashboard y Reportes está disponible.', {
        migrated: true, dashboard: ['snapshot', 'country-filter', 'year-filter', 'pending-actions'], reports: ['overview', 'consolidated','pdf'],
      }), requestId); return;
    }
    
    const token = tokenFrom(request);
    const pdfMatch=url.pathname.match(/^\/v1\/reports\/([^/]+)\/pdf$/);
    if(request.method==='GET'&&pdfMatch) {
      if(url.search)throw new ServiceError('DATOS_INVALIDOS','La descarga usa el reporte preparado y no admite nuevos filtros.',400);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pdfMatch[1]))throw new ServiceError('DATOS_INVALIDOS','El identificador del reporte no es válido.',400);
      const file=await application.downloadReportPdf(token,pdfMatch[1]);
      response.statusCode=200;
      response.setHeader('content-type',file.mimeType);
      response.setHeader('content-disposition',`attachment; filename="${file.fileName}"`);
      response.setHeader('content-length',file.bytes.length);
      response.setHeader('cache-control','no-store, private');
      response.setHeader('x-content-type-options','nosniff');
      response.setHeader('x-request-id',requestId);
      response.once('error',()=>response.destroy());
      response.end(file.bytes);return;
    }
    
    if (request.method === 'GET' && url.pathname === '/v1/dashboard') {
      const dashboard = await application.dashboard(token, parseInsightFilters(url));
      respond(response, 200, success('DASHBOARD_OBTENIDO', 'Las métricas fueron consultadas correctamente.', { dashboard }), requestId); return;
    }
    
    if (request.method === 'GET' && url.pathname === '/v1/reports/overview') {
      const reportRequest = parseReportRequest(url);
      const report = await application.reportOverview(token, reportRequest.filters, reportRequest.destination);
      respond(response, 200, success('REPORTE_RESUMEN_OBTENIDO', 'El resumen del reporte fue consultado correctamente.', { report }), requestId); return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/reports/consolidated') {
      const reportRequest = parseConsolidatedFilters(url);
      const report = await application.consolidatedReport(token, reportRequest);
      respond(response, 200, success('REPORTE_CONSOLIDADO_OBTENIDO', 'El reporte consolidado fue consultado correctamente.', { report }), requestId); 
      return;
    }

    respond(response, 404, failure('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', requestId), requestId);
  } catch (error) {
    const serviceError = error instanceof ServiceError ? error : new ServiceError('ERROR_INTERNO', 'No fue posible completar la operación.', 500, error);
    if(response.headersSent||response.destroyed){response.destroy();return;}
    respond(response, serviceError.status, failure(serviceError.code, serviceError.message, requestId), requestId);
  }
}
