import type { IndicadorAccion } from '../indicadores/modelo.ts';

export type OpcionReporte = { valor: string; etiqueta: string; detalle?: string };

// Los informes filtran por el ID del indicador asociado a una acción, no por
// el ID del indicador del catálogo global.
export async function cargarOpcionesIndicadoresYResultados(
  listarAcciones: () => Promise<{ id_accion: string; nombre: string }[]>,
  listarIndicadores: (accion: string) => Promise<IndicadorAccion[]>,
) {
  const acciones = await listarAcciones();
  const indicadores = new Map<string, OpcionReporte>();
  const resultados = new Map<string, OpcionReporte>();
  let siguiente = 0;

  await Promise.all(Array.from({ length: Math.min(4, acciones.length) }, async () => {
    while (siguiente < acciones.length) {
      const accion = acciones[siguiente++];
      for (const indicador of await listarIndicadores(accion.id_accion)) {
        indicadores.set(indicador.id_indicador, {
          valor: indicador.id_indicador,
          etiqueta: `${accion.nombre} · ${indicador.nombre ?? 'Indicador'}`,
          detalle: indicador.unidad_medida,
        });
        const resultado = indicador.resultado;
        if (resultado) {
          resultados.set(resultado.id_resultado, {
            valor: resultado.id_resultado,
            etiqueta: `${accion.nombre} · ${indicador.nombre ?? 'Indicador'}: ${resultado.valor_medido}${indicador.unidad_medida ? ` ${indicador.unidad_medida}` : ''} (${resultado.fecha_medicion})`,
          });
        }
      }
    }
  }));

  const ordenar = (a: OpcionReporte, b: OpcionReporte) => a.etiqueta.localeCompare(b.etiqueta, 'es');
  return {
    indicadores: [...indicadores.values()].sort(ordenar),
    resultados: [...resultados.values()].sort(ordenar),
  };
}
