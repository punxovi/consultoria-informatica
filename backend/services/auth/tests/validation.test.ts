import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import {
  parseLoginInput,
  parsePasswordChangeInput,
  parseRecoveryInput,
  parseRefreshInput,
} from '../src/domain/auth.ts';

function expectInvalid(callback: () => unknown): void {
  assert.throws(callback, (error) => error instanceof ServiceError && error.code === 'DATOS_INVALIDOS');
}

describe('validaciones del dominio Auth', () => {
  test('normaliza el correo y conserva la contraseña', () => {
    assert.deepEqual(parseLoginInput({ correo: ' USER@Example.COM ', password: ' Secreto ' }), {
      correo: 'user@example.com',
      password: ' Secreto ',
    });
    assert.deepEqual(parseRecoveryInput({ correo: 'USER@example.com' }), {
      correo: 'user@example.com',
    });
  });

  test('rechaza formatos, tipos y propiedades adicionales', () => {
    expectInvalid(() => parseLoginInput({ correo: 'incorrecto', password: 'x' }));
    expectInvalid(() => parseLoginInput({ correo: 'qa@example.com', password: 123 }));
    expectInvalid(() => parseLoginInput({ correo: 'qa@example.com', password: 'x', role: 'ADMIN' }));
  });

  test('exige contraseñas seguras y coincidentes', () => {
    assert.deepEqual(parsePasswordChangeInput({
      password: '12345678',
      confirmPassword: '12345678',
    }), {
      password: '12345678',
      confirmPassword: '12345678',
    });
    expectInvalid(() => parsePasswordChangeInput({ password: '123', confirmPassword: '123' }));
    expectInvalid(() => parsePasswordChangeInput({
      password: '12345678',
      confirmPassword: 'abcdefgh',
    }));
  });

  test('valida el token de renovación', () => {
    assert.deepEqual(parseRefreshInput({ refreshToken: 'refresh-token-valido' }), {
      refreshToken: 'refresh-token-valido',
    });
    expectInvalid(() => parseRefreshInput({ refreshToken: 'corto' }));
  });
});
