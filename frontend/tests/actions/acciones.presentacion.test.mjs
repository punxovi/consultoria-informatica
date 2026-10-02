import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaVencida, etiquetaEstado, estadosSeleccionables, fechaLocal } from '../../src/lib/acciones/presentacion.ts';

test('vencimiento es una condición por fecha, no un estado seleccionable', () => {
  assert.equal(estaVencida({ estado: 'no_iniciada', fecha_termino: '2026-10-01' }, '2026-10-02'), true);
  assert.equal(estaVencida({ estado: 'en_desarrollo', fecha_termino: '2026-10-02' }, '2026-10-02'), false);
  assert.equal(estaVencida({ estado: 'no_iniciada', fecha_termino: '2026-10-03' }, '2026-10-02'), false);
  for (const estado of ['cumplida', 'cancelada']) assert.equal(estaVencida({ estado, fecha_termino: '2026-09-01' }, '2026-10-02'), false);
  assert.equal(estadosSeleccionables.length, 4);
  assert.equal(estadosSeleccionables.some(item => item.valor === 'atrasada'), false);
  assert.equal(etiquetaEstado('atrasada'), 'Atrasada (registro anterior)');
});

test('el día local no cambia al convertirlo a UTC', () => {
  assert.equal(fechaLocal(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
});
