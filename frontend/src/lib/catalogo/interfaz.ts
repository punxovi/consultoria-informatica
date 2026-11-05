import { crearClienteCatalogo } from './cliente.ts';
import { agregarProducto, cambiarCantidad, leerSeleccion, quitarProducto, EVENTO_SELECCION } from '../cotizacion/seleccion.ts';
import type { Seleccion } from '../cotizacion/modelo.ts';
import { ApiError } from '../api/transporte.ts';
import { caracteristicasPublicas, filtrarCatalogo, fuenteImagen, imagenPredeterminada, urlImagen, type ItemPublico } from './modelo.ts';

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 10 });
const claseChip = (activo: boolean) => `min-h-11 rounded-full border px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${
  activo ? 'border-[#4C4688] bg-[#4C4688] text-white' : 'border-[#DCD8EA] bg-white text-neutral-700 hover:border-[#4C4688] hover:text-[#4C4688]'}`;

export async function iniciarCatalogo() {
  const raiz = document.querySelector<HTMLElement>('#catalogo-publico');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#catalogo-${id}`)!;
  const paises = q('paises');
  const organizacion = q<HTMLSelectElement>('organizacion');
  const dialogo = q<HTMLDialogElement>('detalle');
  const apiBase = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
  const cliente = crearClienteCatalogo(apiBase);
  let items: ItemPublico[] = [];
  let pais = '';
  let cargando = false;
  let origen: HTMLButtonElement | null = null;
  let avisoTimer: number | undefined;
  const acciones = new Map<string, { contenedor: HTMLElement; item: ItemPublico; tarjeta: HTMLElement }>();

  function texto(tag: string, contenido: string, clase = '') {
    const nodo = document.createElement(tag); nodo.textContent = contenido; nodo.className = clase; return nodo;
  }
  function seleccionActual(): Seleccion {
    try { return leerSeleccion(); } catch { return []; }
  }
  function avisar(mensaje: string) {
    const aviso = q('seleccion'); aviso.textContent = mensaje; aviso.toggleAttribute('data-visible', true);
    window.clearTimeout(avisoTimer);
    avisoTimer = window.setTimeout(() => aviso.toggleAttribute('data-visible', false), 3500);
  }
  function imagen(item: ItemPublico, url?: string | null) {
    // Marco neutro con la imagen contenida y centrada: los logos y fotos no se recortan.
    const marco = document.createElement('div');
    marco.className = 'flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#F4F2FB] to-[#E9F6F8]';
    const img = document.createElement('img');
    img.src = urlImagen(url); img.alt = img.src.endsWith(imagenPredeterminada) ? `Fotografía no disponible: ${item.nombre}` : item.nombre;
    img.width = 640; img.height = 480; img.loading = 'lazy';
    img.className = 'h-full w-full object-contain object-center p-3';
    img.addEventListener('error', () => { img.src = imagenPredeterminada; img.alt = `Fotografía no disponible: ${item.nombre}`; }, { once: true });
    marco.append(img);
    return marco;
  }
  function datos(item: ItemPublico) {
    const dl = document.createElement('dl'); dl.className = 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm';
    const pares: [string, string][] = [
      ['Organización', item.organizacion?.nombre || 'No informada'],
      ['País', item.organizacion?.pais?.nombre || 'No informado'],
      ...caracteristicasPublicas(item),
    ];
    for (const [etiqueta, valor] of pares) {
      const grupo = document.createElement('div'); grupo.className = 'min-w-0';
      grupo.append(texto('dt', etiqueta, 'text-xs text-neutral-500'), texto('dd', valor, 'break-words font-medium text-neutral-800'));
      dl.append(grupo);
    }
    return dl;
  }
  function botonCantidad(simbolo: string, etiqueta: string) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = simbolo; b.setAttribute('aria-label', etiqueta);
    b.className = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#DCD8EA] bg-white text-lg font-bold text-primary transition hover:bg-[#F0EEF8] focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40';
    return b;
  }
  // Acciones de una tarjeta: agregar, o ajustar la cantidad si ya está en la solicitud.
  function pintarAcciones(contenedor: HTMLElement, item: ItemPublico, seleccion: Seleccion, enfocar = false) {
    const elegido = seleccion.find(i => i.id_producto === item.id_producto);
    contenedor.replaceChildren();
    if (!elegido) {
      const agregar = document.createElement('button'); agregar.type = 'button'; agregar.textContent = 'Agregar a cotización';
      agregar.className = 'min-h-12 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-[#423C76] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
      agregar.addEventListener('click', () => {
        try {
          const total = agregarProducto(item.id_producto);
          avisar(`${item.nombre} se agregó a tu solicitud. ${total} ${total === 1 ? 'producto seleccionado' : 'productos seleccionados'}; revísala en «Mi solicitud».`);
        } catch { avisar('No se pudo guardar la selección en esta pestaña. Vacía la selección en «Mi solicitud» e inténtalo de nuevo.'); }
      });
      contenedor.append(agregar);
      if (enfocar) agregar.focus();
      return;
    }
    const etiqueta = texto('p', 'En tu solicitud', 'mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success');
    etiqueta.prepend(texto('span', '✓', ''));
    const fila = texto('div', '', 'flex items-center gap-2');
    const restar = botonCantidad('−', `Disminuir cantidad de ${item.nombre}`); restar.disabled = !(elegido.cantidad > 1);
    const sumar = botonCantidad('+', `Aumentar cantidad de ${item.nombre}`); sumar.dataset.sumar = '';
    const cantidad = texto('output', `${numero.format(elegido.cantidad)} ${item.unidad_medida}`, 'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-[#F0EEF8] px-2 text-center text-sm font-semibold tabular-nums text-[#423C76]');
    cantidad.setAttribute('aria-live', 'polite'); cantidad.setAttribute('aria-label', `Cantidad estimada de ${item.nombre}`);
    const cambiar = (delta: number) => { try { cambiarCantidad(item.id_producto, delta); } catch { avisar('No se pudo actualizar la cantidad.'); } };
    restar.addEventListener('click', () => cambiar(-1));
    sumar.addEventListener('click', () => cambiar(1));
    fila.append(restar, cantidad, sumar);
    const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Quitar de la solicitud';
    quitar.className = 'mt-2 min-h-10 w-full rounded-xl text-sm font-semibold text-[#AD174F] hover:bg-[#FCE8F0] focus-visible:outline-2 focus-visible:outline-primary';
    quitar.addEventListener('click', () => {
      try { quitarProducto(item.id_producto); avisar(`${item.nombre} se quitó de tu solicitud.`); } catch { avisar('No se pudo actualizar la selección.'); }
    });
    contenedor.append(etiqueta, fila, quitar);
  }
  // Repinta las acciones sin perder el foco del teclado: tras agregar o sumar queda en «+».
  function repintar(contenedor: HTMLElement, item: ItemPublico, seleccion: Seleccion) {
    const teniaFoco = contenedor.contains(document.activeElement);
    pintarAcciones(contenedor, item, seleccion);
    if (!teniaFoco) return;
    (contenedor.querySelector<HTMLButtonElement>('[data-sumar]') ?? contenedor.querySelector<HTMLButtonElement>('button'))?.focus();
  }
  function actualizarSeleccion() {
    const seleccion = seleccionActual();
    for (const { contenedor, item, tarjeta } of acciones.values()) {
      repintar(contenedor, item, seleccion);
      tarjeta.classList.toggle('ring-2', seleccion.some(i => i.id_producto === item.id_producto));
    }
    const accionesDetalle = q('detalle-acciones');
    const itemDetalle = accionesDetalle.dataset.producto ? items.find(i => i.id_producto === accionesDetalle.dataset.producto) : undefined;
    if (itemDetalle && dialogo.open) repintar(accionesDetalle, itemDetalle, seleccion);
  }
  function abrir(item: ItemPublico, boton: HTMLButtonElement) {
    origen = boton; q('detalle-titulo').textContent = item.nombre;
    q('detalle-tipo').textContent = item.tipo_item === 'servicio' ? 'Servicio' : 'Producto';
    q('detalle-descripcion').textContent = item.descripcion || 'Sin descripción registrada.';
    // Galería: imagen principal y miniaturas para cambiarla cuando hay varias fotos.
    const galeria = q('detalle-galeria'); galeria.replaceChildren();
    const fotos = item.imagenes?.length ? item.imagenes : [{ url: null }];
    let principal = imagen(item, fuenteImagen(fotos[0], apiBase));
    galeria.append(principal);
    if (fotos.length > 1) {
      const miniaturas = texto('div', '', 'grid grid-cols-4 gap-2');
      fotos.forEach((foto, indice) => {
        const mini = document.createElement('button'); mini.type = 'button';
        mini.setAttribute('aria-label', `Ver foto ${indice + 1} de ${item.nombre}`);
        mini.className = 'overflow-hidden rounded-xl border border-[#E2DDED] focus-visible:outline-2 focus-visible:outline-primary';
        mini.append(imagen(item, fuenteImagen(foto, apiBase)));
        mini.addEventListener('click', () => { const nueva = imagen(item, fuenteImagen(foto, apiBase)); principal.replaceWith(nueva); principal = nueva; });
        miniaturas.append(mini);
      });
      galeria.append(miniaturas);
    }
    const contenido = q('detalle-contenido'); contenido.replaceChildren();
    const ficha = datos(item);
    const unidad = document.createElement('div'); unidad.className = 'min-w-0';
    unidad.append(texto('dt', 'Unidad de medida', 'text-xs text-neutral-500'), texto('dd', item.unidad_medida || 'No informada', 'break-words font-medium text-neutral-800'));
    ficha.insertBefore(unidad, ficha.children[2] ?? null);
    ficha.className = 'grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-[#F7F5FB] p-4 text-sm';
    contenido.append(ficha);
    const accionesDetalle = q('detalle-acciones'); accionesDetalle.dataset.producto = item.id_producto;
    pintarAcciones(accionesDetalle, item, seleccionActual());
    dialogo.showModal(); q('cerrar').focus();
  }
  function pintarPaises(disponibles: Map<string, string>) {
    paises.replaceChildren();
    const opciones: [string, string][] = [['', 'Todos'], ...[...disponibles].sort((a, b) => a[1].localeCompare(b[1], 'es'))];
    for (const [id, nombre] of opciones) {
      const chip = document.createElement('button'); chip.type = 'button'; chip.textContent = nombre; chip.dataset.pais = id;
      chip.setAttribute('aria-pressed', String(id === pais)); chip.className = claseChip(id === pais);
      chip.disabled = disponibles.size === 0;
      chip.addEventListener('click', () => { if (pais === id) return; pais = id; marcarPaises(); void aplicarFiltros(); });
      paises.append(chip);
    }
  }
  function marcarPaises() {
    paises.querySelectorAll<HTMLButtonElement>('button').forEach(chip => {
      const activo = chip.dataset.pais === pais; chip.setAttribute('aria-pressed', String(activo)); chip.className = claseChip(activo);
    });
  }
  function opciones(select: HTMLSelectElement, valores: Map<string, string>, inicial: string) {
    select.replaceChildren(new Option(inicial, ''));
    for (const [id, nombre] of [...valores].sort((a,b) => a[1].localeCompare(b[1], 'es'))) select.add(new Option(nombre, id));
  }
  function nombrePais() { return paises.querySelector<HTMLButtonElement>(`button[data-pais="${CSS.escape(pais)}"]`)?.textContent ?? ''; }
  function pintar() {
    const visibles = filtrarCatalogo(items, pais, organizacion.value);
    const seleccion = seleccionActual();
    q('lista').replaceChildren(); acciones.clear();
    q('estado').textContent = visibles.length ? `${visibles.length} opciones para explorar.` : items.length ? 'No hay productos que coincidan con los filtros seleccionados.' : 'Todavía no hay productos publicados en el catálogo.';
    q('criterios').textContent = [pais && `País: ${nombrePais()}`, organizacion.value && `Organización: ${organizacion.selectedOptions[0].textContent}`].filter(Boolean).join(' · ') || 'Mostrando todos los productos publicados';
    q<HTMLButtonElement>('limpiar').disabled = !pais && !organizacion.value;
    for (const item of visibles) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'flex min-w-0 flex-col gap-3 rounded-2xl border border-[#E4E0F0] bg-white p-4 shadow-sm ring-[#4C4688]/40 transition hover:shadow-md';
      const cuerpo = texto('div', '', 'flex min-w-0 flex-1 flex-col gap-2');
      cuerpo.append(
        texto('span', item.tipo_item === 'servicio' ? 'Servicio' : 'Producto', 'text-xs font-semibold uppercase tracking-wide text-primary'),
        texto('h3', item.nombre, 'break-words text-lg font-bold leading-snug'),
        texto('p', item.descripcion, 'line-clamp-3 break-words text-sm leading-relaxed text-neutral-600'),
        datos(item),
      );
      const boton = document.createElement('button'); boton.type = 'button'; boton.textContent = 'Ver detalle'; boton.setAttribute('aria-label', `Ver detalle de ${item.nombre}`);
      boton.className = 'min-h-11 rounded-xl border border-primary px-4 py-2 font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary';
      boton.addEventListener('click', () => abrir(item, boton));
      const contenedor = texto('div', '', 'mt-auto');
      pintarAcciones(contenedor, item, seleccion);
      tarjeta.classList.toggle('ring-2', seleccion.some(i => i.id_producto === item.id_producto));
      tarjeta.append(imagen(item, fuenteImagen(item.imagenes?.[0], apiBase)), cuerpo, boton, contenedor);
      acciones.set(item.id_producto, { contenedor, item, tarjeta });
      q('lista').append(tarjeta);
    }
  }
  async function cargar() {
    if (cargando) return;
    cargando = true; q('error').hidden = true; q('lista').replaceChildren(); q('lista').setAttribute('aria-busy','true');
    q('estado').textContent = 'Cargando catálogo…'; organizacion.disabled = true;
    q<HTMLButtonElement>('limpiar').disabled = true; q<HTMLButtonElement>('reintentar').disabled = true;
    try {
      items = await cliente.listar();
      const disponibles = new Map<string,string>(); const organizaciones = new Map<string,string>();
      for (const item of items) {
        if (item.organizacion) organizaciones.set(item.organizacion.id_organizacion, item.organizacion.nombre);
        if (item.organizacion?.pais) disponibles.set(item.organizacion.pais.id_pais, item.organizacion.pais.nombre);
      }
      pais = ''; pintarPaises(disponibles);
      opciones(organizacion, organizaciones, 'Todas las organizaciones');
      organizacion.disabled = organizaciones.size === 0;
      pintar();
    } catch (error) {
      q('estado').textContent = '';
      const detalle = q('error-texto');
      if (detalle) detalle.textContent = error instanceof ApiError
        ? `${error.message} Si usas Supabase local, comprueba que esté iniciado con «supabase start».`
        : 'No fue posible cargar el catálogo. Comprueba que API Gateway, Backend y Supabase estén iniciados.';
      q('error').hidden = false;
    }
    finally { cargando = false; q('lista').setAttribute('aria-busy','false'); q<HTMLButtonElement>('reintentar').disabled = false; }
  }
  q<HTMLFormElement>('filtros').addEventListener('submit', e => e.preventDefault());
  async function aplicarFiltros() {
    if (cargando) return;
    cargando = true; q('error').hidden = true; q('lista').setAttribute('aria-busy', 'true');
    q('estado').textContent = 'Actualizando catálogo…';
    try { items = await cliente.listar(pais, organizacion.value); pintar(); }
    catch (error) {
      q('estado').textContent = '';
      const detalle = q('error-texto');
      if (detalle) detalle.textContent = error instanceof ApiError ? error.message : 'No fue posible conectar con el catálogo.';
      q('error').hidden = false;
    }
    finally { cargando = false; q('lista').setAttribute('aria-busy', 'false'); }
  }
  organizacion.addEventListener('change', () => void aplicarFiltros());
  q('limpiar').addEventListener('click', () => { pais = ''; organizacion.value = ''; marcarPaises(); void aplicarFiltros(); });
  q('reintentar').addEventListener('click', () => void cargar());
  q('cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => { delete q('detalle-acciones').dataset.producto; origen?.focus(); });
  window.addEventListener(EVENTO_SELECCION, actualizarSeleccion);
  actualizarSeleccion();
  await cargar();
}
