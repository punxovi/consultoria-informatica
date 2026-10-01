import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseArchiveInput, parseProgramFields, parseUpdateInput } from '../src/domain/programs.ts';

const valid = {
  nombre: 'Programa QA',
  descripcion: 'Descripción del programa',
  objetivo_general: 'Objetivo general',
  objetivos_especificos: 'Objetivos específicos',
  lineas_accion: [{ linea_accion: 'Formación', resultado_esperado: 'Personas capacitadas' }],
  referencias_ods: 'ODS 4',
  referencias_esg: '',
};

describe('validaciones de Programas', () => {
  test('normaliza creación y acepta referencias opcionales', () => {
    const parsed = parseProgramFields({ ...valid, nombre: '  Programa QA  ' });
    assert.equal(parsed.nombre, 'Programa QA');
    assert.equal(parsed.lineas_accion.length, 1);
  });

  test('rechaza líneas duplicadas y campos adicionales', () => {
    assert.throws(() => parseProgramFields({
      ...valid,
      lineas_accion: [valid.lineas_accion[0], { ...valid.lineas_accion[0], linea_accion: ' formación ' }],
    }), /repetida/);
    assert.throws(() => parseProgramFields({ ...valid, inesperado: true }), /no está permitido/);
  });

  test('valida actualización y versión de archivo', () => {
    assert.deepEqual(parseUpdateInput({ version_esperada: 2, cambios: { nombre: 'Editado' } }), {
      expectedVersion: 2,
      changes: { nombre: 'Editado' },
    });
    assert.equal(parseArchiveInput({ version_esperada: 3 }), 3);
    assert.throws(() => parseUpdateInput({ cambios: {} }), /al menos un campo/);
    assert.throws(() => parseArchiveInput({ version_esperada: 0 }), /mayor que cero/);
  });
});
