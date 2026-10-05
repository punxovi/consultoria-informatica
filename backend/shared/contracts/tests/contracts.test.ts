import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { failure, health, success } from '../src/index.ts';

describe('contrato HTTP compartido', () => {
  test('mantiene respuestas exitosas y fallidas distinguibles', () => {
    assert.deepEqual(success('CREADO', 'Creado.', { id: '1' }), {
      ok: true,
      code: 'CREADO',
      message: 'Creado.',
      data: { id: '1' },
    });
    assert.deepEqual(failure('INVALIDO', 'Dato inválido.', 'req-1'), {
      ok: false,
      error: { code: 'INVALIDO', message: 'Dato inválido.', requestId: 'req-1' },
      data: null,
    });
  });

  test('publica salud con versión y fecha válidas', () => {
    const response = health('servicio-prueba');
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal(response.data.service, 'servicio-prueba');
    assert.equal(response.data.version, 'v1');
    assert.doesNotThrow(() => new Date(response.data.timestamp).toISOString());
  });
});
