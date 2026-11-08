import { etiquetasDestino, type DestinoReporte } from './configuracion.ts';
import type { ReportPreview } from './pdf.ts';
import { FILAS_POR_TRAMO, seccionesDeVista, type SeccionVista } from './vista-previa.ts';

export interface ContextoVistaPrevia {
  // Criterios elegidos por el usuario, con los nombres de los catálogos.
  criterios: [string, string][];
}

const acentos = ['acento-morado', 'acento-verde', 'acento-amarillo'];

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase = '', texto?: string): HTMLElementTagNameMap[K] {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function formatearFecha(valor: string) {
  const partes = valor.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}

const contarRegistros = (total: number) => `${total} ${total === 1 ? 'registro' : 'registros'}`;

function pintarEncabezado(vista: ReportPreview, contexto: ContextoVistaPrevia) {
  const documento = vista.document;
  const tarjeta = crear('header', 'rep-vp-encabezado rounded-2xl border border-[#E8E5EF] tarjeta-acento acento-morado bg-white p-4 shadow-[0_2px_10px_rgba(47,39,83,0.06)] md:p-5');
  const fila = crear('div', 'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between');
  const textos = crear('div', 'min-w-0');
  textos.append(
    crear('p', 'text-sm font-medium text-primary', 'Vista previa del reporte'),
    crear('h3', 'mt-1 text-xl font-bold text-neutral-900', documento.title),
  );
  const generado = new Date(documento.generatedAt);
  if (!Number.isNaN(generado.getTime())) {
    textos.append(crear('p', 'mt-1 text-sm text-neutral-500', `Generada el ${generado.toLocaleString('es-CL')}`));
  }
  const destino = etiquetasDestino[documento.destination as DestinoReporte] ?? documento.destination;
  fila.append(textos, crear('span', 'inline-flex shrink-0 self-start rounded-full bg-[#F0EDF8] px-3 py-1 text-xs font-semibold text-[#4C4688]', destino));
  tarjeta.append(fila);

  const datos = crear('dl', 'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3');
  const periodo = crear('div', 'rep-param');
  periodo.dataset.vpPeriodo = '';
  periodo.append(crear('dt', '', 'Período'), crear('dd', '', `${formatearFecha(documento.period.start)} al ${formatearFecha(documento.period.end)}`));
  datos.append(periodo);
  for (const [titulo, valor] of contexto.criterios) {
    if (titulo === 'Período' || titulo === 'Destino') continue;
    const caja = crear('div', 'rep-param');
    caja.dataset.vpCriterio = '';
    caja.append(crear('dt', '', titulo), crear('dd', '', valor));
    datos.append(caja);
  }
  if (!contexto.criterios.some(([titulo]) => !['Período', 'Destino'].includes(titulo))) {
    const caja = crear('div', 'rep-param');
    caja.dataset.vpCriterio = '';
    caja.append(crear('dt', '', 'Filtros'), crear('dd', '', 'Sin filtros: todos los datos visibles para tu sesión'));
    datos.append(caja);
  }
  tarjeta.append(datos);
  if (documento.destination !== 'interno') {
    tarjeta.append(crear('p', 'mt-4 rounded-lg bg-[#F0EEF9] px-3 py-2 text-sm text-[#423C76]', 'Reporte para destinatarios externos: contiene solo información agregada.'));
  }
  return tarjeta;
}

function pintarResumen(vista: ReportPreview) {
  const lista = crear('dl', 'rep-vp-resumen grid grid-cols-1 gap-3 sm:grid-cols-3');
  vista.document.summary.forEach((item, indice) => {
    const caja = crear('div', `rounded-2xl border border-[#E8E5EF] tarjeta-acento ${acentos[indice % acentos.length]} bg-white p-4`);
    caja.append(
      crear('dt', 'text-xs font-semibold uppercase tracking-wide text-neutral-500', item.label),
      crear('dd', 'mt-1 text-2xl font-bold text-neutral-900', item.value),
    );
    lista.append(caja);
  });
  return lista;
}

function pintarIndice(secciones: SeccionVista[]) {
  const nav = crear('nav', 'rep-vp-indice');
  nav.setAttribute('aria-label', 'Secciones del reporte');
  const lista = crear('ul', 'flex flex-wrap gap-2');
  for (const item of secciones) {
    const li = crear('li');
    const enlace = crear('a', 'rep-vp-indice-enlace', item.titulo);
    enlace.href = `#rep-seccion-${item.key}`;
    const total = item.informada ? item.seccion.rows.length : null;
    enlace.append(crear('span', 'rep-vp-contador', total === null ? 'no informada' : String(total)));
    li.append(enlace);
    lista.append(li);
  }
  nav.append(lista);
  return nav;
}

function pintarTabla(seccion: NonNullable<Extract<SeccionVista, { informada: true }>['seccion']>, cuerpoSeccion: HTMLElement) {
  const tabla = crear('table', 'rep-vp-tabla');
  const thead = crear('thead');
  const filaTitulos = crear('tr');
  for (const columna of seccion.columns) {
    const th = crear('th', '', columna);
    th.scope = 'col';
    filaTitulos.append(th);
  }
  thead.append(filaTitulos);
  const tbody = crear('tbody');
  tabla.append(thead, tbody);
  cuerpoSeccion.append(tabla);

  let mostradas = 0;
  const boton = crear('button', 'rep-vp-mas') as HTMLButtonElement;
  boton.type = 'button';

  function mostrarTramo() {
    const hasta = Math.min(seccion.rows.length, mostradas + FILAS_POR_TRAMO);
    for (const fila of seccion.rows.slice(mostradas, hasta)) {
      const tr = crear('tr');
      fila.forEach((celda, indice) => {
        const td = crear('td', '', celda);
        td.dataset.etiqueta = seccion.columns[indice] ?? '';
        tr.append(td);
      });
      tbody.append(tr);
    }
    mostradas = hasta;
    const restantes = seccion.rows.length - mostradas;
    boton.hidden = restantes === 0;
    boton.textContent = `Mostrar ${Math.min(FILAS_POR_TRAMO, restantes)} más (quedan ${restantes})`;
  }

  boton.addEventListener('click', mostrarTramo);
  mostrarTramo();
  cuerpoSeccion.append(boton);
}

function pintarSeccion(item: SeccionVista, indice: number) {
  const articulo = crear('section', `rep-vp-seccion rounded-2xl border border-[#E8E5EF] tarjeta-acento ${acentos[indice % acentos.length]} bg-white shadow-[0_2px_10px_rgba(47,39,83,0.06)]`);
  articulo.id = `rep-seccion-${item.key}`;
  articulo.dataset.seccion = item.key;
  articulo.setAttribute('aria-labelledby', `rep-seccion-${item.key}-titulo`);

  const cabecera = crear('div', 'flex flex-wrap items-center justify-between gap-3 border-b border-[#EEEAF5] px-4 py-3 md:px-5');
  const titulo = crear('h4', 'min-w-0 text-base font-semibold text-neutral-900', item.titulo);
  titulo.id = `rep-seccion-${item.key}-titulo`;
  const acciones = crear('div', 'flex items-center gap-2');
  const total = item.informada ? item.seccion.rows.length : null;
  acciones.append(crear('span', 'rep-vp-contador', total === null ? 'No informada' : contarRegistros(total)));
  const cuerpo = crear('div', 'rep-vp-cuerpo px-4 py-4 md:px-5');
  cuerpo.id = `rep-seccion-${item.key}-cuerpo`;
  const plegar = crear('button', 'rep-vp-plegar', 'Ocultar') as HTMLButtonElement;
  plegar.type = 'button';
  plegar.setAttribute('aria-expanded', 'true');
  plegar.setAttribute('aria-controls', cuerpo.id);
  plegar.setAttribute('aria-label', `Ocultar ${item.titulo}`);
  plegar.addEventListener('click', () => {
    const abierta = plegar.getAttribute('aria-expanded') === 'true';
    cuerpo.hidden = abierta;
    plegar.setAttribute('aria-expanded', String(!abierta));
    plegar.textContent = abierta ? 'Mostrar' : 'Ocultar';
    plegar.setAttribute('aria-label', `${abierta ? 'Mostrar' : 'Ocultar'} ${item.titulo}`);
  });
  acciones.append(plegar);
  cabecera.append(titulo, acciones);
  articulo.append(cabecera, cuerpo);

  if (!item.informada) {
    cuerpo.append(crear('p', 'rep-vp-vacio', 'El servicio no informó esta sección para la consulta realizada.'));
    return articulo;
  }
  if (item.seccion.note) cuerpo.append(crear('p', 'mb-3 text-xs text-neutral-500', item.seccion.note));
  if (item.seccion.rows.length === 0) {
    cuerpo.append(crear('p', 'rep-vp-vacio', 'Esta sección no tiene registros para el período y los filtros seleccionados.'));
  } else {
    pintarTabla(item.seccion, cuerpo);
  }
  return articulo;
}

// Presenta la respuesta del servicio tal como llegó: no recalcula ni formatea valores de negocio.
export function renderizarVistaPrevia(contenedor: HTMLElement, vista: ReportPreview, contexto: ContextoVistaPrevia) {
  const secciones = seccionesDeVista(vista);
  contenedor.replaceChildren(
    pintarEncabezado(vista, contexto),
    pintarResumen(vista),
    pintarIndice(secciones),
    ...secciones.map(pintarSeccion),
  );
}
