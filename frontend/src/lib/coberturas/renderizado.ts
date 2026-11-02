import type {
  CoberturaTemporalVista,
  CondicionVigencia,
} from './modelo';

const etiquetas: Record<
  CondicionVigencia,
  { texto: string; clases: string }
> = {
  vigente: {
    texto: 'Vigente',
    clases:
      'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  futura: {
    texto: 'Futura',
    clases:
      'bg-blue-50 text-blue-800 ring-blue-200',
  },
  vencida: {
    texto: 'Vencida',
    clases:
      'bg-amber-50 text-amber-800 ring-amber-200',
  },
  revocada: {
    texto: 'Revocada',
    clases:
      'bg-rose-50 text-rose-800 ring-rose-200',
  },
};

let registros: CoberturaTemporalVista[] = [];
let inicializado = false;

function buscar<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function crearElemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  clases: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  elemento.className = clases;

  if (texto !== undefined) {
    elemento.textContent = texto;
  }

  return elemento;
}

function formatearFecha(valor: string): string {
  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeZone: 'America/Santiago',
  }).format(fecha);
}

function crearCampo(
  etiqueta: string,
  valor: string,
): HTMLElement {
  const contenedor = crearElemento(
    'div',
    'min-w-0 space-y-1',
  );

  contenedor.append(
    crearElemento(
      'p',
      'text-xs font-semibold uppercase tracking-wide text-neutral-500',
      etiqueta,
    ),
    crearElemento(
      'p',
      'break-words text-sm text-neutral-800',
      valor || 'No disponible',
    ),
  );

  return contenedor;
}

function crearBotonAccion(
  cobertura: CoberturaTemporalVista,
  accion: 'extender' | 'revocar',
): HTMLButtonElement {
  const extender = accion === 'extender';

  const boton = crearElemento(
    'button',
    extender
      ? 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#4C4688] bg-white px-4 py-2 text-sm font-semibold text-[#4C4688] hover:bg-[#F0EEF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C4688]'
      : 'inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500',
    extender ? 'Extender término' : 'Revocar',
  );

  boton.type = 'button';
  boton.dataset.coberturaAccion = accion;
  boton.dataset.coberturaId = cobertura.id_permiso_temporal;
  boton.dataset.coberturaVersion = String(cobertura.version);
  boton.dataset.coberturaFin = cobertura.fin_at;
  boton.dataset.coordinadorNombre = cobertura.coordinador_nombre;

  return boton;
}

function crearBotonHistorial(cobertura: CoberturaTemporalVista): HTMLButtonElement {
  const boton = crearElemento(
    'button',
    'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#DCD8E8] bg-white px-4 py-2 text-sm font-semibold text-[#4C4688] hover:bg-[#F0EEF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C4688]',
    'Ver historial',
  );
  boton.type = 'button';
  boton.dataset.coberturaAccion = 'historial';
  boton.dataset.coberturaId = cobertura.id_permiso_temporal;
  boton.dataset.coordinadorNombre = cobertura.coordinador_nombre;
  boton.dataset.paisNombre = cobertura.pais_nombre;
  return boton;
}

function crearTarjeta(
  cobertura: CoberturaTemporalVista,
): HTMLLIElement {
  const item = crearElemento(
    'li',
    'min-w-0',
  );

  const tarjeta = crearElemento(
    'article',
    'flex h-full flex-col gap-5 rounded-2xl border border-[#E9E6F0] bg-white p-5 shadow-sm md:p-6',
  );

  const encabezado = crearElemento(
    'header',
    'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
  );

  const identificacion = crearElemento(
    'div',
    'min-w-0',
  );

  identificacion.append(
    crearElemento(
      'p',
      'text-xs font-semibold uppercase tracking-wide text-[#4C4688]',
      'Coordinador autorizado',
    ),
    crearElemento(
      'h3',
      'mt-1 break-words text-lg font-bold text-neutral-900',
      cobertura.coordinador_nombre,
    ),
    crearElemento(
      'p',
      'mt-1 text-sm text-neutral-500',
      `País autorizado: ${cobertura.pais_nombre}`,
    ),
  );

  const estado = etiquetas[cobertura.condicion];

  const insignia = crearElemento(
    'span',
    `inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${estado.clases}`,
    estado.texto,
  );

  encabezado.append(identificacion, insignia);

  const detalles = crearElemento(
    'div',
    'grid grid-cols-1 gap-4 border-t border-[#EEEAF5] pt-4 sm:grid-cols-2',
  );

  detalles.append(
    crearCampo('Motivo', cobertura.motivo),
    crearCampo(
      'Periodo autorizado',
      `${formatearFecha(cobertura.inicio_at)} – ${formatearFecha(cobertura.fin_at)}`,
    ),
  );

  if (cobertura.revocado_at) {
    detalles.append(
      crearCampo(
        'Fecha de revocación',
        formatearFecha(cobertura.revocado_at),
      ),
    );
  }

  const acciones = crearElemento(
    'footer',
    'mt-auto flex flex-wrap gap-2 border-t border-[#EEEAF5] pt-4',
  );

  acciones.append(crearBotonHistorial(cobertura));

  if (cobertura.puedeExtender) {
    acciones.append(crearBotonAccion(cobertura, 'extender'));
  }

  if (cobertura.puedeRevocar) {
    acciones.append(crearBotonAccion(cobertura, 'revocar'));
  }

  tarjeta.append(encabezado, detalles);

  if (acciones.childElementCount > 0) {
    tarjeta.append(acciones);
  }

  item.append(tarjeta);

  return item;
}

