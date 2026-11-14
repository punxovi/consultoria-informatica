import type { IndicadorAccion } from '../indicadores/modelo.ts';

/** Dónde vive un indicador o resultado: sirve para mostrar solo los relacionados con los filtros. */
export type ContextoOpcion = { id_pais: string; id_organizacion: string; id_programa: string };

export type OpcionReporte = {
  valor: string;
  etiqueta: string;
  detalle?: string;
  contexto?: ContextoOpcion;
  /** Solo en resultados: indicador al que pertenece. */
  id_indicador?: string;
};

type AccionConPlan = {
  id_accion: string;
  nombre: string;
  plan?: { id_organizacion: string; id_programa: string };
};

// Los informes filtran por el ID del indicador asociado a una acción, no por
// el ID del indicador del catálogo global.
export async function cargarOpcionesIndicadoresYResultados(
  listarAcciones: () => Promise<AccionConPlan[]>,
  listarIndicadores: (accion: string) => Promise<IndicadorAccion[]>,
  listarOrganizaciones: () => Promise<{ id_organizacion: string; id_pais: string }[]> = async () => [],
) {
  const [acciones, organizaciones] = await Promise.all([
    listarAcciones(),
    listarOrganizaciones(),
  ]);
  const paisDe = new Map(organizaciones.map((o) => [o.id_organizacion, o.id_pais]));
  const indicadores = new Map<string, OpcionReporte>();
  const resultados = new Map<string, OpcionReporte>();
  let siguiente = 0;

  await Promise.all(Array.from({ length: Math.min(4, acciones.length) }, async () => {
    while (siguiente < acciones.length) {
      const accion = acciones[siguiente++];
      const contexto: ContextoOpcion | undefined = accion.plan
        ? {
          id_pais: paisDe.get(accion.plan.id_organizacion) ?? '',
          id_organizacion: accion.plan.id_organizacion,
          id_programa: accion.plan.id_programa,
        }
        : undefined;
      for (const indicador of await listarIndicadores(accion.id_accion)) {
        indicadores.set(indicador.id_indicador, {
          valor: indicador.id_indicador,
          etiqueta: `${accion.nombre} · ${indicador.nombre ?? 'Indicador'}`,
          detalle: indicador.unidad_medida,
          ...(contexto ? { contexto } : {}),
        });
        const resultado = indicador.resultado;
        if (resultado) {
          resultados.set(resultado.id_resultado, {
            valor: resultado.id_resultado,
            etiqueta: `${accion.nombre} · ${indicador.nombre ?? 'Indicador'}: ${resultado.valor_medido}${indicador.unidad_medida ? ` ${indicador.unidad_medida}` : ''} (${resultado.fecha_medicion})`,
            ...(contexto ? { contexto } : {}),
            id_indicador: indicador.id_indicador,
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

export type FiltrosOpciones = {
  id_pais: string;
  id_organizacion: string;
  id_programa: string;
  /** Indicadores marcados: si hay alguno, solo se ofrecen sus resultados. */
  indicadores: string[];
};

/**
 * Deja solo los indicadores y resultados relacionados con el país, la
 * organización y el programa elegidos. Los resultados además se limitan a los
 * indicadores marcados, si hay alguno.
 */
export function filtrarOpcionesReporte(
  opciones: { indicadores: OpcionReporte[]; resultados: OpcionReporte[] },
  filtros: FiltrosOpciones,
) {
  const coincide = (opcion: OpcionReporte) => {
    const contexto = opcion.contexto;
    if (!contexto) return !filtros.id_pais && !filtros.id_organizacion && !filtros.id_programa;
    return (!filtros.id_pais || contexto.id_pais === filtros.id_pais)
      && (!filtros.id_organizacion || contexto.id_organizacion === filtros.id_organizacion)
      && (!filtros.id_programa || contexto.id_programa === filtros.id_programa);
  };
  const indicadores = opciones.indicadores.filter(coincide);
  const marcados = new Set(filtros.indicadores.filter((id) => indicadores.some((i) => i.valor === id)));
  const resultados = opciones.resultados.filter((resultado) =>
    coincide(resultado) && (marcados.size === 0 || marcados.has(resultado.id_indicador ?? '')));
  return { indicadores, resultados };
}
