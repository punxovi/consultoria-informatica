import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthApiError,
  createAuthTransport,
} from '../../src/lib/auth/transporte.ts';

test('Auth transport envía JSON y Bearer al Gateway', async () => {
  let captured;
  const transport = createAuthTransport('http://gateway.test/', async (input, init) => {
    captured = { input: String(input), init };
    return Response.json({
      ok: true,
      code: 'SESION_INICIADA',
      message: 'Correcto.',
      data: { session: { access_token: 'token' } },
    });
  });

  const response = await transport.request('/api/v1/auth/login', {
    method: 'POST',
    accessToken: 'access-token',
    body: { correo: 'qa@example.com', password: 'secreto' },
  });

  assert.equal(captured.input, 'http://gateway.test/api/v1/auth/login');
  assert.equal(new Headers(captured.init.headers).get('authorization'), 'Bearer access-token');
  assert.match(captured.init.body, /qa@example.com/);
  assert.equal(response.code, 'SESION_INICIADA');
});

test('Auth transport conserva códigos controlados y fallos de red', async () => {
  const rejected = createAuthTransport('http://gateway.test', async () => Response.json({
    ok: false,
    error: { code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales incorrectas.', requestId: 'req-1' },
    data: null,
  }, { status: 401 }));

  await assert.rejects(
    rejected.request('/api/v1/auth/login'),
    (error) => error instanceof AuthApiError
      && error.code === 'CREDENCIALES_INVALIDAS'
      && error.requestId === 'req-1',
  );

  const offline = createAuthTransport('http://gateway.test', async () => { throw new Error('sin red'); });
  await assert.rejects(
    offline.request('/api/v1/auth/session'),
    (error) => error instanceof AuthApiError && error.code === 'AUTH_NO_DISPONIBLE',
  );
});
