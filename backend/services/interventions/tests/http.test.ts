
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { InterventionsApplication } from '../src/application/interventions-service.ts';
import { createInterventionsServer } from '../src/server.ts';

const planId = '33333333-3333-4333-8333-333333333333';
const actionId = '44444444-4444-4444-8444-444444444444';
const minuteId = '55555555-5555-4555-8555-555555555555';
const evidenceId = '66666666-6666-4666-8666-666666666666';
const attachmentId = '77777777-7777-4777-8777-777777777777';
const orgId = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';

const plan = { id_plan: planId, nombre: 'Plan QA' };
const action = { id_accion: actionId, id_plan: planId, nombre: 'Acción QA' };
const minute = {
  id_acta: minuteId,
  id_organizacion: orgId,
  id_plan: planId,
  objetivo: 'Reunión QA',
};

const evidence = {
  id_evidencia: evidenceId,
  id_accion: actionId,
  mime_type: 'application/pdf',
  tamano_bytes: 8,
  estado_carga: 'reservado',
  version: 1,
};

const attachment = {
  id_adjunto: attachmentId,
  id_acta: minuteId,
  bucket_id: 'fge-evidencias',
  ruta_objeto: `actas/${minuteId}/${attachmentId}`,
  nombre_original: 'documento.pdf',
  mime_type: 'application/pdf',
  tamano_bytes: 8,
  estado_carga: 'reservado',
  version: 1,
  created_at: '2026-10-30T12:00:00.000Z',
  updated_at: '2026-10-30T12:00:00.000Z',
  archived_at: null,
};

const application: InterventionsApplication = {
  plans: {
    async list() { return [plan] as never; },
    async getById() { return plan as never; },
    async create() { return plan as never; },
    async update() { return plan as never; },
    async archive() {},
  },

  actions: {
    async list() { return [action] as never; },
    async getById() { return action as never; },
    async create() { return action as never; },
    async update() { return action as never; },
    async archive() {},
  },

  meetingMinutes: {
    async catalog() {
      return {
        puede_gestionar: true,
        planes: [plan],
        acciones: [action],
        asistentes: ['Coordinador'],
      };
    },
    async list() { return [minute] as never; },
    async getById() { return minute as never; },
    async create() { return minute as never; },
    async update() { return minute as never; },
  },

  evidences: {
    async list() { return [evidence] as never; },
    async getById() { return evidence as never; },
    async create() { return evidence as never; },
    async update() { return evidence as never; },
    async upload() {
      return { ...evidence, estado_carga: 'disponible' } as never;
    },
    async download() {
      return {
        bytes: Buffer.from('%PDF-123'),
        mimeType: 'application/pdf',
        fileName: 'acta.pdf',
      };
    },
  },

  meetingMinuteAttachments: {
    async list() { return [attachment] as never; },
    async getById() { return attachment as never; },
    async create() { return attachment as never; },
    async upload() {
      return { ...attachment, estado_carga: 'disponible', version: 2 } as never;
    },
    async download() {
      return {
        bytes: Buffer.from('%PDF-123'),
        mimeType: 'application/pdf',
        fileName: 'documento.pdf',
      };
    },
  },
};

let server: Server;
let baseUrl: string;

const headers = {
  authorization: 'Bearer token',
  'content-type': 'application/json',
};

