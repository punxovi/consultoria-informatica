import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../src/lib/api/transporte.ts';
import {
  crearClientePaises,
  mensajeErrorPaises,
} from '../../src/lib/paises/cliente.ts';

const id = '15100000-0000-4000-8000-000000000001';
const country = {
  id_pais: id,
  nombre: 'Chile',
  codigo_iso: 'CL',
  codigo_area_telefonica: '+56',
  zona_horaria: 'America/Santiago',
  version: 3,
  created_at: '2026-10-27T12:00:00.000Z',
  updated_at: '2026-10-28T12:00:00.000Z',
  configuracion_pendiente: false,
};
const fields = {
  nombre: 'Perú',
  codigo_iso: 'PE',
  codigo_area_telefonica: '+51',
  zona_horaria: 'America/Lima',
};
const ok = (data, status = 200) => Response.json({ ok: true, code: 'OK', message: 'ok', data }, { status });

function clienteCon(respuestas) {
  const llamadas = [];
  const cliente = crearClientePaises('http://gateway.test/', async () => 'token-admin', async (url, init) => {
    llamadas.push({ url, init });
    const respuesta = respuestas.shift();
    if (respuesta instanceof Response) return respuesta;
    return respuesta;
  });
  return { cliente, llamadas };
}

test('Países: listado y consulta viajan al Gateway con Bearer y validan el contrato', async () => {
  const { cliente, llamadas } = clienteCon([
    ok({ countries: [country] }),
    ok({ country }),
  ]);

  assert.deepEqual(await cliente.listar(), [country]);
  assert.deepEqual(await cliente.obtener(id), country);
  assert.equal(llamadas[0].url, 'http://gateway.test/api/v1/countries');
  assert.equal(llamadas[1].url, `http://gateway.test/api/v1/countries/${id}`);
  assert.equal(new Headers(llamadas[0].init.headers).get('authorization'), 'Bearer token-admin');

  const invalido = clienteCon([ok({ countries: [{ ...country, configuracion_pendiente: 'no' }] })]);
  await assert.rejects(invalido.cliente.listar(), (error) => error instanceof ApiError && error.code === 'RESPUESTA_INVALIDA');
});

test('Países: alta y edición conservan los nombres, tipos y versión del contrato', async () => {
  const actualizado = { ...country, nombre: 'Chile actualizado', version: 4 };
  const { cliente, llamadas } = clienteCon([
    ok({ country }, 201),
    ok({ country: actualizado }),
  ]);

  assert.deepEqual(await cliente.crear(fields), country);
  assert.deepEqual(await cliente.actualizar(id, 3, { nombre: actualizado.nombre }), actualizado);
  assert.equal(llamadas[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(llamadas[0].init.body)), fields);
  assert.equal(llamadas[1].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(llamadas[1].init.body)), {
    version_esperada: 3,
    cambios: { nombre: actualizado.nombre },
  });

  await assert.rejects(cliente.actualizar(id, 0, { nombre: 'No importa' }), /versión esperada/i);
  await assert.rejects(cliente.actualizar(id, 3, {}), /al menos un cambio/i);
});

test('Países: no acepta que el Gateway devuelva otra entidad y conserva errores por campo', async () => {
  const otro = { ...country, id_pais: '15100000-0000-4000-8000-000000000099' };
  const { cliente } = clienteCon([ok({ country: otro })]);
  await assert.rejects(cliente.obtener(id), (error) => error instanceof ApiError && error.code === 'RESPUESTA_INVALIDA');

  const error = new ApiError('DATOS_INVALIDOS', 'Revisa los datos.', 400, 'qa', {
    zona_horaria: ['Usa una zona IANA válida.'],
  });
  assert.deepEqual(error.fields, { zona_horaria: ['Usa una zona IANA válida.'] });
});

test('mensajeErrorPaises entrega mensajes utilizables para sesión, autorización y concurrencia', () => {
  const mensaje = (status, code = 'ERROR_API') => mensajeErrorPaises(new ApiError(code, 'detalle interno', status), 'guardar el país');
  assert.match(mensaje(401), /sesión expiró/i);
  assert.match(mensaje(403), /Administrador/i);
  assert.match(mensaje(409), /otra sesión/i);
  assert.match(mensaje(503), /conexión/i);
  assert.match(mensaje(404), /no existe/i);
  assert.match(mensaje(404, 'RUTA_NO_ENCONTRADA'), /todavía no está disponible/i);
  assert.match(mensaje(503, 'MIGRACION_PAISES_PENDIENTE'), /migración pendiente/i);
  assert.match(mensaje(503, 'CONFIGURACION_SUPABASE'), /configurada.*Supabase/i);
});
