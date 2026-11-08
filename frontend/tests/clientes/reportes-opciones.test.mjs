import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarOpcionesIndicadoresYResultados, filtrarOpcionesReporte } from '../../src/lib/reportes/resultados.ts';

const accionId = '13700000-0000-4000-8000-0000000000d1';
const catalogoId = '13700000-0000-4000-8000-0000000000c1';
const indicadorId = '13700000-0000-4000-8000-0000000000e1';
const resultadoId = '13700000-0000-4000-8000-0000000000f1';

test('usa IDs de indicadores asociados y carga resultados por las rutas HTTP autorizadas', async () => {
  const llamadas = [];
  const opciones = await cargarOpcionesIndicadoresYResultados(
    async () => [{ id_accion: accionId, nombre: 'Entrega de alimentos' }],
    async (id) => {
      llamadas.push(id);
      return [{
        id_indicador: indicadorId, id_accion: accionId, id_catalogo: catalogoId,
        nombre: 'Raciones', unidad_medida: 'raciones', meta: 100, version: 1,
        resultado: {
          id_resultado: resultadoId, id_indicador: indicadorId, valor_medido: 80,
          fecha_medicion: '2026-06-01', observaciones: null, version: 1,
        },
      }];
    },
  );

  assert.deepEqual(llamadas, [accionId]);
  assert.deepEqual(opciones.indicadores, [{
    valor: indicadorId, etiqueta: 'Entrega de alimentos · Raciones', detalle: 'raciones',
  }]);
  assert.deepEqual(opciones.resultados, [{
    valor: resultadoId, etiqueta: 'Entrega de alimentos · Raciones: 80 raciones (2026-06-01)', id_indicador: indicadorId,
  }]);
});

test('cada opción conoce el país, la organización y el programa de su acción', async () => {
  const opciones = await cargarOpcionesIndicadoresYResultados(
    async () => [{ id_accion: accionId, nombre: 'Entrega', plan: { id_organizacion: 'org-cl', id_programa: 'prog-1' } }],
    async () => [{
      id_indicador: indicadorId, id_accion: accionId, id_catalogo: catalogoId,
      nombre: 'Raciones', unidad_medida: 'raciones', meta: 100, version: 1, resultado: null,
    }],
    async () => [{ id_organizacion: 'org-cl', id_pais: 'pais-cl' }],
  );
  assert.deepEqual(opciones.indicadores[0].contexto, { id_pais: 'pais-cl', id_organizacion: 'org-cl', id_programa: 'prog-1' });
});

test('solo ofrece indicadores y resultados relacionados con los filtros elegidos', () => {
  const chile = { id_pais: 'cl', id_organizacion: 'org-cl', id_programa: 'p1' };
  const uruguay = { id_pais: 'uy', id_organizacion: 'org-uy', id_programa: 'p2' };
  const opciones = {
    indicadores: [
      { valor: 'i-cl', etiqueta: 'Chile', contexto: chile },
      { valor: 'i-cl-2', etiqueta: 'Chile 2', contexto: chile },
      { valor: 'i-uy', etiqueta: 'Uruguay', contexto: uruguay },
    ],
    resultados: [
      { valor: 'r-cl', etiqueta: 'R Chile', contexto: chile, id_indicador: 'i-cl' },
      { valor: 'r-cl-2', etiqueta: 'R Chile 2', contexto: chile, id_indicador: 'i-cl-2' },
      { valor: 'r-uy', etiqueta: 'R Uruguay', contexto: uruguay, id_indicador: 'i-uy' },
    ],
  };
  const sinFiltros = filtrarOpcionesReporte(opciones, { id_pais: '', id_organizacion: '', id_programa: '', indicadores: [] });
  assert.equal(sinFiltros.indicadores.length, 3);

  const porPais = filtrarOpcionesReporte(opciones, { id_pais: 'cl', id_organizacion: '', id_programa: '', indicadores: [] });
  assert.deepEqual(porPais.indicadores.map((o) => o.valor), ['i-cl', 'i-cl-2']);
  assert.deepEqual(porPais.resultados.map((o) => o.valor), ['r-cl', 'r-cl-2']);

  const porPrograma = filtrarOpcionesReporte(opciones, { id_pais: '', id_organizacion: '', id_programa: 'p2', indicadores: [] });
  assert.deepEqual(porPrograma.indicadores.map((o) => o.valor), ['i-uy']);

  const conIndicador = filtrarOpcionesReporte(opciones, { id_pais: 'cl', id_organizacion: '', id_programa: '', indicadores: ['i-cl'] });
  assert.deepEqual(conIndicador.resultados.map((o) => o.valor), ['r-cl']);

  // Un indicador marcado de otro país no limita los resultados del país elegido.
  const marcadoAjeno = filtrarOpcionesReporte(opciones, { id_pais: 'cl', id_organizacion: '', id_programa: '', indicadores: ['i-uy'] });
  assert.deepEqual(marcadoAjeno.resultados.map((o) => o.valor), ['r-cl', 'r-cl-2']);
});
