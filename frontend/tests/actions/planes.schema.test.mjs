import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actualizarPlanSchema,
  crearPlanSchema,
  formatearErroresPlan,
  listarPlanesSchema,
  obtenerPlanPorIdSchema,
} from '../../src/actions/planes/planes.schema.ts';

const planValido = {
  id_organizacion: '10000000-0000-4000-8000-000000000001',
  id_programa: '20000000-0000-4000-8000-000000000001',
  nombre: ' Plan anual ',
  situacion_necesidad: ' Necesidad prioritaria ',
  objetivo_general: ' Fortalecer la organización ',
  objetivos_especificos: ' Capacitar al equipo ',
  resultado_esperado: ' Equipo fortalecido ',
  responsable_nombre: ' Ana Pérez ',
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-12-15',
};

describe('schemas Zod de Planes', () => {
  it('acepta y normaliza una creación válida', () => {
    const resultado = crearPlanSchema.parse(planValido);
    assert.equal(resultado.nombre, 'Plan anual');
    assert.equal(resultado.responsable_nombre, 'Ana Pérez');
    assert.equal(resultado.fecha_inicio, '2026-03-01');
  });

  it('rechaza UUID, campos, tipos y fechas inválidas', () => {
    const resultado = crearPlanSchema.safeParse({
      ...planValido,
      id_organizacion: 'organizacion-invalida',
      nombre: ' ',
      responsable_nombre: 42,
      fecha_inicio: '2026-02-30',
      fecha_termino: '2026-01-01',
      campo_extra: true,
    });
    assert.equal(resultado.success, false);
    const campos = new Set(formatearErroresPlan(resultado.error).map((error) => error.campo));
    for (const campo of ['id_organizacion', 'nombre', 'responsable_nombre', 'fecha_inicio', '_entrada']) {
      assert.equal(campos.has(campo), true, `Falta error para ${campo}`);
    }
  });

  it('impide una fecha de término anterior al inicio', () => {
    const resultado = crearPlanSchema.safeParse({
      ...planValido,
      fecha_inicio: '2026-10-01',
      fecha_termino: '2026-09-30',
    });
    assert.equal(resultado.success, false);
    assert.equal(formatearErroresPlan(resultado.error).some((error) => error.campo === 'fecha_termino'), true);
  });

  it('valida actualización parcial y control de versión', () => {
    assert.equal(actualizarPlanSchema.safeParse({ id_plan: planValido.id_programa, cambios: {} }).success, false);
    assert.equal(actualizarPlanSchema.safeParse({
      id_plan: planValido.id_programa,
      version_esperada: 0,
      cambios: { nombre: 'Actualizado' },
    }).success, false);
    assert.equal(actualizarPlanSchema.safeParse({
      id_plan: planValido.id_programa,
      version_esperada: 2,
      cambios: { nombre: 'Actualizado' },
    }).success, true);
  });

  it('valida filtros e identificadores', () => {
    assert.deepEqual(listarPlanesSchema.parse({}), { incluir_archivados: false });
    assert.equal(listarPlanesSchema.safeParse({ id_programa: 'no-uuid' }).success, false);
    assert.equal(obtenerPlanPorIdSchema.safeParse({ id_plan: 'no-uuid' }).success, false);
  });
});
