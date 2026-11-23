import type { ReportFilters, ReportPreview } from './pdf.ts';

export type SeccionReporte = ReportPreview['document']['sections'][number];

export const SECCIONES_ESPERADAS = [
  { key: 'organizations', titulo: 'Organizaciones y beneficiarios' },
  { key: 'plans', titulo: 'Planes de Intervención' },
  { key: 'actions', titulo: 'Acciones' },
  { key: 'completedActions', titulo: 'Acciones ejecutadas' },
  { key: 'commitments', titulo: 'Compromisos cumplidos' },
  { key: 'donations', titulo: 'Donaciones y recursos' },
  { key: 'indicators', titulo: 'Indicadores' },
  { key: 'results', titulo: 'Resultados obtenidos' },
] as const;

export type SeccionVista =
  | { key: string; titulo: string; informada: true; seccion: SeccionReporte }
  | { key: string; titulo: string; informada: false };

export function seccionesDeVista(vista: ReportPreview): SeccionVista[] {
  const recibidas = vista.document.sections;
  const resultado: SeccionVista[] = recibidas.map((seccion) => ({ key: seccion.key, titulo: seccion.title, informada: true, seccion }));
  for (const esperada of SECCIONES_ESPERADAS) {
    if (!recibidas.some((seccion) => seccion.key === esperada.key)) {
      resultado.push({ key: esperada.key, titulo: esperada.titulo, informada: false });
    }
  }
  return resultado;
}

const filtrosContrato = [
  { prefijo: 'País:', campo: 'id_pais', todos: 'País: todos los visibles para la sesión' },
  { prefijo: 'Organización:', campo: 'id_organizacion', todos: 'Organización: todas las visibles' },
  { prefijo: 'Programa:', campo: 'id_programa', todos: 'Programa: todos los visibles' },
  { prefijo: 'Indicadores:', campo: 'indicadores', todos: 'Indicadores: sin selección adicional' },
  { prefijo: 'Resultados:', campo: 'resultados', todos: 'Resultados: sin selección adicional' },
] as const;

export function verificarCorrespondencia(vista: ReportPreview, parametros: ReportFilters): string | null {
  const documento = vista.document;
  if (documento.period?.start !== parametros.fecha_inicio || documento.period?.end !== parametros.fecha_termino) {
    return 'el período recibido no coincide con el solicitado';
  }
  const destino = parametros.destino ?? 'interno';
  if (documento.destination !== destino) return 'el destino recibido no coincide con el solicitado';
  if (!Array.isArray(documento.filters)) return 'el servicio no informó los filtros aplicados';

  for (const filtro of filtrosContrato) {
    const declarado = documento.filters.find((texto) => texto.startsWith(filtro.prefijo));
    const valor = parametros[filtro.campo];
    const ids = Array.isArray(valor) ? valor : valor ? [valor] : [];
    if (!declarado) return `el servicio no informó el filtro «${filtro.prefijo.slice(0, -1)}»`;
    if (ids.length === 0) {
      if (declarado !== filtro.todos) return `el filtro «${filtro.prefijo.slice(0, -1)}» no corresponde a lo solicitado`;
      continue;
    }
    if (declarado === filtro.todos) return `el filtro «${filtro.prefijo.slice(0, -1)}» no se aplicó`;
    const seleccion = declarado.slice(filtro.prefijo.length).trim();
    const recibidos = seleccion.split(',').map((id) => id.trim());
    const coincide = destino === 'interno'
      ? recibidos.length === ids.length && new Set(recibidos).size === ids.length && ids.every((id) => recibidos.includes(id))
      : seleccion === (Array.isArray(valor) ? `${valor.length} seleccionados` : 'selección aplicada');
    if (!coincide) {
      return `el filtro «${filtro.prefijo.slice(0, -1)}» no corresponde a lo solicitado`;
    }
  }
  return null;
}

export const FILAS_POR_TRAMO = 25;
