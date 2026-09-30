import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actualizarAccion,
  crearAccion,
  ErrorOperacionAccion,
  listarAcciones,
  obtenerAccionPorId,
} from '../../src/lib/server/acciones.ts';

const accion = {
  id_accion: '40000000-0000-4000-8000-000000000001',
  id_plan: '30000000-0000-4000-8000-000000000001',
  nombre: 'Taller',
  responsable_nombre: 'Ana',
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-04-01',
  estado: 'no_iniciada',
  observacion_motivo: null,
  resultado_esperado: 'Resultado',
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

describe('repositorio Supabase de Acciones', () => {
  it('lista por Plan y estado incluyendo el resumen del Plan', async () => {
    const cliente = clienteFalso({ data: [accion], error: null });
    assert.deepEqual(await listarAcciones(cliente, { idPlan: accion.id_plan, estado: 'no_iniciada' }), [accion]);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_plan', accion.id_plan],
      ['eq', 'estado', 'no_iniciada'],
    ]);
    assert.match(cliente.llamadas.find(([tipo]) => tipo === 'select')[1], /plan:planes/);
  });

  it('consulta detalle y distingue una Acción inexistente', async () => {
    assert.deepEqual(await obtenerAccionPorId(clienteFalso({ data: accion, error: null }), accion.id_accion), accion);
    await assert.rejects(
      obtenerAccionPorId(clienteFalso({ data: null, error: null }), accion.id_accion),
      error => error instanceof ErrorOperacionAccion && error.codigo === 'NO_ENCONTRADA',
    );
  });

  it('crea y actualiza con control de versión', async () => {
    const clienteCrear = clienteFalso({ data: accion, error: null });
    const { id_accion: _id, version: _version, ...entrada } = accion;
    assert.deepEqual(await crearAccion(clienteCrear, entrada), accion);
    assert.deepEqual(clienteCrear.llamadas[1], ['insert', entrada]);

    const clienteActualizar = clienteFalso({ data: { ...accion, version: 2 }, error: null });
    assert.equal((await actualizarAccion(clienteActualizar, accion.id_accion, { estado: 'cumplida' }, 1)).version, 2);
    assert.deepEqual(clienteActualizar.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_accion', accion.id_accion],
      ['eq', 'version', 1],
    ]);
  });

  it('traduce Plan inexistente, permisos, restricciones y concurrencia', async () => {
    await assert.rejects(
      crearAccion(clienteFalso({ data: null, error: { code: '23503', message: 'acciones_id_plan_fkey' } }), accion),
      error => error.codigo === 'PLAN_NO_EXISTE',
    );
    await assert.rejects(
      crearAccion(clienteFalso({ data: null, error: { code: '42501', message: 'denied' } }), accion),
      error => error.codigo === 'SIN_PERMISO',
    );
    await assert.rejects(
      crearAccion(clienteFalso({ data: null, error: { code: '23514', message: 'check' } }), accion),
      error => error.codigo === 'RESTRICCION_INCUMPLIDA',
    );
    await assert.rejects(
      actualizarAccion(clienteFalso({ data: null, error: null }), accion.id_accion, { nombre: 'Otro' }, 1),
      error => error.codigo === 'CONFLICTO_CONCURRENCIA',
    );
  });
});
