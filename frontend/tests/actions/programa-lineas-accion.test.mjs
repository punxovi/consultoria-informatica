import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actualizarLineaAccionPrograma,
  crearLineaAccionPrograma,
  ErrorOperacionLineaAccionPrograma,
  listarLineasAccionPrograma,
} from '../../src/lib/server/programa-lineas-accion.ts';

const linea = {
  id_linea_accion: '17310000-0000-4000-8000-000000000001',
  id_programa: '17300000-0000-4000-8000-000000000001',
  linea_accion: 'Capacitación',
  resultado_esperado: 'Equipo capacitado',
  version: 1,
};

function clienteFalso(respuesta) {
  const llamadas = [];
  const consulta = {
    select(campos) { llamadas.push(['select', campos]); return this; },
    eq(campo, valor) { llamadas.push(['eq', campo, valor]); return this; },
    is(campo, valor) { llamadas.push(['is', campo, valor]); return this; },
    order(campo, opciones) { llamadas.push(['order', campo, opciones]); return this; },
    single() { return Promise.resolve(respuesta); },
    maybeSingle() { return Promise.resolve(respuesta); },
    then(resolver, rechazar) { return Promise.resolve(respuesta).then(resolver, rechazar); },
    insert(datos) { llamadas.push(['insert', datos]); return this; },
    update(datos) { llamadas.push(['update', datos]); return this; },
  };
  return {
    llamadas,
    from(tabla) { llamadas.push(['from', tabla]); return consulta; },
  };
}

describe('operaciones de líneas de acción de Programas', () => {
  it('consulta líneas activas de un programa en orden estable', async () => {
    const cliente = clienteFalso({ data: [linea], error: null });
    const resultado = await listarLineasAccionPrograma(cliente, linea.id_programa);

    assert.deepEqual(resultado, [linea]);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_programa', linea.id_programa],
    ]);
    assert.ok(cliente.llamadas.some(([tipo, campo]) => tipo === 'is' && campo === 'archived_at'));
    assert.equal(cliente.llamadas.filter(([tipo]) => tipo === 'order').length, 2);
  });

  it('crea una línea con su resultado esperado sin usar otra tabla', async () => {
    const cliente = clienteFalso({ data: linea, error: null });
    const entrada = {
      id_programa: linea.id_programa,
      linea_accion: linea.linea_accion,
      resultado_esperado: linea.resultado_esperado,
    };
    assert.deepEqual(await crearLineaAccionPrograma(cliente, entrada), linea);
    assert.deepEqual(cliente.llamadas[0], ['from', 'programa_lineas_accion']);
    assert.deepEqual(cliente.llamadas[1], ['insert', entrada]);
  });

  it('actualiza solo campos editables y aplica la versión esperada', async () => {
    const cliente = clienteFalso({ data: { ...linea, version: 2 }, error: null });
    const resultado = await actualizarLineaAccionPrograma(
      cliente,
      linea.id_linea_accion,
      { resultado_esperado: 'Equipo certificado' },
      1,
    );
    assert.equal(resultado.version, 2);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_linea_accion', linea.id_linea_accion],
      ['eq', 'version', 1],
    ]);
  });

  it('reporta conflictos y líneas duplicadas de manera estable', async () => {
    const sinCoincidencia = clienteFalso({ data: null, error: null });
    await assert.rejects(
      actualizarLineaAccionPrograma(sinCoincidencia, linea.id_linea_accion, { linea_accion: 'Otra' }, 1),
      (error) => error instanceof ErrorOperacionLineaAccionPrograma && error.codigo === 'CONFLICTO_CONCURRENCIA',
    );

    const duplicada = clienteFalso({ data: null, error: { code: '23505', message: 'duplicate' } });
    await assert.rejects(
      crearLineaAccionPrograma(duplicada, linea),
      (error) => error instanceof ErrorOperacionLineaAccionPrograma && error.codigo === 'LINEA_DUPLICADA',
    );
  });
});
