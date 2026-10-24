// Pruebas de la vista previa con respuestas SIMULADAS generadas con el contrato real del Backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECCIONES_ESPERADAS, seccionesDeVista, verificarCorrespondencia } from '../../src/lib/reportes/vista-previa.ts';
import { consolidadoConDatos, resumenConDatos, respuestaSimulada } from '../helpers/reporte-contrato.mjs';

const uuid = (n) => `13800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno' };
const completos = { ...base, id_pais: uuid(1), id_organizacion: uuid(2), id_programa: uuid(3), indicadores: [uuid(4), uuid(5)], resultados: [uuid(6)] };

test('seccionesDeVista: las 8 secciones de HU22 llegan en orden, con títulos y filas del servicio', () => {
  const vista = respuestaSimulada(base, consolidadoConDatos, resumenConDatos);
  const secciones = seccionesDeVista(vista);
  assert.deepEqual(secciones.map((s) => s.key), SECCIONES_ESPERADAS.map((s) => s.key));
  assert.ok(secciones.every((s) => s.informada));
  const porClave = Object.fromEntries(secciones.map((s) => [s.key, s.seccion]));
  // Acciones ejecutadas y compromisos cumplidos son los que el servicio filtró, no recalculados aquí.
  assert.deepEqual(porClave.completedActions.rows.map((r) => r[0]), ['Entrega de canastas']);
  assert.deepEqual(porClave.commitments.rows.map((r) => r[0]), ['Habilitar bodega']);
  // Los valores se conservan como texto recibido (sin redondear ni formatear).
  assert.equal(porClave.donations.rows[0][3], '150000.5');
});

test('seccionesDeVista: una sección esperada que no llega se marca como no informada, sin inventar filas', () => {
  const vista = respuestaSimulada(base, consolidadoConDatos, resumenConDatos);
  vista.document = { ...vista.document, sections: vista.document.sections.filter((s) => s.key !== 'results') };
  const secciones = seccionesDeVista(vista);
  const resultados = secciones.find((s) => s.key === 'results');
  assert.equal(resultados.informada, false);
  assert.equal(resultados.titulo, 'Resultados obtenidos');
  assert.equal('seccion' in resultados, false);
});

test('verificarCorrespondencia: acepta la respuesta del contrato para los mismos criterios', () => {
  assert.equal(verificarCorrespondencia(respuestaSimulada(base), base), null);
  assert.equal(verificarCorrespondencia(respuestaSimulada(completos), completos), null);
  for (const destino of ['donante', 'externo']) {
    const p = { ...completos, destino };
    assert.equal(verificarCorrespondencia(respuestaSimulada(p), p), null, destino);
  }
});

test('verificarCorrespondencia: detecta período, destino y filtros distintos de los solicitados', () => {
  const casos = [
    [{ ...base, fecha_termino: '2026-06-30' }, base, /período/],
    [{ ...base, destino: 'donante' }, base, /destino/],
    [base, { ...base, id_pais: uuid(1) }, /País.*no se aplicó/],
    [{ ...base, id_pais: uuid(9) }, { ...base, id_pais: uuid(1) }, /País/],
    [{ ...base, id_pais: uuid(1) }, base, /País/],
    [{ ...base, indicadores: [uuid(4)] }, { ...base, indicadores: [uuid(4), uuid(5)] }, /Indicadores/],
    [{ ...base, destino: 'externo', indicadores: [uuid(4)] }, { ...base, destino: 'externo', indicadores: [uuid(4), uuid(5)] }, /Indicadores/],
    [{ ...base, resultados: [uuid(6)] }, base, /Resultados/],
  ];
  for (const [respondido, solicitado, motivo] of casos) {
    assert.match(verificarCorrespondencia(respuestaSimulada(respondido), solicitado) ?? '', motivo, JSON.stringify(solicitado));
  }
});

test('verificarCorrespondencia: sin filtros declarados no se puede comprobar', () => {
  const vista = respuestaSimulada(base);
  vista.document = { ...vista.document, filters: undefined };
  assert.match(verificarCorrespondencia(vista, base), /no informó los filtros/);
});

test('verificarCorrespondencia: exige la selección completa de indicadores y resultados, sin depender del orden', () => {
  for (const campo of ['indicadores', 'resultados']) {
    const solicitado = { ...base, [campo]: [uuid(4), uuid(5)] };
    assert.equal(verificarCorrespondencia(respuestaSimulada({ ...base, [campo]: [uuid(5), uuid(4)] }), solicitado), null);
    for (const recibidos of [[uuid(4)], [uuid(4), uuid(5), uuid(6)], [uuid(4), uuid(4)]]) {
      assert.match(verificarCorrespondencia(respuestaSimulada({ ...base, [campo]: recibidos }), solicitado) ?? '', /no corresponde/);
    }
  }
});

test('verificarCorrespondencia: compara cantidades externas exactas (1 no equivale a 11)', () => {
  for (const destino of ['donante', 'externo']) {
    for (const campo of ['indicadores', 'resultados']) {
      const solicitado = { ...base, destino, [campo]: [uuid(1)] };
      const recibido = respuestaSimulada({ ...solicitado, [campo]: Array.from({ length: 11 }, (_, i) => uuid(i + 1)) });
      assert.match(verificarCorrespondencia(recibido, solicitado) ?? '', /no corresponde/);
      assert.equal(verificarCorrespondencia(respuestaSimulada(solicitado), solicitado), null);
    }
  }
});

test('verificarCorrespondencia: rechaza coincidencias parciales en filtros individuales', () => {
  const solicitado = { ...base, id_pais: uuid(1) };
  const recibido = respuestaSimulada(solicitado);
  recibido.document.filters[0] += 'texto adicional';
  assert.match(verificarCorrespondencia(recibido, solicitado) ?? '', /País.*no corresponde/);
});
