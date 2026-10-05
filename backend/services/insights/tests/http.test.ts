import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { InsightsApplication } from '../src/application/insights-service.ts';
import { createInsightsServer } from '../src/server.ts';

const countryId = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  generatedAt: '2026-10-01T00:00:00.000Z', selectedCountryId: null, countries: [],
  metrics: { organizations: 1, activePlans: 1, beneficiaries: 10, activeAlerts: 0 },
  progress: { total: 0, completed: 0, overdue: 0, percentage: 0 }, monthlyActions: [],
};
const application: InsightsApplication = {
  async dashboard() { return snapshot; },
  async reportOverview() { return { title: 'Resumen', description: 'Descripción', snapshot }; },
};
let server: Server;
let baseUrl: string;
before(async () => {
  server = createInsightsServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => new Promise<void>((resolve) => server.close(() => resolve())));
const headers = { authorization: 'Bearer token' };

describe('servicio HTTP de Dashboard y Reportes', () => {
  test('publica salud y capacidades sin sesión', async () => {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/dashboard/capabilities`)).status, 200);
  });
  test('protege métricas y reportes', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/dashboard`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/v1/reports/overview`)).status, 401);
  });
  test('entrega Dashboard y resumen con contrato estable', async () => {
    const dashboard = await fetch(`${baseUrl}/v1/dashboard?id_pais=${countryId}`, { headers });
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).data.dashboard.metrics.organizations, 1);
    const report = await fetch(`${baseUrl}/v1/reports/overview`, { headers });
    assert.equal(report.status, 200);
    assert.equal((await report.json()).code, 'REPORTE_RESUMEN_OBTENIDO');
  });
  test('rechaza filtros inválidos', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/dashboard?id_pais=invalido`, { headers })).status, 400);
  });
});
