import { crearClienteCatalogo } from './cliente.ts';
import { agregarProducto } from '../cotizacion/seleccion.ts';
import { caracteristicasPublicas, filtrarCatalogo, imagenPredeterminada, urlImagen, type ItemPublico } from './modelo.ts';

export async function iniciarCatalogo() {
  const raiz = document.querySelector<HTMLElement>('#catalogo-publico');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#catalogo-${id}`)!;
  const pais = q<HTMLSelectElement>('pais');
  const organizacion = q<HTMLSelectElement>('organizacion');
  const dialogo = q<HTMLDialogElement>('detalle');
  const cliente = crearClienteCatalogo(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000');
  let items: ItemPublico[] = [];
  let cargando = false;
  let origen: HTMLButtonElement | null = null;
  function texto(tag: string, contenido: string, clase = '') {
    const nodo = document.createElement(tag); nodo.textContent = contenido; nodo.className = clase; return nodo;
  }
  function imagen(item: ItemPublico, url?: string | null) {
    const img = document.createElement('img');
    img.src = urlImagen(url); img.alt = img.src.endsWith(imagenPredeterminada) ? `Fotografía no disponible: ${item.nombre}` : item.nombre;
    img.width = 640; img.height = 420; img.loading = 'lazy';
    img.className = 'aspect-[3/2] w-full rounded-xl bg-[#F0EEF8] object-cover';
    img.addEventListener('error', () => { img.src = imagenPredeterminada; img.alt = `Fotografía no disponible: ${item.nombre}`; }, { once: true });
    return img;
  }
  function datos(item: ItemPublico) {
    const dl = document.createElement('dl'); dl.className = 'grid gap-3 text-sm';
    const pares: [string, string][] = [
      ['Organización', item.organizacion?.nombre || 'No informada'],
      ['País', item.organizacion?.pais?.nombre || 'No informado'],
      ...caracteristicasPublicas(item),
    ];
    for (const [etiqueta, valor] of pares) {
      const grupo = document.createElement('div');
      grupo.append(texto('dt', etiqueta, 'text-neutral-600'), texto('dd', valor, 'font-medium break-words'));
      dl.append(grupo);
    }
    return dl;
  }
  function abrir(item: ItemPublico, boton: HTMLButtonElement) {
    origen = boton; q('detalle-titulo').textContent = item.nombre;
    const contenido = q('detalle-contenido'); contenido.replaceChildren();
    const fotos = item.imagenes?.length ? item.imagenes : [{ url: null }];
    const galeria = document.createElement('div'); galeria.className = 'grid gap-3 sm:grid-cols-2';
    for (const foto of fotos) galeria.append(imagen(item, foto.url));
    contenido.append(galeria, texto('p', item.descripcion, 'whitespace-pre-wrap break-words leading-relaxed'), datos(item), texto('p', `Unidad de medida: ${item.unidad_medida}`, 'text-sm text-neutral-600'));
    dialogo.showModal(); q('cerrar').focus();
  }
  function opciones(select: HTMLSelectElement, valores: Map<string, string>, inicial: string) {
    select.replaceChildren(new Option(inicial, ''));
    for (const [id, nombre] of [...valores].sort((a,b) => a[1].localeCompare(b[1], 'es'))) select.add(new Option(nombre, id));
  }
  function pintar() {
    const visibles = filtrarCatalogo(items, pais.value, organizacion.value);
    q('lista').replaceChildren();
    q('estado').textContent = visibles.length ? `${visibles.length} opciones para explorar.` : items.length ? 'No hay productos que coincidan con los filtros seleccionados.' : 'Todavía no hay productos publicados en el catálogo.';
    q('criterios').textContent = [pais.value && `País: ${pais.selectedOptions[0].textContent}`, organizacion.value && `Organización: ${organizacion.selectedOptions[0].textContent}`].filter(Boolean).join(' · ') || 'Mostrando todos los productos publicados';
    for (const item of visibles) {
      const tarjeta = document.createElement('article'); tarjeta.className = 'flex min-w-0 flex-col gap-4 rounded-2xl border border-[#DCD8EA] bg-white p-4 shadow-sm';
      tarjeta.append(imagen(item, item.imagenes?.[0]?.url), texto('span', item.tipo_item === 'servicio' ? 'Servicio' : 'Producto', 'text-xs font-semibold uppercase tracking-wide text-primary'), texto('h3', item.nombre, 'text-xl font-bold break-words'), texto('p', item.descripcion, 'line-clamp-3 break-words text-sm leading-relaxed text-neutral-600'), datos(item));
      const boton = document.createElement('button'); boton.type = 'button'; boton.textContent = 'Ver detalle'; boton.setAttribute('aria-label', `Ver detalle de ${item.nombre}`);
      boton.className = 'mt-auto min-h-12 rounded-xl border border-primary px-4 py-3 font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary';
      boton.addEventListener('click', () => abrir(item, boton)); tarjeta.append(boton);
      const agregar = document.createElement('button'); agregar.type = 'button'; agregar.textContent = 'Agregar a cotización';
      agregar.className = 'min-h-12 rounded-xl bg-primary px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-primary';
      agregar.addEventListener('click', () => {
        try {
          const total = agregarProducto(item.id_producto);
          q('seleccion').textContent = `${item.nombre} está en tu selección. ${total} productos seleccionados. Puedes revisar las cantidades en Solicitar cotización.`;
        } catch { q('seleccion').textContent = 'No se pudo guardar la selección en esta pestaña. Revisa el almacenamiento del navegador o restablece la selección en Solicitar cotización.'; }
      });
      tarjeta.append(agregar); q('lista').append(tarjeta);
    }
  }
  async function cargar() {
    if (cargando) return;
    cargando = true; q('error').hidden = true; q('lista').replaceChildren(); q('lista').setAttribute('aria-busy','true');
    q('estado').textContent = 'Cargando catálogo…'; pais.disabled = true; organizacion.disabled = true;
    q<HTMLButtonElement>('limpiar').disabled = true; q<HTMLButtonElement>('reintentar').disabled = true;
    try {
      items = await cliente.listar();
      const paises = new Map<string,string>(); const organizaciones = new Map<string,string>();
      for (const item of items) {
        if (item.organizacion) organizaciones.set(item.organizacion.id_organizacion, item.organizacion.nombre);
        if (item.organizacion?.pais) paises.set(item.organizacion.pais.id_pais, item.organizacion.pais.nombre);
      }
      opciones(pais, paises, 'Todos los países'); opciones(organizacion, organizaciones, 'Todas las organizaciones');
      pais.disabled = paises.size === 0; organizacion.disabled = organizaciones.size === 0;
      q<HTMLButtonElement>('limpiar').disabled = false; pintar();
    } catch { q('estado').textContent = ''; q('error').hidden = false; }
    finally { cargando = false; q('lista').setAttribute('aria-busy','false'); q<HTMLButtonElement>('reintentar').disabled = false; }
  }
  q<HTMLFormElement>('filtros').addEventListener('submit', e => e.preventDefault());
  pais.addEventListener('change', pintar); organizacion.addEventListener('change', pintar);
  q('limpiar').addEventListener('click', () => { pais.value = ''; organizacion.value = ''; pintar(); });
  q('reintentar').addEventListener('click', () => void cargar());
  q('cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => origen?.focus());
  await cargar();
}
