import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/api/transporte.ts';
import { crearClienteCoordinadores, mensajeErrorCoordinadores } from '../../src/lib/coordinadores/cliente.ts';

const id = '14700000-0000-4000-8000-0000000000a1';
const chile = '14700000-0000-4000-8000-000000000001';
const cuenta = { id_usuario: id, nombre: 'Ana Soto', correo: 'ana@fge.org', id_pais: chile, activo: true, version: 3 };

function clienteCon(respuestas) {
  const llamadas = [];
  const cliente = crearClienteCoordinadores('http://api.test/', async () => 'token-admin', async (url, init) => {
    llamadas.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined, auth: init?.headers?.authorization });
    const r = respuestas.shift();
    return Response.json(r.body, { status: r.status ?? 200 });
  });
  return { cliente, llamadas };
}
const ok = (data) => ({ body: { ok: true, code: 'OK', message: 'OK', data } });

test('listar: GET /api/v1/coordinators autenticado y valida cada cuenta', async () => {
  const { cliente, llamadas } = clienteCon([ok({ coordinators: [cuenta] })]);
  assert.deepEqual(await cliente.listar(), [cuenta]);
  assert.deepEqual(llamadas[0], { url: 'http://api.test/api/v1/coordinators', method: 'GET', body: undefined, auth: 'Bearer token-admin' });

  const invalido = clienteCon([ok({ coordinators: [{ ...cuenta, activo: 'si' }] })]);
  await assert.rejects(invalido.cliente.listar(), (e) => e instanceof ApiError && e.code === 'RESPUESTA_INVALIDA');
  const sinLista = clienteCon([ok({})]);
  await assert.rejects(sinLista.cliente.listar(), (e) => e.code === 'RESPUESTA_INVALIDA');
});

test('crear y actualizar: envían el cuerpo del contrato con la versión esperada', async () => {
  const { cliente, llamadas } = clienteCon([ok({ coordinator: cuenta }), ok({ coordinator: { ...cuenta, version: 4 } })]);
  await cliente.crear({ nombre: 'Ana Soto', correo: 'ana@fge.org', id_pais: chile });
  assert.deepEqual(llamadas[0], { url: 'http://api.test/api/v1/coordinators', method: 'POST', body: { nombre: 'Ana Soto', correo: 'ana@fge.org', id_pais: chile }, auth: 'Bearer token-admin' });
  await cliente.actualizar(id, 3, { id_pais: chile });
  assert.equal(llamadas[1].method, 'PATCH');
  assert.equal(llamadas[1].url, `http://api.test/api/v1/coordinators/${id}`);
  assert.deepEqual(llamadas[1].body, { version_esperada: 3, cambios: { id_pais: chile } });
});

test('cambiarEstado: usa deactivate/activate y exige que la respuesta refleje el estado pedido', async () => {
  const { cliente, llamadas } = clienteCon([ok({ coordinator: { ...cuenta, activo: false, version: 4 } }), ok({ coordinator: { ...cuenta, version: 5 } })]);
  assert.equal((await cliente.cambiarEstado(id, 3, false)).activo, false);
  assert.equal(llamadas[0].url, `http://api.test/api/v1/coordinators/${id}/deactivate`);
  assert.deepEqual(llamadas[0].body, { version_esperada: 3 });
  assert.equal((await cliente.cambiarEstado(id, 4, true)).activo, true);
  assert.equal(llamadas[1].url, `http://api.test/api/v1/coordinators/${id}/activate`);

  const incoherente = clienteCon([ok({ coordinator: { ...cuenta, activo: true } })]);
  await assert.rejects(incoherente.cliente.cambiarEstado(id, 3, false), (e) => e.code === 'RESPUESTA_INVALIDA');
});

test('obtener y actualizar rechazan una cuenta distinta a la solicitada', async () => {
  const otra = { ...cuenta, id_usuario: '14700000-0000-4000-8000-0000000000ff' };
  const { cliente } = clienteCon([ok({ coordinator: otra }), ok({ coordinator: otra })]);
  await assert.rejects(cliente.obtener(id), (e) => e.code === 'RESPUESTA_INVALIDA');
  await assert.rejects(cliente.actualizar(id, 1, { nombre: 'X' }), (e) => e.code === 'RESPUESTA_INVALIDA');
});

test('preserva el indicador de país pendiente devuelto por Backend', async () => {
  const pendiente = { ...cuenta, cambio_pais_pendiente: true };
  const { cliente } = clienteCon([ok({ coordinator: pendiente })]);
  assert.equal((await cliente.obtener(id)).cambio_pais_pendiente, true);
});

test('conserva los errores por campo del Backend', async () => {
  const fields = { correo: ['Ya existe una cuenta con ese correo.'] };
  const { cliente } = clienteCon([{ status: 409, body: { ok: false, error: { code: 'CORREO_DUPLICADO', message: 'Correo en uso.', fields }, data: null } }]);
  await assert.rejects(cliente.crear({ nombre: 'Ana', correo: 'ana@fge.org', id_pais: chile }), (e) => e instanceof ApiError && e.status === 409 && e.fields.correo[0] === fields.correo[0]);
});

test('mensajeErrorCoordinadores: mensajes comprensibles por tipo de error', () => {
  const msg = (code, status) => mensajeErrorCoordinadores(new ApiError(code, 'x', status), 'cargar las cuentas');
  assert.match(msg('RUTA_NO_ENCONTRADA', 404), /todavía no está disponible/);
  assert.match(msg('CONFIGURACION_CUENTAS', 503), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(msg('MIGRACION_COORDINADORES_PENDIENTE', 503), /migración de cuentas/);
  assert.match(msg('SESION', 401), /sesión expiró/);
  assert.match(msg('PROHIBIDO', 403), /Solo el Administrador/);
  assert.match(msg('NO_EXISTE', 404), /no existe/);
  assert.match(msg('CONFLICTO', 409), /Recarga/);
  assert.match(msg('SERVICIO_NO_DISPONIBLE', 0), /No fue posible cargar las cuentas.*conexión/);
  assert.match(mensajeErrorCoordinadores(new Error('x'), 'crear la cuenta'), /No fue posible crear la cuenta/);
});
