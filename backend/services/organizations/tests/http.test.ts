import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { OrganizationsApplication } from '../src/application/organizations-service.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { ServiceError } from '../../../shared/errors/src/index.ts';

const id = '22222222-2222-4222-8222-222222222222';
const countryId = '11111111-1111-4111-8111-111111111111';
const organization = { id_organizacion: id, nombre: 'Organización QA' };
const legalRecord = {
  id_informacion_legal: '33333333-3333-4333-8333-333333333333',
  id_organizacion: id,
  estado_personalidad_juridica: 'si',
  tipo_personalidad_juridica: 'Fundación',
  numero_registro: 'REG-1',
  fecha_constitucion: '2020-01-01',
  vigencia_directiva: 'Vigente',
  version: 1,
  updated_at: '2026-10-07T00:00:00Z',
  documentos: [
    { tipo: 'identidad_representante', estado: 'cargado', nombre_archivo: 'identidad.pdf' },
    { tipo: 'identificacion_legal', estado: 'no_aplica', nombre_archivo: null },
    { tipo: 'estatutos', estado: 'pendiente', nombre_archivo: null },
  ],
};
let server: Server;
let baseUrl: string;
let legalCreateCalls = 0;
let legalUpdateCalls = 0;
let legalFailure: ServiceError | null = null;

const application: OrganizationsApplication = {
  async list() { return [organization] as never; },
  async getById() { return organization as never; },
  async create() { return organization as never; },
  async update() { return organization as never; },
  async listCountries() { return [{ id_pais: countryId, codigo_iso: 'CL', nombre: 'Chile' }]; },
  async getLegalRecord() { return legalRecord as never; },
  async createLegalRecord() {
    legalCreateCalls += 1;
    if (legalFailure) throw legalFailure;
    return legalRecord as never;
  },
  async updateLegalRecord() {
    legalUpdateCalls += 1;
    if (legalFailure) throw legalFailure;
    return { ...legalRecord, version: 2 } as never;
  },
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

const validLegalData = {
  estado_personalidad_juridica: 'si', tipo_personalidad_juridica: 'Fundación',
  numero_registro: 'REG-1', fecha_constitucion: '2020-01-01', vigencia_directiva: 'Vigente',
  documentos: [
    { tipo: 'identidad_representante', estado: 'pendiente' },
    { tipo: 'identificacion_legal', estado: 'no_aplica' },
    { tipo: 'estatutos', estado: 'pendiente' },
  ],
};

function legalForm(data: unknown): FormData {
  const form = new FormData();
  form.set('datos', JSON.stringify(data));
  return form;
}

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

  test('consulta, crea y actualiza el expediente legal mediante multipart', async () => {
    const obtained = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, { headers });
    assert.equal(obtained.status, 200);
    assert.equal((await obtained.json()).data.expediente.id_informacion_legal, legalRecord.id_informacion_legal);

    const data = {
      ...validLegalData,
      documentos: validLegalData.documentos.map((document) => document.tipo === 'identidad_representante'
        ? { ...document, estado: 'cargado' }
        : document),
    };
    const createForm = legalForm(data);
    createForm.set('identidad_representante', new File(['%PDF-1.4\nQA'], 'identidad.pdf', { type: 'application/pdf' }));
    const created = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
      method: 'POST', headers: { authorization: 'Bearer token' }, body: createForm,
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).code, 'EXPEDIENTE_LEGAL_CREADO');

    const updateForm = legalForm({ ...data, version_esperada: 1 });
    const updated = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
      method: 'PATCH', headers: { authorization: 'Bearer token' }, body: updateForm,
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.expediente.version, 2);
  });

  test('rechaza PDF que solo imita la extensión', async () => {
    const form = new FormData();
    form.set('datos', JSON.stringify({
      estado_personalidad_juridica: 'no', tipo_personalidad_juridica: '', numero_registro: '',
      fecha_constitucion: '', vigencia_directiva: '',
      documentos: [
        { tipo: 'identidad_representante', estado: 'cargado' },
        { tipo: 'identificacion_legal', estado: 'pendiente' },
        { tipo: 'estatutos', estado: 'pendiente' },
      ],
    }));
    form.set('identidad_representante', new File(['archivo falso'], 'falso.pdf', { type: 'application/pdf' }));
    const response = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
      method: 'POST', headers: { authorization: 'Bearer token' }, body: form,
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'DATOS_INVALIDOS');
  });

  test('aplica Zod antes de procesar registros y actualizaciones inválidas', async () => {
    const createsBefore = legalCreateCalls;
    const updatesBefore = legalUpdateCalls;
    const invalidCases = [
      { ...validLegalData, estado_personalidad_juridica: undefined },
      { ...validLegalData, numero_registro: 123 },
      { ...validLegalData, fecha_constitucion: '2999-01-01' },
      { ...validLegalData, documentos: [validLegalData.documentos[0], validLegalData.documentos[0], validLegalData.documentos[2]] },
      { ...validLegalData, campo_desconocido: true },
    ];
    for (const data of invalidCases) {
      const response = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
        method: 'POST', headers: { authorization: 'Bearer token' }, body: legalForm(data),
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'DATOS_INVALIDOS');
      assert.equal(body.data, null);
    }
    const updateWithoutVersion = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
      method: 'PATCH', headers: { authorization: 'Bearer token' }, body: legalForm(validLegalData),
    });
    assert.equal(updateWithoutVersion.status, 400);
    assert.equal((await updateWithoutVersion.json()).error.code, 'DATOS_INVALIDOS');
    assert.equal(legalCreateCalls, createsBefore);
    assert.equal(legalUpdateCalls, updatesBefore);
  });

  test('devuelve errores estructurados de permisos y base de datos', async () => {
    try {
      legalFailure = new ServiceError('SIN_PERMISO', 'La sesión no tiene permiso para realizar esta operación.', 403);
      const denied = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
        method: 'POST', headers: { authorization: 'Bearer token' }, body: legalForm(validLegalData),
      });
      assert.equal(denied.status, 403);
      assert.deepEqual((await denied.json()).error.code, 'SIN_PERMISO');

      legalFailure = new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación.', 502);
      const database = await fetch(`${baseUrl}/v1/organizations/${id}/legal-record`, {
        method: 'POST', headers: { authorization: 'Bearer token' }, body: legalForm(validLegalData),
      });
      assert.equal(database.status, 502);
      const body = await database.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'ERROR_BASE_DATOS');
      assert.equal(body.data, null);
    } finally {
      legalFailure = null;
    }
  });
});
