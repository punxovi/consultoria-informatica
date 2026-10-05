import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { ProgramsApplication } from '../src/application/programs-service.ts';
import { createProgramsServer } from '../src/server.ts';

const id = '22222222-2222-4222-8222-222222222222';
const program = { id_programa: id, nombre: 'Programa QA', lineas_accion: [] };
let server: Server;
let baseUrl: string;

const application: ProgramsApplication = {
  async list() { return [program] as never; },
  async getById() { return program as never; },
  async create() { return program as never; },
  async update() { return program as never; },
  async archive() { return program as never; },
};

before(async () => {
  server = createProgramsServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
const validFields = {
  nombre: 'Programa QA', descripcion: 'Descripción', objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos',
  lineas_accion: [{ linea_accion: 'Línea', resultado_esperado: 'Resultado' }],
};

describe('servicio HTTP de Programas', () => {
  test('publica salud y capacidades', async () => {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    const response = await fetch(`${baseUrl}/v1/programs/capabilities`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.migrated, true);
  });

  test('protege las operaciones de datos', async () => {
    const response = await fetch(`${baseUrl}/v1/programs`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'SESION_REQUERIDA');
  });

  test('lista, consulta, crea, actualiza y archiva', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/programs`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/programs/${id}`, { headers })).status, 200);

    const created = await fetch(`${baseUrl}/v1/programs`, { method: 'POST', headers, body: JSON.stringify(validFields) });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).code, 'PROGRAMA_CREADO');

    const updated = await fetch(`${baseUrl}/v1/programs/${id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ version_esperada: 1, cambios: { nombre: 'Editado' } }),
    });
    assert.equal(updated.status, 200);

    const archived = await fetch(`${baseUrl}/v1/programs/${id}`, {
      method: 'DELETE', headers, body: JSON.stringify({ version_esperada: 1 }),
    });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json()).code, 'PROGRAMA_ARCHIVADO');
  });

  test('rechaza identificadores, cuerpos y líneas inválidas', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/programs/no-es-uuid`, { headers })).status, 400);
    const invalid = await fetch(`${baseUrl}/v1/programs`, {
      method: 'POST', headers, body: JSON.stringify({ ...validFields, lineas_accion: [] }),
    });
    assert.equal(invalid.status, 400);
  });
});
