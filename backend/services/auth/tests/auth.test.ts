import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { AuthApplication } from '../src/application/auth-service.ts';
import type { AuthSession, AuthUser } from '../src/domain/auth.ts';
import { createAuthServer } from '../src/server.ts';

const user: AuthUser = { id: 'usuario-1', email: 'qa@example.com' };
const session: AuthSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token-valido',
  expires_in: 3600,
  token_type: 'bearer',
  user,
};

const calls: string[] = [];
const application: AuthApplication = {
  async login(input) { calls.push(`login:${input.correo}`); return session; },
  async requestRecovery(input) { calls.push(`recovery:${input.correo}`); },
  async changePassword(token) { calls.push(`change:${token}`); return user; },
  async getSession(token) { calls.push(`session:${token}`); return { authenticated: true, user }; },
  async refreshSession(token) { calls.push(`refresh:${token}`); return session; },
  async logout(token) { calls.push(`logout:${token}`); },
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = createAuthServer({ application });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fue posible iniciar Auth para la prueba.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function post(path: string, body: unknown, authenticated = false): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { authorization: 'Bearer access-token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('servicio Auth HTTP', () => {
  test('publica salud y confirma la migración de seis operaciones', async () => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthBody = await healthResponse.json();
    const capabilitiesResponse = await fetch(`${baseUrl}/v1/auth/capabilities`);
    const capabilitiesBody = await capabilitiesResponse.json();

    assert.equal(healthResponse.status, 200);
    assert.equal(healthBody.data.service, 'auth-service');
    assert.equal(capabilitiesBody.data.migrated, true);
    assert.equal(capabilitiesBody.data.operations.length, 6);
  });

  test('inicia sesión con entrada normalizada', async () => {
    const response = await post('/v1/auth/login', { correo: ' QA@Example.COM ', password: 'secreto' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.session.access_token, 'access-token');
    assert.ok(calls.includes('login:qa@example.com'));
  });

  test('solicita recuperación sin revelar si existe la cuenta', async () => {
    const response = await post('/v1/auth/password/recovery', { correo: 'qa@example.com' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.code, 'RECUPERACION_SOLICITADA');
    assert.ok(calls.includes('recovery:qa@example.com'));
  });

  test('protege cambio, consulta y cierre con Bearer', async () => {
    const unauthorized = await post('/v1/auth/password/change', {
      password: '12345678',
      confirmPassword: '12345678',
    });
    assert.equal(unauthorized.status, 401);

    const changed = await post('/v1/auth/password/change', {
      password: '12345678',
      confirmPassword: '12345678',
    }, true);
    const current = await fetch(`${baseUrl}/v1/auth/session`, {
      headers: { authorization: 'Bearer access-token' },
    });
    const logout = await post('/v1/auth/logout', {}, true);

    assert.equal(changed.status, 200);
    assert.equal(current.status, 200);
    assert.equal(logout.status, 200);
    assert.ok(calls.includes('change:access-token'));
    assert.ok(calls.includes('session:access-token'));
    assert.ok(calls.includes('logout:access-token'));
  });

  test('renueva una sesión y rechaza JSON o campos inválidos', async () => {
    const refreshed = await post('/v1/auth/session/refresh', { refreshToken: 'refresh-token-valido' });
    const extraField = await post('/v1/auth/login', {
      correo: 'qa@example.com',
      password: 'secreto',
      role: 'ADMIN',
    });
    const invalidJson = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    assert.equal(refreshed.status, 200);
    assert.ok(calls.includes('refresh:refresh-token-valido'));
    assert.equal(extraField.status, 400);
    assert.equal(invalidJson.status, 400);
  });
});
