import assert from 'node:assert/strict';
import { it } from 'node:test';
import { archivarProgramaSchema } from '../../src/lib/validaciones/programas.ts';

it('el archivo requiere UUID y versión positiva, y rechaza campos adicionales', () => {
  const entrada = { id_programa: '17200000-0000-4000-8000-000000000001', version_esperada: 1 };
  assert.equal(archivarProgramaSchema.safeParse(entrada).success, true);
  for (const invalida of [ { ...entrada, version_esperada: undefined }, { ...entrada, version_esperada: 0 }, { ...entrada, version_esperada: 1.5 }, { ...entrada, id_programa: 'otro' }, { ...entrada, archived_at: 'ayer' } ]) {
    assert.equal(archivarProgramaSchema.safeParse(invalida).success, false);
  }
});
