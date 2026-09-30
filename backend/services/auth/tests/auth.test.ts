import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createAuthServer } from '../src/server.ts';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createAuthServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fue posible iniciar Auth para la prueba.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('base del servicio Auth', () => {
  test('expone salud y capacidades sin reemplazar aún las Astro Actions', async () => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthBody = await healthResponse.json();
    const capabilitiesResponse = await fetch(`${baseUrl}/v1/auth/capabilities`);
    const capabilitiesBody = await capabilitiesResponse.json();

    assert.equal(healthResponse.status, 200);
    assert.equal(healthBody.data.service, 'auth-service');
    assert.equal(capabilitiesResponse.status, 200);
    assert.equal(capabilitiesBody.data.migrated, false);
    assert.deepEqual(capabilitiesBody.data.operations, [
      'login',
      'password-recovery',
      'password-change',
      'logout',
      'session',
    ]);
  });

  test('marca explícitamente como pendiente una operación funcional', async () => {
    const response = await fetch(`${baseUrl}/v1/auth/login`, { method: 'POST' });
    const body = await response.json();

    assert.equal(response.status, 501);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'AUTH_PENDIENTE_MIGRACION');
  });
});
