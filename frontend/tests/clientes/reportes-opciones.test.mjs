import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarOpcionesIndicadoresYResultados } from '../../src/lib/reportes/resultados.ts';

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
    valor: resultadoId, etiqueta: 'Entrega de alimentos · Raciones: 80 raciones (2026-06-01)',
  }]);
});
