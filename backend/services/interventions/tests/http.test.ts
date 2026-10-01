import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { InterventionsApplication } from '../src/application/interventions-service.ts';
import { createInterventionsServer } from '../src/server.ts';

const planId = '33333333-3333-4333-8333-333333333333';
const actionId = '44444444-4444-4444-8444-444444444444';
const orgId = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';
const plan = { id_plan: planId, nombre: 'Plan QA' };
const action = { id_accion: actionId, id_plan: planId, nombre: 'Acción QA' };
const application: InterventionsApplication = {
  plans: {
    async list() { return [plan] as never; }, async getById() { return plan as never; },
    async create() { return plan as never; }, async update() { return plan as never; },
  },
  actions: {
    async list() { return [action] as never; }, async getById() { return action as never; },
    async create() { return action as never; }, async update() { return action as never; },
  },
};
let server: Server;
let baseUrl: string;
const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };

before(async () => {
  server = createInterventionsServer(application);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

const validPlan = {
  id_organizacion: orgId, id_programa: programId, nombre: 'Plan QA', situacion_necesidad: 'Necesidad',
  objetivo_general: 'Objetivo', objetivos_especificos: 'Objetivos', resultado_esperado: 'Resultado',
  responsable_nombre: 'Responsable', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31',
};
const validAction = {
  id_plan: planId, nombre: 'Acción QA', responsable_nombre: 'Responsable',
  fecha_inicio: '2026-02-01', fecha_termino: '2026-03-01',
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
    assert.equal((await fetch(`${baseUrl}/v1/plans`, { method: 'POST', headers, body: JSON.stringify(validPlan) })).status, 201);
    assert.equal((await fetch(`${baseUrl}/v1/plans/${planId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ version_esperada: 1, cambios: { nombre: 'Plan editado' } }),
    })).status, 200);
  });
  test('expone CRUD disponible de Acciones', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/actions?id_plan=${planId}`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/actions/${actionId}`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/v1/actions`, { method: 'POST', headers, body: JSON.stringify(validAction) })).status, 201);
    assert.equal((await fetch(`${baseUrl}/v1/actions/${actionId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ cambios: { estado: 'cumplida' } }),
    })).status, 200);
  });
  test('rechaza entradas inválidas antes de persistir', async () => {
    assert.equal((await fetch(`${baseUrl}/v1/plans/invalido`, { headers })).status, 400);
    assert.equal((await fetch(`${baseUrl}/v1/actions`, {
      method: 'POST', headers, body: JSON.stringify({ ...validAction, estado: 'cancelada' }),
    })).status, 400);
  });
});
