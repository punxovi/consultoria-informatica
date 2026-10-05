import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { createAuthApplication } from '../src/application/auth-service.ts';
import type { AuthRepository } from '../src/domain/auth.ts';

function failingRepository(error: ServiceError): AuthRepository {
  const fail = async (): Promise<never> => { throw error; };
  return {
    login: fail,
    requestPasswordRecovery: fail,
    changePassword: fail,
    getUser: fail,
    refreshSession: fail,
    logout: fail,
  };
}

describe('aplicación Auth', () => {
  test('no expone el error interno al rechazar credenciales', async () => {
    const application = createAuthApplication(
      failingRepository(new ServiceError('SUPABASE_AUTH_ERROR', 'Invalid login credentials', 400)),
      'http://127.0.0.1:4321/cambiar-contrasena',
    );

    await assert.rejects(
      application.login({ correo: 'qa@example.com', password: 'incorrecta' }),
      (error) => error instanceof ServiceError
        && error.code === 'CREDENCIALES_INVALIDAS'
        && !error.message.includes('Invalid login'),
    );
  });

  test('normaliza una sesión expirada y tolera logout ya invalidado', async () => {
    const application = createAuthApplication(
      failingRepository(new ServiceError('SUPABASE_AUTH_ERROR', 'expired', 401)),
      'http://127.0.0.1:4321/cambiar-contrasena',
    );

    await assert.rejects(
      application.getSession('expirado'),
      (error) => error instanceof ServiceError && error.code === 'SESION_INVALIDA',
    );
    await assert.doesNotReject(application.logout('expirado'));
  });
});
