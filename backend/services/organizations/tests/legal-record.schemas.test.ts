import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  registerLegalRecordSchema,
  updateLegalRecordSchema,
} from '../src/domain/legal-record.schemas.ts';

const valid = {
  estado_personalidad_juridica: 'si',
  tipo_personalidad_juridica: 'ONG',
  numero_registro: ' REG-2026 ',
  fecha_constitucion: '2020-02-29',
  vigencia_directiva: ' Vigente hasta 2028 ',
  documentos: [
    { tipo: 'identidad_representante', estado: 'pendiente' },
    { tipo: 'identificacion_legal', estado: 'no_aplica' },
    { tipo: 'estatutos', estado: 'cargado' },
  ],
};

describe('schemas Zod de Expediente Legal', () => {
  test('normaliza y acepta un registro válido', () => {
    const result = registerLegalRecordSchema.parse(valid);
    assert.equal(result.numero_registro, 'REG-2026');
    assert.equal(result.vigencia_directiva, 'Vigente hasta 2028');
    assert.equal(result.documentos.length, 3);
  });

  test('exige versión positiva únicamente al actualizar', () => {
    assert.equal(updateLegalRecordSchema.safeParse({ ...valid, version_esperada: 2 }).success, true);
    assert.equal(updateLegalRecordSchema.safeParse(valid).success, false);
    assert.equal(updateLegalRecordSchema.safeParse({ ...valid, version_esperada: 0 }).success, false);
    assert.equal(registerLegalRecordSchema.safeParse({ ...valid, version_esperada: 2 }).success, false);
  });

  test('rechaza campos faltantes, tipos incorrectos y restricciones inválidas', () => {
    const invalid = [
      { ...valid, estado_personalidad_juridica: undefined },
      { ...valid, numero_registro: 123 },
      { ...valid, numero_registro: 'x'.repeat(151) },
      { ...valid, fecha_constitucion: '2023-02-29' },
      { ...valid, fecha_constitucion: '2999-01-01' },
      { ...valid, documentos: valid.documentos.slice(0, 2) },
      { ...valid, documentos: [valid.documentos[0], valid.documentos[0], valid.documentos[2]] },
      { ...valid, extra: true },
    ];
    for (const input of invalid) {
      assert.equal(registerLegalRecordSchema.safeParse(input).success, false);
    }
  });
});
