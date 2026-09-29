import assert from 'node:assert/strict';
import { it } from 'node:test';
import { stringify } from 'devalue';
import { solicitarPlan } from '../../src/lib/planes/transporte.ts';

it('envía la sesión y decodifica una respuesta exitosa de Planes', async () => {
  const resultado = await solicitarPlan('/_actions/listarPlanes', {}, 'token-prueba', async (ruta, opciones) => {
    assert.equal(ruta, '/_actions/listarPlanes');
    assert.equal(opciones.headers.Authorization, 'Bearer token-prueba');
    assert.equal(opciones.body, '{}');
    return new Response(stringify({ ok: true, codigo: 'PLANES_LISTADOS', mensaje: 'OK', datos: [{ nombre: 'Plan real' }] }));
  });
  assert.deepEqual(resultado, [{ nombre: 'Plan real' }]);
});

it('conserva los errores de dominio y validación del plan', async () => {
  await assert.rejects(
    solicitarPlan('/', {}, 'token', async () => new Response(stringify({ ok: false, codigo: 'SIN_PERMISO', mensaje: 'Sin permiso', datos: null }))),
    error => error.codigo === 'SIN_PERMISO' && error.message === 'Sin permiso',
  );

  await assert.rejects(
    solicitarPlan('/', {}, 'token', async () => Response.json({ issues: [
      { path: ['fecha_termino'], message: 'La fecha final es inválida.' },
    ] }, { status: 400 })),
    error => error.codigo === 'VALIDACION' && error.campos[0].campo === 'fecha_termino',
  );
});

it('distingue fallos de conexión, sesión HTTP y respuestas inválidas', async () => {
  for (const [enviar, codigo] of [
    [async () => { throw new TypeError('fetch failed'); }, 'CONEXION'],
    [async () => new Response('', { status: 401 }), 'SESION'],
    [async () => new Response('null'), 'RESPUESTA_INVALIDA'],
  ]) {
    await assert.rejects(solicitarPlan('/', {}, 'token', enviar), error => error.codigo === codigo);
  }
});
