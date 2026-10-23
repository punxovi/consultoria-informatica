import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiTransport } from '../../src/lib/api/transporte.ts';
import { crearClienteListadoOrganizaciones } from '../../src/lib/organizaciones/cliente.ts';

const organizacion = {
  id_organizacion: '22222222-2222-4222-8222-222222222222',
  id_pais: '11111111-1111-4111-8111-111111111111',
  nombre: 'Comedor de prueba',
};

test('el cliente de organizaciones envía los filtros con el contrato Backend y transmite autenticación', async () => {
  const llamadas = [];
  const cliente = crearClienteListadoOrganizaciones(
    createApiTransport('http://gateway.test', async (url, options) => {
      llamadas.push({ url, options });
      return Response.json({ ok: true, code: 'ORGANIZACIONES_LISTADAS', message: 'ok', data: {
        organizations: [organizacion, organizacion],
      } });
    }),
    async () => 'jwt-de-prueba',
  );

  const resultado = await cliente({
    q: '  comedor & apoyo  ',
    idPais: organizacion.id_pais,
    idPrograma: '33333333-3333-4333-8333-333333333333',
  });

  const solicitud = llamadas[0];
  const url = new URL(solicitud.url);
  assert.equal(url.pathname, '/api/v1/organizations');
  assert.equal(url.searchParams.get('search'), 'comedor & apoyo');
  assert.equal(url.searchParams.get('id_pais'), organizacion.id_pais);
  assert.equal(url.searchParams.get('id_programa'), '33333333-3333-4333-8333-333333333333');
  assert.equal(url.searchParams.has('q'), false);
  assert.equal(solicitud.options.headers.authorization, 'Bearer jwt-de-prueba');
  assert.equal(resultado.length, 1, 'el cliente evita organizaciones duplicadas');
});

test('el cliente omite filtros vacíos y rechaza una respuesta de listado inválida', async () => {
  let urlSolicitada;
  const cliente = crearClienteListadoOrganizaciones(
    createApiTransport('http://gateway.test', async (url) => {
      urlSolicitada = url;
      return Response.json({ ok: true, code: 'OK', message: 'ok', data: { organizations: null } });
    }),
    async () => 'jwt-de-prueba',
  );

  await assert.rejects(() => cliente({ q: ' ', idPais: '', idPrograma: '' }),
    (error) => error instanceof ApiError && error.code === 'RESPUESTA_INVALIDA');
  assert.equal(urlSolicitada, 'http://gateway.test/api/v1/organizations');
});