function actualizarMetricas(
  coberturas: CoberturaTemporalVista[],
): void {
  const metricas: Record<string, number> = {
    total: coberturas.length,
    vigentes: coberturas.filter(
      (cobertura) => cobertura.condicion === 'vigente',
    ).length,
    'futuras-vencidas': coberturas.filter(
      (cobertura) =>
        cobertura.condicion === 'futura' ||
        cobertura.condicion === 'vencida',
    ).length,
  };

  for (const [nombre, valor] of Object.entries(metricas)) {
    const elemento = buscar<HTMLElement>(
      `[data-cobertura-metrica="${nombre}"]`,
    );

    if (elemento) {
      elemento.textContent = new Intl.NumberFormat('es-CL').format(valor);
    }
  }
}

function configurarFiltros(): void {
  if (inicializado) return;

  const busqueda = buscar<HTMLInputElement>('#coberturas-buscar');
  const filtro = buscar<HTMLSelectElement>(
    '#coberturas-filtro-estado',
  );

  if (!busqueda || !filtro) return;

  busqueda.addEventListener('input', mostrarResultados);
  filtro.addEventListener('change', mostrarResultados);

  inicializado = true;
}

function mostrarResultados(): void {
  const lista = buscar<HTMLUListElement>('#coberturas-lista');
  const sinRegistros = buscar<HTMLElement>(
    '#coberturas-sin-registros',
  );
  const sinResultados = buscar<HTMLElement>(
    '#coberturas-sin-resultados',
  );
  const estado = buscar<HTMLElement>('#coberturas-estado');
  const busqueda = buscar<HTMLInputElement>('#coberturas-buscar');
  const filtro = buscar<HTMLSelectElement>(
    '#coberturas-filtro-estado',
  );

  if (
    !lista ||
    !sinRegistros ||
    !sinResultados ||
    !estado ||
    !busqueda ||
    !filtro
  ) {
    return;
  }

  lista.replaceChildren();
  sinRegistros.hidden = true;
  sinResultados.hidden = true;
  lista.hidden = true;

  if (registros.length === 0) {
    sinRegistros.hidden = false;
    estado.textContent = 'No hay coberturas registradas.';
    return;
  }

  const termino = busqueda.value.trim().toLocaleLowerCase('es-CL');
  const condicion = filtro.value;

  const filtrados = registros.filter((cobertura) => {
    const coincideBusqueda = [
      cobertura.coordinador_nombre,
      cobertura.pais_nombre,
      cobertura.motivo,
    ].some((valor) =>
      valor.toLocaleLowerCase('es-CL').includes(termino),
    );

    const coincideCondicion =
      !condicion || cobertura.condicion === condicion;

    return coincideBusqueda && coincideCondicion;
  });

  if (filtrados.length === 0) {
    sinResultados.hidden = false;
    estado.textContent =
      'No hay coberturas que coincidan con los filtros seleccionados.';
    return;
  }

  lista.append(...filtrados.map(crearTarjeta));
  lista.hidden = false;
  lista.setAttribute('aria-busy', 'false');

  estado.textContent =
    `${new Intl.NumberFormat('es-CL').format(filtrados.length)} coberturas encontradas.`;
}

export function mostrarCargandoCoberturas(): void {
  const carga = buscar<HTMLElement>('#coberturas-carga');
  const lista = buscar<HTMLElement>('#coberturas-lista');
  const error = buscar<HTMLElement>('#coberturas-error');
  const vacio = buscar<HTMLElement>('#coberturas-vacio');
  const sinRegistros = buscar<HTMLElement>(
    '#coberturas-sin-registros',
  );
  const sinResultados = buscar<HTMLElement>(
    '#coberturas-sin-resultados',
  );
  const estado = buscar<HTMLElement>('#coberturas-estado');

  if (carga) carga.hidden = false;
  if (lista) lista.hidden = true;
  if (error) error.hidden = true;
  if (vacio) vacio.hidden = true;
  if (sinRegistros) sinRegistros.hidden = true;
  if (sinResultados) sinResultados.hidden = true;
  if (estado) estado.textContent = 'Cargando coberturas…';
}

export function mostrarErrorCoberturas(mensaje: string): void {
  const carga = buscar<HTMLElement>('#coberturas-carga');
  const error = buscar<HTMLElement>('#coberturas-error');
  const texto = buscar<HTMLElement>('#coberturas-error-texto');
  const lista = buscar<HTMLElement>('#coberturas-lista');

  if (carga) carga.hidden = true;
  if (lista) lista.hidden = true;
  if (texto) texto.textContent = mensaje;
  if (error) error.hidden = false;
}

export function mostrarConfirmacionCobertura(mensaje: string): void {
  const confirmacion = buscar<HTMLElement>(
    '#coberturas-confirmacion',
  );

  if (!confirmacion) return;

  confirmacion.textContent = mensaje;
  confirmacion.hidden = false;
  confirmacion.focus();
}

export function renderizarListadoCoberturas(
  coberturas: CoberturaTemporalVista[],
): void {
  const carga = buscar<HTMLElement>('#coberturas-carga');
  const error = buscar<HTMLElement>('#coberturas-error');
  const pendiente = buscar<HTMLElement>('#coberturas-vacio');
  const busqueda = buscar<HTMLInputElement>('#coberturas-buscar');
  const filtro = buscar<HTMLSelectElement>(
    '#coberturas-filtro-estado',
  );

  if (carga) carga.hidden = true;
  if (error) error.hidden = true;
  if (pendiente) pendiente.hidden = true;

  if (busqueda) busqueda.disabled = false;
  if (filtro) filtro.disabled = false;

  registros = [...coberturas];

  actualizarMetricas(registros);
  configurarFiltros();
  mostrarResultados();
}
