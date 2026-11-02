import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDashboardClient, ErrorInsights } from '../../src/lib/dashboard/cliente.ts';

const countryId = '11111111-1111-4111-8111-111111111111';
const snapshot = {
  generatedAt: '2026-10-01T00:00:00.000Z',
  selectedCountryId: countryId,
  countries: [],
  metrics: { organizations: 2, activePlans: 3, beneficiaries: 10, activeAlerts: 1 },
  progress: { total: 4, completed: 2, overdue: 1, percentage: 50 },
  monthlyActions: [],
  pendingActions: [],
};

test('Dashboard: consulta el Gateway con país, año y token de sesión; interpreta el contrato', async () => {
  const calls = [];
  const client = createDashboardClient('http://gateway.test', async () => 'session-token', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ ok: true, code: 'DASHBOARD_OBTENIDO', message: 'ok', data: { dashboard: snapshot } });
  });

  const result = await client.obtenerDashboard(countryId, 2026);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://gateway.test/api/v1/dashboard?id_pais=${countryId}&anio=2026`);
  assert.equal(calls[0].options.headers.authorization, 'Bearer session-token');
  assert.equal(result.metrics.organizations, 2);
  assert.equal(result.progress.percentage, 50);
  assert.deepEqual(result.pendingActions, []);
});

test('Dashboard: conserva manejo de sesión, permisos y fallas de conexión', async () => {
  const clientWithStatus = (status, code) => createDashboardClient(
    'http://gateway.test',
    async () => 'session-token',
    async () => Response.json({ ok: false, error: { code, message: 'Acceso denegado' }, data: null }, { status }),
  );

  await assert.rejects(clientWithStatus(401, 'SESION_REQUERIDA').obtenerDashboard(undefined, 2026),
    (error) => error instanceof ErrorInsights && error.code === 'SESION');
  await assert.rejects(clientWithStatus(403, 'SIN_PERMISO').obtenerDashboard(undefined, 2026),
    (error) => error instanceof ErrorInsights && error.code === 'SIN_PERMISO');
  const offline = createDashboardClient('http://gateway.test', async () => 'session-token', async () => { throw new Error('offline'); });
  await assert.rejects(offline.obtenerDashboard(undefined, 2026),
    (error) => error instanceof ErrorInsights && error.code === 'SERVICIO_NO_DISPONIBLE');
});
