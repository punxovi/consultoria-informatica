import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { createSupabaseAuthRepository } from '../src/infrastructure/supabase-auth.repository.ts';

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'usuario-1', email: 'qa@example.com' },
};

describe('repositorio Supabase Auth', () => {
  test('utiliza los endpoints y encabezados correspondientes', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes('/token')) return Response.json(session);
      if (url.endsWith('/user')) return Response.json(session.user);
      return Response.json({});
    };
    const repository = createSupabaseAuthRepository({
      supabaseUrl: 'https://proyecto.supabase.co/',
      anonKey: 'anon-key',
      fetchImpl,
    });

    await repository.login({ correo: 'qa@example.com', password: 'secreto' });
    await repository.requestPasswordRecovery(
      { correo: 'qa@example.com' },
      'http://127.0.0.1:4321/cambiar-contrasena',
    );
    await repository.changePassword('access-token', '12345678');
    await repository.getUser('access-token');
    await repository.refreshSession('refresh-token');
    await repository.logout('access-token');

    assert.equal(requests.length, 6);
    assert.match(requests[0].url, /\/auth\/v1\/token\?grant_type=password$/);
    assert.match(requests[1].url, /\/auth\/v1\/recover\?redirect_to=/);
    assert.equal(
      new URL(requests[1].url).searchParams.get('redirect_to'),
      'http://127.0.0.1:4321/cambiar-contrasena',
    );
    assert.match(requests[4].url, /grant_type=refresh_token$/);
    assert.match(requests[5].url, /\/logout\?scope=local$/);
    assert.equal(new Headers(requests[0].init?.headers).get('apikey'), 'anon-key');
    assert.equal(
      new Headers(requests[2].init?.headers).get('authorization'),
      'Bearer access-token',
    );
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { email: 'qa@example.com' });
  });

  test('convierte errores HTTP y de conexión en errores controlados', async () => {
    const rejected = createSupabaseAuthRepository({
      supabaseUrl: 'https://proyecto.supabase.co',
      anonKey: 'anon-key',
      fetchImpl: async () => Response.json({ error: 'invalid' }, { status: 400 }),
    });
    await assert.rejects(
      rejected.login({ correo: 'qa@example.com', password: 'incorrecta' }),
      (error) => error instanceof ServiceError && error.status === 400,
    );

    const unavailable = createSupabaseAuthRepository({
      supabaseUrl: 'https://proyecto.supabase.co',
      anonKey: 'anon-key',
      fetchImpl: async () => { throw new Error('sin red'); },
    });
    await assert.rejects(
      unavailable.getUser('token'),
      (error) => error instanceof ServiceError && error.code === 'SUPABASE_AUTH_NO_DISPONIBLE',
    );
  });
});
