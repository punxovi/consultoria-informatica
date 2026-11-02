import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SELECCION,
  configuracionInicial,
  esFechaCalendario,
  filtrosSeleccionados,
  quitarFiltro,
  restablecerFiltros,
  validarConfiguracion,
} from '../../src/lib/reportes/configuracion.ts';

const uuid = (n) => `13700000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const valida = { ...configuracionInicial(), fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31' };

test('esFechaCalendario: rechaza fechas imposibles y año 0000', () => {
  assert.ok(esFechaCalendario('2026-02-28'));
  assert.ok(esFechaCalendario('2028-02-29'));
  for (const invalida of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-1-1', '', 'abc']) {
    assert.equal(esFechaCalendario(invalida), false, invalida);
  }
});

test('validarConfiguracion: ambas fechas son obligatorias', () => {
  const resultado = validarConfiguracion(configuracionInicial());
  assert.equal(resultado.ok, false);
  assert.match(resultado.errores.fecha_inicio, /fecha de inicio/);
  assert.match(resultado.errores.fecha_termino, /fecha de término/);

  const soloInicio = validarConfiguracion({ ...valida, fecha_termino: '' });
  assert.deepEqual(Object.keys(soloInicio.errores), ['fecha_termino']);
});

test('validarConfiguracion: el inicio no puede ser posterior al término', () => {
  const resultado = validarConfiguracion({ ...valida, fecha_inicio: '2026-12-31', fecha_termino: '2026-01-01' });
  assert.equal(resultado.ok, false);
  assert.match(resultado.errores.fecha_inicio, /posterior/);
  assert.match(resultado.errores.fecha_termino, /anterior/);
  assert.ok(validarConfiguracion({ ...valida, fecha_inicio: '2026-05-01', fecha_termino: '2026-05-01' }).ok);
});

test('validarConfiguracion: arma parámetros compatibles con el contrato del Gateway', () => {
  const sinFiltros = validarConfiguracion(valida);
  assert.deepEqual(sinFiltros.parametros, { fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno' });

  const completa = validarConfiguracion({
    ...valida,
    id_pais: uuid(1), id_organizacion: uuid(2), id_programa: uuid(3),
    indicadores: [uuid(4), uuid(4), uuid(5)], resultados: [uuid(6)], destino: 'donante',
  });
  assert.ok(completa.ok);
  assert.deepEqual(completa.parametros, {
    fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'donante',
    id_pais: uuid(1), id_organizacion: uuid(2), id_programa: uuid(3),
    indicadores: [uuid(4), uuid(5)], resultados: [uuid(6)],
  });
});

test('validarConfiguracion: rechaza identificadores no válidos y listas demasiado largas', () => {
  const invalido = validarConfiguracion({ ...valida, id_pais: 'chile', indicadores: ['x'] });
  assert.equal(invalido.ok, false);
  assert.ok(invalido.errores.id_pais && invalido.errores.indicadores);

  const largas = Array.from({ length: MAX_SELECCION + 1 }, (_, i) => uuid(i + 1));
  assert.ok(validarConfiguracion({ ...valida, indicadores: largas }).errores.indicadores);
  assert.ok(validarConfiguracion({ ...valida, indicadores: largas.slice(0, MAX_SELECCION) }).ok);
  assert.ok(validarConfiguracion({ ...valida, destino: 'publico' }).errores.destino);
});

test('filtros seleccionados: se listan, se quitan uno a uno y se restablecen sin tocar el período', () => {
  const config = { ...valida, id_pais: uuid(1), indicadores: [uuid(4), uuid(5)] };
  const nombres = {
    id_pais: new Map([[uuid(1), 'Chile']]), id_organizacion: new Map(), id_programa: new Map(),
    indicadores: new Map([[uuid(4), 'Cobertura']]), resultados: new Map(),
  };
  const filtros = filtrosSeleccionados(config, nombres);
  assert.deepEqual(filtros.map((f) => f.etiqueta), ['País: Chile', 'Indicador: Cobertura', 'Indicador: Selección']);

  const sinIndicador = quitarFiltro(config, { campo: 'indicadores', valor: uuid(4) });
  assert.deepEqual(sinIndicador.indicadores, [uuid(5)]);
  assert.equal(quitarFiltro(config, { campo: 'id_pais', valor: uuid(1) }).id_pais, '');

  const limpia = restablecerFiltros(config);
  assert.deepEqual(limpia, valida);
  assert.equal(filtrosSeleccionados(limpia, nombres).length, 0);
});
