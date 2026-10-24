import type { IndicadorAccion } from '../indicadores/modelo.ts';

// Reutiliza las consultas autorizadas de acciones e indicadores; no consulta Supabase.
export async function cargarOpcionesResultados(
  listarAcciones: () => Promise<{ id_accion: string; nombre: string }[]>,
  listarIndicadores: (accion: string) => Promise<IndicadorAccion[]>,
) {
  const acciones = await listarAcciones();
  const opciones = new Map<string, { valor: string; etiqueta: string }>();
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(4, acciones.length) }, async () => {
    while (siguiente < acciones.length) {
      const accion = acciones[siguiente++];
      for (const indicador of await listarIndicadores(accion.id_accion)) {
        const resultado = indicador.resultado;
        if (!resultado) continue;
        opciones.set(resultado.id_resultado, {
          valor: resultado.id_resultado,
          etiqueta: `${accion.nombre} · ${indicador.nombre ?? 'Indicador'}: ${resultado.valor_medido}${indicador.unidad_medida ? ` ${indicador.unidad_medida}` : ''} (${resultado.fecha_medicion})`,
        });
      }
    }
  }));
  return [...opciones.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}