before(async () => {
  server = createInterventionsServer(application);

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('No se inició el servidor.');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () =>
  new Promise<void>((resolve) => server.close(() => resolve())),
);

const validPlan = {
  id_organizacion: orgId,
  id_programa: programId,
  nombre: 'Plan QA',
  situacion_necesidad: 'Necesidad',
  objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos',
  resultado_esperado: 'Resultado',
  responsable_nombre: 'Responsable',
  periodo_anual: 2026,
  fecha_inicio: '2026-01-01',
  fecha_termino: '2026-12-31',
};

const validAction = {
  id_plan: planId,
  nombre: 'Acción QA',
  responsable_nombre: 'Responsable',
  fecha_inicio: '2026-02-01',
  fecha_termino: '2026-03-01',
};

const validMinute = {
  id_organizacion: orgId,
  id_plan: planId,
  id_accion: actionId,
  objetivo: 'Revisar avances',
  fecha_reunion: '2026-10-08',
  asistentes: ['Coordinador'],
  asistentes_externos: '',
  observaciones: 'Acuerdos',
};

describe('servicio HTTP de Intervenciones', () => {
  test('publica salud, capacidades y exige sesión', async () => {
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/plans/capabilities`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/actions`)).status, 401);
  });

  test('expone CRUD disponible de Planes', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/plans`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/plans/${planId}`, { headers })).status, 200);

    assert.equal((await fetch(`${baseUrl}/v1/plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validPlan),
    })).status, 201);

    assert.equal((await fetch(`${baseUrl}/v1/plans/${planId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        version_esperada: 1,
        cambios: { nombre: 'Plan editado' },
      }),
    })).status, 200);

    assert.equal((await fetch(`${baseUrl}/v1/plans/${planId}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ version_esperada: 2 }),
    })).status, 200);
  });

  test('expone CRUD disponible de Acciones', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/actions?id_plan=${planId}`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/actions/${actionId}`, { headers })).status, 200);

    assert.equal((await fetch(`${baseUrl}/v1/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validAction),
    })).status, 201);

    assert.equal((await fetch(`${baseUrl}/v1/actions/${actionId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ cambios: { estado: 'cumplida' } }),
    })).status, 200);

    assert.equal((await fetch(`${baseUrl}/v1/actions/${actionId}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ version_esperada: 2 }),
    })).status, 200);
  });

  test('expone listado, detalle, creación y actualización de Actas', async () => {
    const catalog = await fetch(
      `${baseUrl}/v1/meeting-minutes/catalog?id_organizacion=${orgId}`,
      { headers },
    );

    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).data.catalog.planes[0].id_plan, planId);

    const listed = await fetch(
      `${baseUrl}/v1/meeting-minutes?id_organizacion=${orgId}`,
      { headers },
    );

    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).code, 'ACTAS_LISTADAS');

    assert.equal(
      (await fetch(`${baseUrl}/v1/meeting-minutes/${minuteId}`, { headers })).status,
      200,
    );

    assert.equal((await fetch(`${baseUrl}/v1/meeting-minutes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validMinute),
    })).status, 201);

    const updated = await fetch(`${baseUrl}/v1/meeting-minutes/${minuteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        version_esperada: 1,
        cambios: { objetivo: 'Objetivo actualizado' },
      }),
    });

    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).code, 'ACTA_ACTUALIZADA');
  });

  test('rechaza entradas inválidas antes de persistir', async () => {
    assert.equal(
      (await fetch(`${baseUrl}/v1/plans/invalido`, { headers })).status,
      400,
    );

    assert.equal((await fetch(`${baseUrl}/v1/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...validAction, estado: 'cancelada' }),
    })).status, 400);

    const invalidMinute = await fetch(`${baseUrl}/v1/meeting-minutes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...validMinute, asistentes: [] }),
    });

    assert.equal(invalidMinute.status, 400);
    assert.equal((await invalidMinute.json()).error.code, 'DATOS_INVALIDOS');
  });

  test('registra, consulta, actualiza y carga evidencias con el contrato HTTP', async () => {
    const input = {
      id_accion: actionId,
      origen: 'Terreno',
      descripcion: 'Acta digital',
      nombre_original: 'acta.pdf',
      mime_type: 'application/pdf',
      tamano_bytes: 8,
    };

    assert.equal(
      (await fetch(`${baseUrl}/v1/evidences?id_accion=${actionId}`, { headers })).status,
      200,
    );

    assert.equal(
      (await fetch(`${baseUrl}/v1/evidences/${evidenceId}`, { headers })).status,
      200,
    );

    const created = await fetch(`${baseUrl}/v1/evidences`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    assert.equal(created.status, 201);
    assert.equal((await created.json()).code, 'EVIDENCIA_CREADA');

    assert.equal((await fetch(`${baseUrl}/v1/evidences/${evidenceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        version_esperada: 1,
        cambios: { descripcion: 'Nuevo texto' },
      }),
    })).status, 200);

    const uploaded = await fetch(
      `${baseUrl}/v1/evidences/${evidenceId}/file?version_esperada=1`,
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/pdf',
        },
        body: '%PDF-123',
      },
    );

    assert.equal(uploaded.status, 200);

    const file = await fetch(
      `${baseUrl}/v1/evidences/${evidenceId}/file`,
      { headers },
    );

    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(await file.text(), '%PDF-123');
  });

  test('rechaza datos inválidos de evidencias antes de llamar al repositorio', async () => {
    for (const input of [
      {
        id_accion: actionId,
        origen: 'Terreno',
        descripcion: 'Archivo',
        nombre_original: 'x.exe',
        mime_type: 'application/x-msdownload',
        tamano_bytes: 8,
      },
      {
        id_accion: 'invalido',
        origen: 'Terreno',
        descripcion: 'Archivo',
        nombre_original: 'x.pdf',
        mime_type: 'application/pdf',
        tamano_bytes: 8,
      },
      {
        id_accion: actionId,
        origen: 'Terreno',
        descripcion: 'Archivo',
        nombre_original: 'x.pdf',
        mime_type: 'application/pdf',
        tamano_bytes: 8,
        consentimiento: { consentimiento_declarado: true },
      },
    ]) {
      const result = await fetch(`${baseUrl}/v1/evidences`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });

      assert.equal(result.status, 400);
      assert.equal((await result.json()).error.code, 'DATOS_INVALIDOS');
    }

    assert.equal(
      (await fetch(`${baseUrl}/v1/evidences`, { headers })).status,
      400,
    );

    assert.equal((await fetch(`${baseUrl}/v1/evidences/${evidenceId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        version_esperada: 1,
        cambios: { estado_publicacion: 'otra' },
      }),
    })).status, 400);

    assert.equal((await fetch(
      `${baseUrl}/v1/evidences/${evidenceId}/file?version_esperada=1`,
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'image/png',
        },
        body: '%PDF-123',
      },
    )).status, 400);
  });

  test('lista y registra adjuntos asociados a un acta', async () => {
    const listed = await fetch(
      `${baseUrl}/v1/meeting-minutes/${minuteId}/attachments`,
      { headers },
    );

    assert.equal(listed.status, 200);

    const created = await fetch(
      `${baseUrl}/v1/meeting-minutes/${minuteId}/attachments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id_acta: minuteId,
          nombre_original: 'documento.pdf',
          mime_type: 'application/pdf',
          tamano_bytes: 8,
        }),
      },
    );

    assert.equal(created.status, 201);
  });

  test('rechaza registrar un adjunto para un acta diferente a la ruta', async () => {
    const response = await fetch(
      `${baseUrl}/v1/meeting-minutes/${minuteId}/attachments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id_acta: planId,
          nombre_original: 'documento.pdf',
          mime_type: 'application/pdf',
          tamano_bytes: 8,
        }),
      },
    );

    assert.equal(response.status, 400);
  });

  test('carga y descarga el archivo de un adjunto de acta', async () => {
    const uploaded = await fetch(
      `${baseUrl}/v1/meeting-minute-attachments/${attachmentId}/file?version_esperada=1`,
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/pdf',
        },
        body: '%PDF-123',
      },
    );

    assert.equal(uploaded.status, 200);

    const file = await fetch(
      `${baseUrl}/v1/meeting-minute-attachments/${attachmentId}/file`,
      { headers },
    );

    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(await file.text(), '%PDF-123');
  });

  test('rechaza cargar un archivo de adjunto con contenido incompatible', async () => {
    const response = await fetch(
      `${baseUrl}/v1/meeting-minute-attachments/${attachmentId}/file?version_esperada=1`,
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'image/png',
        },
        body: '%PDF-123',
      },
    );

    assert.equal(response.status, 400);
  });
});
