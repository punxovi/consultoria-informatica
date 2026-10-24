import type { ReportFilters } from './pdf.ts';

// Estructura de parámetros del reporte, alineada con GET /api/v1/reports/consolidated (docs/REPORTES-PDF.md).
export const MAX_SELECCION = 100;

export const DESTINOS = ['interno', 'donante', 'externo'] as const;
export type DestinoReporte = (typeof DESTINOS)[number];

export const etiquetasDestino: Record<DestinoReporte, string> = {
  interno: 'Uso interno',
  donante: 'Donantes',
  externo: 'Organismos externos',
};

export interface ConfiguracionReporte {
  fecha_inicio: string;
  fecha_termino: string;
  id_pais: string;
  id_organizacion: string;
  id_programa: string;
  indicadores: string[];
  resultados: string[];
  destino: DestinoReporte;
}

export type CampoConfiguracion = keyof ConfiguracionReporte;
export type ErroresConfiguracion = Partial<Record<CampoConfiguracion, string>>;

export type ResultadoValidacion =
  | { ok: true; parametros: ReportFilters }
  | { ok: false; errores: ErroresConfiguracion };

export function configuracionInicial(): ConfiguracionReporte {
  return {
    fecha_inicio: '',
    fecha_termino: '',
    id_pais: '',
    id_organizacion: '',
    id_programa: '',
    indicadores: [],
    resultados: [],
    destino: 'interno',
  };
}

// Restablecer filtros conserva el período: las fechas no son filtros.
export function restablecerFiltros(actual: ConfiguracionReporte): ConfiguracionReporte {
  return {
    ...configuracionInicial(),
    fecha_inicio: actual.fecha_inicio,
    fecha_termino: actual.fecha_termino,
  };
}

const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esFechaCalendario(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number(valor.slice(0, 4)) < 1) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function validarFecha(valor: string, nombre: string): string | undefined {
  if (!valor.trim()) return `Ingresa la fecha de ${nombre}.`;
  if (!esFechaCalendario(valor.trim())) return `La fecha de ${nombre} no es una fecha válida.`;
  return undefined;
}

function validarLista(valores: string[], nombre: string): string | undefined {
  if (valores.length > MAX_SELECCION) return `Puedes seleccionar hasta ${MAX_SELECCION} ${nombre}.`;
  if (valores.some((valor) => !uuidValido.test(valor))) return `Hay ${nombre} con un identificador no válido.`;
  return undefined;
}

export function validarConfiguracion(config: ConfiguracionReporte): ResultadoValidacion {
  const errores: ErroresConfiguracion = {};
  const inicio = config.fecha_inicio.trim();
  const termino = config.fecha_termino.trim();

  const errorInicio = validarFecha(inicio, 'inicio');
  const errorTermino = validarFecha(termino, 'término');
  if (errorInicio) errores.fecha_inicio = errorInicio;
  if (errorTermino) errores.fecha_termino = errorTermino;
  if (!errorInicio && !errorTermino && inicio > termino) {
    errores.fecha_inicio = 'La fecha de inicio no puede ser posterior a la fecha de término.';
    errores.fecha_termino = 'La fecha de término no puede ser anterior a la fecha de inicio.';
  }

  for (const campo of ['id_pais', 'id_organizacion', 'id_programa'] as const) {
    if (config[campo] && !uuidValido.test(config[campo])) errores[campo] = 'La opción seleccionada no es válida.';
  }
  const errorIndicadores = validarLista(config.indicadores, 'indicadores');
  if (errorIndicadores) errores.indicadores = errorIndicadores;
  const errorResultados = validarLista(config.resultados, 'resultados');
  if (errorResultados) errores.resultados = errorResultados;
  if (!DESTINOS.includes(config.destino)) errores.destino = 'Selecciona un destino válido.';

  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const parametros: ReportFilters = { fecha_inicio: inicio, fecha_termino: termino, destino: config.destino };
  if (config.id_pais) parametros.id_pais = config.id_pais;
  if (config.id_organizacion) parametros.id_organizacion = config.id_organizacion;
  if (config.id_programa) parametros.id_programa = config.id_programa;
  if (config.indicadores.length > 0) parametros.indicadores = [...new Set(config.indicadores)];
  if (config.resultados.length > 0) parametros.resultados = [...new Set(config.resultados)];
  return { ok: true, parametros };
}

export interface FiltroSeleccionado {
  campo: 'id_pais' | 'id_organizacion' | 'id_programa' | 'indicadores' | 'resultados';
  valor: string;
  etiqueta: string;
}

export type NombresCatalogo = Record<FiltroSeleccionado['campo'], Map<string, string>>;

// Filtros activos para mostrarlos como etiquetas; sin nombre conocido se informa con una etiqueta genérica.
export function filtrosSeleccionados(config: ConfiguracionReporte, nombres: NombresCatalogo): FiltroSeleccionado[] {
  const lista: FiltroSeleccionado[] = [];
  const titulos = {
    id_pais: 'País',
    id_organizacion: 'Organización',
    id_programa: 'Programa',
    indicadores: 'Indicador',
    resultados: 'Resultado',
  } as const;
  for (const campo of ['id_pais', 'id_organizacion', 'id_programa'] as const) {
    const valor = config[campo];
    if (valor) lista.push({ campo, valor, etiqueta: `${titulos[campo]}: ${nombres[campo].get(valor) ?? 'Selección'}` });
  }
  for (const campo of ['indicadores', 'resultados'] as const) {
    for (const valor of config[campo]) {
      lista.push({ campo, valor, etiqueta: `${titulos[campo]}: ${nombres[campo].get(valor) ?? 'Selección'}` });
    }
  }
  return lista;
}

export function quitarFiltro(config: ConfiguracionReporte, filtro: Pick<FiltroSeleccionado, 'campo' | 'valor'>): ConfiguracionReporte {
  if (filtro.campo === 'indicadores' || filtro.campo === 'resultados') {
    return { ...config, [filtro.campo]: config[filtro.campo].filter((valor) => valor !== filtro.valor) };
  }
  return { ...config, [filtro.campo]: '' };
}
