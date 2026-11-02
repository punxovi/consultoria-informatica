import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actualizarAccionSchema,
  crearAccionSchema,
  formatearErroresAccion,
  listarAccionesSchema,
  obtenerAccionPorIdSchema,
} from '../../src/lib/validaciones/acciones.ts';

const accionValida = {
  id_plan: '30000000-0000-4000-8000-000000000001',
  nombre: ' Taller comunitario ',
  responsable_nombre: ' Ana Pérez ',
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-04-01',
  resultado_esperado: ' Participantes capacitados ',
};

describe('schemas Zod de Acciones', () => {
  it('normaliza la creación y aplica el estado inicial', () => {
    const resultado = crearAccionSchema.parse(accionValida);
    assert.equal(resultado.nombre, 'Taller comunitario');
    assert.equal(resultado.estado, 'no_iniciada');
    assert.equal(resultado.resultado_esperado, 'Participantes capacitados');
  });

  it('rechaza datos inválidos, fechas invertidas y campos adicionales', () => {
    const resultado = crearAccionSchema.safeParse({
      ...accionValida,
      id_plan: 'no-uuid',
      nombre: ' ',
      fecha_inicio: '2026-04-02',
      fecha_termino: '2026-04-01',
      campo_extra: true,
    });
    assert.equal(resultado.success, false);
    const campos = new Set(formatearErroresAccion(resultado.error).map(error => error.campo));
    for (const campo of ['id_plan', 'nombre', 'fecha_termino', '_entrada']) {
      assert.equal(campos.has(campo), true, `Falta error para ${campo}`);
    }
  });

  it('exige motivo para cancelar una acción', () => {
    const resultado = crearAccionSchema.safeParse({ ...accionValida, estado: 'cancelada' });
    assert.equal(resultado.success, false);
    assert.equal(formatearErroresAccion(resultado.error).some(error => error.campo === 'observacion_motivo'), true);
  });

  it('valida actualización parcial, filtros e identificadores', () => {
    assert.equal(actualizarAccionSchema.safeParse({ id_accion: accionValida.id_plan, cambios: {} }).success, false);
    assert.equal(actualizarAccionSchema.safeParse({
      id_accion: accionValida.id_plan,
      version_esperada: 2,
      cambios: { estado: 'cumplida', resultado_esperado: 'Resultado logrado' },
    }).success, true);
    assert.deepEqual(listarAccionesSchema.parse({}), { incluir_archivadas: false });
    assert.equal(listarAccionesSchema.safeParse({ estado: 'desconocido' }).success, false);
    assert.equal(obtenerAccionPorIdSchema.safeParse({ id_accion: 'no-uuid' }).success, false);
  });
});
