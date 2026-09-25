import assert from 'node:assert/strict';
import { it } from 'node:test';
import { stringify } from 'devalue';
import { solicitarPrograma } from '../../src/lib/programas/transporte.ts';

it('envía el token de sesión y decodifica la respuesta de Astro', async () => {
  const resultado = await solicitarPrograma('/_actions/listarProgramas', {}, 'token-prueba', async (ruta, opciones) => {
    assert.equal(ruta, '/_actions/listarProgramas');
    assert.equal(opciones.headers.Authorization, 'Bearer token-prueba');
    assert.equal(opciones.body, '{}');
    return new Response(stringify({ ok: true, datos: [{ nombre: 'Programa real' }] }));
  });
  assert.deepEqual(resultado, [{ nombre: 'Programa real' }]);
});

it('distingue programa inexistente, permisos y concurrencia', async () => {
  for (const codigo of ['NO_ENCONTRADO', 'SIN_PERMISO', 'CONFLICTO_CONCURRENCIA']) {
    await assert.rejects(solicitarPrograma('/', {}, 'token', async () => new Response(stringify({ ok: false, codigo, mensaje: 'Mensaje backend', datos: null }))),
      error => error.codigo === codigo && error.message === 'Mensaje backend');
  }
});

it('conserva la posición y campo de validaciones Zod anidadas de edición', async () => {
  await assert.rejects(solicitarPrograma('/', {}, 'token', async () => Response.json({ issues: [
    { path: ['cambios', 'lineas_accion', 1, 'resultado_esperado'], message: 'Resultado obligatorio' },
  ] }, { status: 400 })), error => {
    assert.deepEqual(error.campos, [{ campo: 'lineas_accion.1.resultado_esperado', mensaje: 'Resultado obligatorio' }]);
    return error.codigo === 'VALIDACION';
  });
});

it('controla fallos de red, sesión, HTTP y respuestas malformadas', async () => {
  for (const [enviar, codigo] of [
    [async () => { throw new TypeError('fetch failed'); }, 'CONEXION'],
    [async () => new Response('', { status: 401 }), 'SESION'],
    [async () => new Response('<html>error</html>', { status: 502 }), 'HTTP'],
    [async () => new Response('null'), 'RESPUESTA_INVALIDA'],
  ]) await assert.rejects(solicitarPrograma('/', {}, 'token', enviar), error => error.codigo === codigo);
});
