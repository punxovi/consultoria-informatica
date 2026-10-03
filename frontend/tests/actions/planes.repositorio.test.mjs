import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actualizarPlan,
  crearPlan,
  ErrorOperacionPlan,
  listarPlanes,
  obtenerPlanPorId,
} from '../../src/lib/server/planes.ts';

const plan = {
  id_plan: '30000000-0000-4000-8000-000000000001',
  id_organizacion: '10000000-0000-4000-8000-000000000001',
  id_programa: '20000000-0000-4000-8000-000000000001',
  nombre: 'Plan anual',
  situacion_necesidad: 'Necesidad',
  objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos',
  resultado_esperado: 'Resultado',
  responsable_nombre: 'Ana Pérez',
  periodo_anual: 2026,
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-12-15',
  version: 1,
};

function clienteFalso(respuesta) {
  const llamadas = [];
  const consulta = {
    select(campos) { llamadas.push(['select', campos]); return this; },
    eq(campo, valor) { llamadas.push(['eq', campo, valor]); return this; },
    is(campo, valor) { llamadas.push(['is', campo, valor]); return this; },
    order(campo, opciones) { llamadas.push(['order', campo, opciones]); return this; },
    insert(datos) { llamadas.push(['insert', datos]); return this; },
    update(datos) { llamadas.push(['update', datos]); return this; },
    single() { return Promise.resolve(respuesta); },
    maybeSingle() { return Promise.resolve(respuesta); },
    then(resolver, rechazar) { return Promise.resolve(respuesta).then(resolver, rechazar); },
  };
  return { llamadas, from(tabla) { llamadas.push(['from', tabla]); return consulta; } };
}

describe('repositorio Supabase de Planes', () => {
  it('lista planes con Organización, Programa y filtros', async () => {
    const cliente = clienteFalso({ data: [plan], error: null });
    const resultado = await listarPlanes(cliente, {
      idOrganizacion: plan.id_organizacion,
      idPrograma: plan.id_programa,
    });
    assert.deepEqual(resultado, [plan]);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_organizacion', plan.id_organizacion],
      ['eq', 'id_programa', plan.id_programa],
    ]);
    const seleccion = cliente.llamadas.find(([tipo]) => tipo === 'select')[1];
    assert.match(seleccion, /organizacion:organizaciones/);
    assert.match(seleccion, /programa:programas/);
  });

  it('consulta detalle y reporta un plan inexistente', async () => {
    assert.deepEqual(await obtenerPlanPorId(clienteFalso({ data: plan, error: null }), plan.id_plan), plan);
    await assert.rejects(
      obtenerPlanPorId(clienteFalso({ data: null, error: null }), plan.id_plan),
      (error) => error instanceof ErrorOperacionPlan && error.codigo === 'NO_ENCONTRADO',
    );
  });

  it('crea el plan completo', async () => {
    const cliente = clienteFalso({ data: plan, error: null });
    const { id_plan: _id, version: _version, ...entrada } = plan;
    assert.deepEqual(await crearPlan(cliente, entrada), plan);
    assert.deepEqual(cliente.llamadas[1], ['insert', entrada]);
  });

  it('actualiza solo el registro activo con control de versión', async () => {
    const cliente = clienteFalso({ data: { ...plan, version: 2 }, error: null });
    const resultado = await actualizarPlan(cliente, plan.id_plan, { nombre: 'Actualizado' }, 1);
    assert.equal(resultado.version, 2);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_plan', plan.id_plan],
      ['eq', 'version', 1],
    ]);
    assert.ok(cliente.llamadas.some(([tipo, campo, valor]) => tipo === 'is' && campo === 'archived_at' && valor === null));
  });

  it('distingue concurrencia, relaciones inválidas y permisos', async () => {
    await assert.rejects(
      actualizarPlan(clienteFalso({ data: null, error: null }), plan.id_plan, { nombre: 'Otro' }, 1),
      (error) => error.codigo === 'CONFLICTO_CONCURRENCIA',
    );
    await assert.rejects(
      crearPlan(clienteFalso({ data: null, error: { code: '23503', message: 'planes_id_organizacion_fkey', details: 'id_organizacion' } }), plan),
      (error) => error.codigo === 'ORGANIZACION_NO_EXISTE',
    );
    await assert.rejects(
      crearPlan(clienteFalso({ data: null, error: { code: '42501', message: 'denied' } }), plan),
      (error) => error.codigo === 'SIN_PERMISO',
    );
  });
});
