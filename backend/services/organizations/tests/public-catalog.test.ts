import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createOrganizationsServer } from '../src/server.ts';
import type { PublicCatalogApplication } from '../src/application/public-catalog-service.ts';

let server: Server;
let baseUrl = '';
const publicCatalog: PublicCatalogApplication = {
  async list() { return [{ id_producto: '11111111-1111-4111-8111-111111111111', nombre: 'Taller', descripcion: 'Descripción pública', unidad_medida: 'hora', tipo_item: 'servicio', caracteristicas: { modalidad: 'online' } }]; },
  async image(id) { return { bytes: Buffer.from(`png-${id}`), mimeType: 'image/png' }; },
  async createQuote() { return { id_solicitud: '22222222-2222-4222-8222-222222222222', estado: 'solicitada' }; },
};

before(async () => {
  server = createOrganizationsServer(undefined, undefined, undefined, undefined, publicCatalog);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

describe('superficie pública de cotización', () => {
  test('permite catálogo y creación de solicitud sin sesión', async () => {
    const catalog = await fetch(`${baseUrl}/v1/public/catalog`);
    assert.equal(catalog.status, 200);
    assert.deepEqual((await catalog.json()).data.items[0], { id_producto: '11111111-1111-4111-8111-111111111111', nombre: 'Taller', descripcion: 'Descripción pública', unidad_medida: 'hora', tipo_item: 'servicio', caracteristicas: { modalidad: 'online' } });
    const quote = await fetch(`${baseUrl}/v1/public/quote-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre:'Visitante',apellido:'QA',nombre_solicitante: 'Visitante QA', correo: 'visitante@example.com', telefono:'+56 912345678', items: [{ id_producto: '11111111-1111-4111-8111-111111111111', cantidad: 1 }] }) });
    assert.equal(quote.status, 201);
    assert.equal((await quote.json()).data.quote.estado, 'solicitada');
  });

  test('entrega la imagen de un producto publicado sin sesión', async () => {
    const response = await fetch(`${baseUrl}/v1/public/catalog/images/33333333-3333-4333-8333-333333333333`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await response.text(), 'png-33333333-3333-4333-8333-333333333333');
  });

  test('no convierte una ruta interna en una operación pública', async () => {
    const response = await fetch(`${baseUrl}/v1/organizations`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'SESION_REQUERIDA');
  });
});
