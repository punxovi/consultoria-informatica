import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { OrganizationsApplication } from '../src/application/organizations-service.ts';
import { createOrganizationsServer } from '../src/server.ts';

const id = '22222222-2222-4222-8222-222222222222';
const countryId = '11111111-1111-4111-8111-111111111111';
const organization = { id_organizacion: id, nombre: 'Organización QA' };
let server: Server;
let baseUrl: string;

const application: OrganizationsApplication = {
  async list() { return [organization] as never; },
  async getById() { return organization as never; },
  async create() { return organization as never; },
  async update() { return organization as never; },
  async listCountries() { return [{ id_pais: countryId, codigo_iso: 'CL', nombre: 'Chile' }]; },
};

before(async () => {
  server = createOrganizationsServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
const validFields = {
  id_pais: countryId,
  nombre: 'Organización QA',
  nombre_representante: 'Representante',
  telefono: '9 12345678',
  correo: 'qa@example.com',
  region_departamento: 'Metropolitana',
  comuna_municipio_ciudad: 'Santiago',
  direccion: 'Calle 123',
  publico_objetivo: 'Comunidad',
  descripcion_breve: 'Descripción',
  tipo_organizacion: 'centro_comunitario',
  tipo_organizacion_otro: null,
  numero_beneficiarios: 10,
};

describe('servicio HTTP de Organizaciones', () => {
  test('publica salud y capacidades', async () => {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    const response = await fetch(`${baseUrl}/v1/organizations/capabilities`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.migrated, true);
  });

  test('protege todas las operaciones de datos', async () => {
    const response = await fetch(`${baseUrl}/v1/organizations`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'SESION_REQUERIDA');
  });

  test('lista, consulta y entrega países', async () => {
    for (const path of ['/v1/organizations', `/v1/organizations/${id}`, '/v1/organizations/countries']) {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ok, true);
    }
  });

  test('crea y actualiza con respuestas estables', async () => {
    const created = await fetch(`${baseUrl}/v1/organizations`, {
      method: 'POST', headers, body: JSON.stringify(validFields),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).code, 'ORGANIZACION_CREADA');

    const updated = await fetch(`${baseUrl}/v1/organizations/${id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ version_esperada: 1, cambios: { nombre: 'Editada' } }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).code, 'ORGANIZACION_ACTUALIZADA');
  });

  test('rechaza identificadores y cuerpos inválidos antes de procesarlos', async () => {
    const invalidId = await fetch(`${baseUrl}/v1/organizations/no-es-uuid`, { headers });
    assert.equal(invalidId.status, 400);
    const invalidBody = await fetch(`${baseUrl}/v1/organizations`, {
      method: 'POST', headers, body: JSON.stringify({ nombre: 'Incompleta' }),
    });
    assert.equal(invalidBody.status, 400);
  });
});
