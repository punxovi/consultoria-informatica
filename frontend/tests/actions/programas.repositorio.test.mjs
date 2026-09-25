import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actualizarPrograma,
  archivarPrograma,
  crearPrograma,
  ErrorOperacionPrograma,
  listarProgramas,
  obtenerProgramaPorId,
} from '../../src/lib/server/programas.ts';

const programa = {
  id_programa: '17200000-0000-4000-8000-000000000001',
  nombre: 'Programa de prueba',
  descripcion: 'Descripción',
  objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos',
  componentes_linea_accion: 'Componentes legados',
  resultados_esperados: 'Resultados legados',
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

describe('operaciones de Programas Institucionales', () => {
  it('archiva con control de versión sin borrar dependencias', async () => {
    const cliente = clienteFalso({ data: { ...programa, archived_at: '2026-09-24T12:00:00Z' }, error: null });
    const resultado = await archivarPrograma(cliente, programa.id_programa, 1);
    assert.ok(resultado.archived_at);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'from'), [['from', 'programas']]);
    const cambios = cliente.llamadas.find(([tipo]) => tipo === 'update')[1];
    assert.deepEqual(Object.keys(cambios), ['archived_at']);
    assert.ok(Number.isFinite(Date.parse(cambios.archived_at)));
    assert.ok(cliente.llamadas.some(([tipo, campo, valor]) => tipo === 'eq' && campo === 'version' && valor === 1));
    assert.ok(cliente.llamadas.some(([tipo, campo, valor]) => tipo === 'is' && campo === 'archived_at' && valor === null));
  });

  it('no informa éxito si RLS rechaza el archivo o la versión quedó desactualizada', async () => {
    await assert.rejects(archivarPrograma(clienteFalso({ data: null, error: { code: '42501', message: 'denied' } }), programa.id_programa, 1), error => error.codigo === 'SIN_PERMISO');
    await assert.rejects(archivarPrograma(clienteFalso({ data: null, error: null }), programa.id_programa, 1), error => error.codigo === 'CONFLICTO_CONCURRENCIA');
  });
  it('lista programas activos sin filtrar por organización o país', async () => {
    const cliente = clienteFalso({ data: [programa], error: null });
    assert.deepEqual(await listarProgramas(cliente), [programa]);
    assert.deepEqual(cliente.llamadas[0], ['from', 'programas']);
    assert.ok(cliente.llamadas.some(([tipo, campo]) => tipo === 'is' && campo === 'archived_at'));
    assert.equal(cliente.llamadas.filter(([tipo]) => tipo === 'eq').length, 0);
  });

  it('consulta un programa por ID y distingue el caso inexistente', async () => {
    const cliente = clienteFalso({ data: programa, error: null });
    assert.deepEqual(await obtenerProgramaPorId(cliente, programa.id_programa), programa);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_programa', programa.id_programa],
    ]);

    await assert.rejects(
      obtenerProgramaPorId(clienteFalso({ data: null, error: null }), programa.id_programa),
      (error) => error instanceof ErrorOperacionPrograma && error.codigo === 'NO_ENCONTRADO',
    );
  });

  it('crea un programa global con todos los campos exigidos por la tabla', async () => {
    const cliente = clienteFalso({ data: programa, error: null });
    const { id_programa: _id, version: _version, ...entrada } = programa;
    assert.deepEqual(await crearPrograma(cliente, entrada), programa);
    assert.deepEqual(cliente.llamadas[1], ['insert', entrada]);
    assert.ok(!Object.hasOwn(entrada, 'id_organizacion'));
  });

  it('actualiza un programa activo con control de versión', async () => {
    const cliente = clienteFalso({ data: { ...programa, version: 2 }, error: null });
    const actualizado = await actualizarPrograma(
      cliente, programa.id_programa, { descripcion: 'Nueva descripción' }, 1,
    );
    assert.equal(actualizado.version, 2);
    assert.deepEqual(cliente.llamadas.filter(([tipo]) => tipo === 'eq'), [
      ['eq', 'id_programa', programa.id_programa],
      ['eq', 'version', 1],
    ]);
    assert.deepEqual(cliente.llamadas[1], ['update', { descripcion: 'Nueva descripción' }]);
  });

  it('distingue un conflicto de versión y la falta de permisos', async () => {
    await assert.rejects(
      actualizarPrograma(
        clienteFalso({ data: null, error: null }),
        programa.id_programa, { nombre: 'Otro' }, 1,
      ),
      (error) => error instanceof ErrorOperacionPrograma && error.codigo === 'CONFLICTO_CONCURRENCIA',
    );
    await assert.rejects(
      crearPrograma(clienteFalso({ data: null, error: { code: '42501', message: 'denied' } }), programa),
      (error) => error instanceof ErrorOperacionPrograma && error.codigo === 'SIN_PERMISO',
    );
  });
});
