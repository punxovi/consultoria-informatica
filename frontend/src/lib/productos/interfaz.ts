import { iconoSvg } from '../ui/iconos.ts';
import { getSupabaseClient, getUserRoles } from '../supabase';
import { ApiError } from '../api/transporte.ts';
import { listarOrganizaciones } from '../organizaciones/cliente.ts';
import type { Organizacion } from '../modelos/organizaciones.ts';
import { crearClienteProductos, mensajeErrorProductos } from './cliente.ts';
import {
  MAXIMO_IMAGENES_POR_CARGA,
  camposFormulario,
  filtrarProductos,
  formularioProductoSchema,
  validarImagenProducto,
  valoresRegistrados,
  type DatosProducto,
  type Producto,
} from './modelo.ts';

type Estado = 'todos' | 'publicados' | 'no_publicados';

function escapar(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function iniciarProductos() {
  const raiz = document.querySelector<HTMLElement>('#productos');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#productos-${id}`)!;

  const cliente = crearClienteProductos(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión ha expirado. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });

  const form = q<HTMLFormElement>('form');
  const lista = q<HTMLUListElement>('lista');
  const dialogo = q<HTMLDialogElement>('dialogo');
  const inputImagenes = q<HTMLInputElement>('imagenes');

  let productos: Producto[] = [];
  let organizaciones: Organizacion[] = [];
  let editando: Producto | null = null;
  let imagenesNuevas: { archivo: File; url: string }[] = [];
  let ocupado = false;
  let pendientePublicacion: { producto: Producto; publicar: boolean } | null = null;

  // ---------- Estados generales ----------
  function confirmar(mensaje: string) {
    const aviso = q('confirmacion');
    aviso.textContent = mensaje;
    aviso.hidden = false;
  }

  function ocultarEstadosListado() {
    for (const id of ['cargando', 'error', 'vacio', 'sin-resultados']) q(id).hidden = true;
    lista.hidden = true;
  }

  function actualizarResumen() {
    q('total').textContent = String(productos.length);
    q('publicados').textContent = String(productos.filter((p) => p.publicado).length);
    q('no-publicados').textContent = String(productos.filter((p) => !p.publicado).length);
  }

  function renderizarListado() {
    ocultarEstadosListado();
    const conFiltros = Boolean(q<HTMLInputElement>('buscar').value.trim()) || q<HTMLSelectElement>('estado').value !== 'todos';
    q<HTMLButtonElement>('limpiar').disabled = !conFiltros;
    if (productos.length === 0) { q('conteo').textContent = 'No hay productos registrados actualmente.'; q('vacio').hidden = false; return; }
    const filtrados = filtrarProductos(productos, q<HTMLInputElement>('buscar').value, q<HTMLSelectElement>('estado').value as Estado);
    q('conteo').textContent = `${filtrados.length} de ${productos.length} ${productos.length === 1 ? 'producto registrado' : 'productos registrados'}.`;
    if (filtrados.length === 0) { q('sin-resultados').hidden = false; return; }

    lista.innerHTML = filtrados.map((producto) => {
      const id = escapar(producto.id_producto);
      const pais = producto.organizacion?.pais;
      const etiquetas = [
        ['Categoría', producto.categoria],
        ['Material', producto.material],
        ['Terminación', producto.terminacion],
      ].filter(([, valor]) => valor)
        .map(([nombre, valor]) => `<span class="rounded-full bg-[#F5F3F9] px-3 py-1 text-xs text-[#625E70]"><span class="font-semibold">${nombre}:</span> ${escapar(valor!)}</span>`)
        .join('');
      const estado = producto.publicado
        ? '<span class="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-[#BDE8D6] bg-[#E5F6EE] px-3 py-1 text-xs font-semibold text-[#16794F]"><span aria-hidden="true">✓</span>Publicado</span>'
        : '<span class="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-[#E5E1EE] bg-[#F5F3F9] px-3 py-1 text-xs font-semibold text-[#625E70]"><span aria-hidden="true">○</span>No publicado</span>';
      return `
        <li>
          <article data-producto="${id}" class="rounded-2xl border border-[#E8E5EF] bg-white p-4 shadow-[0_2px_10px_rgba(47,39,83,0.06)] md:p-5">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="min-w-0 flex-1 space-y-3">
                <div class="flex flex-wrap items-center gap-3">
                  <h3 class="break-words text-lg font-bold text-neutral-900">${escapar(producto.nombre)}</h3>
                  ${estado}
                </div>
                <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div class="min-w-0"><dt class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Organización</dt><dd class="mt-1 break-words text-sm font-medium text-neutral-800">${escapar(producto.organizacion?.nombre ?? 'No disponible')}</dd></div>
                  <div class="min-w-0"><dt class="text-xs font-semibold uppercase tracking-wide text-neutral-500">País</dt><dd class="mt-1 text-sm font-medium text-neutral-800">${escapar(pais?.nombre ?? 'No disponible')}</dd></div>
                  <div class="min-w-0"><dt class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Imágenes</dt><dd class="mt-1 text-sm font-medium text-neutral-800">${producto.imagenes.length}</dd></div>
                </dl>
                ${etiquetas ? `<div class="flex flex-wrap gap-2">${etiquetas}</div>` : ''}
              </div>
              <div class="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button type="button" data-editar="${id}" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#4C4688] bg-white px-4 py-2 text-sm font-semibold text-[#4C4688] hover:bg-[#F0EEF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C4688] disabled:opacity-50">${iconoSvg('editar')}Editar</button>
                <button type="button" data-publicacion="${id}" class="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ${producto.publicado ? 'border border-[#C81E5B] bg-white text-[#C81E5B] hover:bg-[#FCE8F0] focus-visible:ring-[#C81E5B]' : 'bg-[#4C4688] text-white hover:bg-[#423C76] focus-visible:ring-[#4C4688]'}">${producto.publicado ? 'Retirar del catálogo' : 'Publicar en catálogo'}</button>
              </div>
            </div>
          </article>
        </li>`;
    }).join('');
    lista.hidden = false;
    for (const boton of lista.querySelectorAll<HTMLButtonElement>('button')) boton.disabled = ocupado;
  }

  function actualizarSugerencias() {
    for (const campo of ['categoria', 'material', 'terminacion'] as const) {
      q(`opciones-${campo}`).innerHTML = valoresRegistrados(productos, campo)
        .map((valor) => `<option value="${escapar(valor)}"></option>`).join('');
    }
  }

  async function cargarListado() {
    ocultarEstadosListado();
    q('cargando').hidden = false;
    q<HTMLButtonElement>('recargar').disabled = true;
    q<HTMLButtonElement>('reintentar').disabled = true;
    q('listado').setAttribute('aria-busy', 'true');
    try {
      productos = await cliente.listar();
      actualizarResumen();
      actualizarSugerencias();
      renderizarListado();
    } catch (error) {
      productos = [];
      actualizarResumen();
      ocultarEstadosListado();
      q('error-texto').textContent = mensajeErrorProductos(error, 'cargar los productos');
      q('error').hidden = false;
    } finally {
      q<HTMLButtonElement>('recargar').disabled = false;
      q<HTMLButtonElement>('reintentar').disabled = false;
      q('listado').setAttribute('aria-busy', 'false');
    }
  }

  // ---------- Organizaciones ----------
  async function cargarOrganizaciones() {
    const select = q<HTMLSelectElement>('id_organizacion');
    const aviso = q('organizaciones-aviso');
    select.disabled = true;
    aviso.textContent = 'Cargando organizaciones…';
    aviso.hidden = false;
    try {
      organizaciones = [...await listarOrganizaciones()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-CL'));
      select.innerHTML = '<option value="">Selecciona una Organización</option>' + organizaciones
        .map((o) => `<option value="${escapar(o.id_organizacion)}">${escapar(o.nombre)}${o.pais?.nombre ? ` — ${escapar(o.pais.nombre)}` : ''}</option>`)
        .join('');
      aviso.hidden = organizaciones.length > 0;
      if (organizaciones.length === 0) aviso.textContent = 'No hay organizaciones registradas. Registra una antes de agregar productos.';
    } catch (error) {
      aviso.textContent = mensajeErrorProductos(error, 'cargar las organizaciones');
    } finally {
      select.disabled = ocupado;
      if (editando) select.value = editando.id_organizacion;
      mostrarPais();
    }
  }

  function mostrarPais() {
    const id = q<HTMLSelectElement>('id_organizacion').value;
    const organizacion = organizaciones.find((o) => o.id_organizacion === id);
    q('pais').textContent = organizacion?.pais?.nombre ?? (editando?.id_organizacion === id ? editando.organizacion?.pais?.nombre : undefined) ?? '—';
  }

  // ---------- Formulario ----------
  function limpiarErrores() {
    for (const campo of [...camposFormulario, 'imagenes']) {
      q(`error-${campo}`).hidden = true;
      q(`error-${campo}`).textContent = '';
      q(campo).removeAttribute('aria-invalid');
    }
    q('form-error').hidden = true;
  }

  function errorCampo(campo: string, mensaje: string) {
    const destino = document.querySelector<HTMLElement>(`#productos-error-${campo}`);
    if (!destino) return false;
    destino.textContent = mensaje;
    destino.hidden = false;
    const control = q(campo);
    control.setAttribute('aria-invalid', 'true');
    const descripciones = new Set((control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
    descripciones.add(destino.id);
    control.setAttribute('aria-describedby', [...descripciones].join(' '));
    return true;
  }

  function errorFormulario(mensaje: string) {
    q('form-error-texto').textContent = mensaje;
    q('form-error').hidden = false;
  }

  function liberarVistasPrevias() {
    for (const imagen of imagenesNuevas) URL.revokeObjectURL(imagen.url);
    imagenesNuevas = [];
  }

  function renderizarVistaPrevia() {
    const contenedor = q('vista-previa');
    contenedor.innerHTML = imagenesNuevas.map((imagen, indice) => `
      <li class="relative overflow-hidden rounded-xl border border-[#E8E5EF] bg-[#F5F3F9]">
        <img src="${imagen.url}" alt="Vista previa de ${escapar(imagen.archivo.name)}" class="aspect-square w-full bg-white object-contain object-center p-2" />
        <div class="flex items-center justify-between gap-2 p-2">
          <span class="min-w-0 truncate text-xs text-neutral-600">${escapar(imagen.archivo.name)}</span>
          <button type="button" data-quitar="${indice}" class="min-h-10 shrink-0 rounded-lg px-2 text-xs font-semibold text-[#AD174F] hover:bg-[#FCE8F0]" aria-label="Quitar ${escapar(imagen.archivo.name)}">Quitar</button>
        </div>
      </li>`).join('');
    contenedor.hidden = imagenesNuevas.length === 0;
    q('vista-previa-titulo').hidden = imagenesNuevas.length === 0;
  }

  function renderizarImagenesExistentes() {
    const existentes = editando?.imagenes ?? [];
    const contenedor = q('imagenes-existentes');
    contenedor.hidden = existentes.length === 0;
    contenedor.textContent = existentes.length === 0 ? '' : `Este producto ya tiene ${existentes.length} ${existentes.length === 1 ? 'imagen guardada' : 'imágenes guardadas'}. Las nuevas se agregarán a las existentes.`;
  }

  function abrirFormulario(producto: Producto | null) {
    editando = producto;
    form.reset();
    limpiarErrores();
    liberarVistasPrevias();
    renderizarVistaPrevia();
    q('form-titulo').textContent = producto ? `Editar «${producto.nombre}»` : 'Nuevo producto';
    q('guardar').textContent = producto ? 'Confirmar edición' : 'Guardar producto';
    q('form-nota').hidden = Boolean(producto);
    if (producto) {
      for (const campo of camposFormulario) {
        const control = q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(campo);
        control.value = (producto[campo] as string | null) ?? '';
      }
    }
    renderizarImagenesExistentes();
    mostrarPais();
    q('panel').hidden = false;
    q('confirmacion').hidden = true;
    q<HTMLInputElement>('nombre').focus();
    q('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (organizaciones.length === 0) void cargarOrganizaciones();
  }

  function cerrarFormulario() {
    q('panel').hidden = true;
    editando = null;
    liberarVistasPrevias();
    renderizarVistaPrevia();
    q<HTMLButtonElement>('nuevo').focus();
  }

  function fijarOcupado(valor: boolean, texto?: string) {
    ocupado = valor;
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea, button')) {
      control.disabled = valor;
    }
    q<HTMLButtonElement>('nuevo').disabled = valor;
    for (const boton of lista.querySelectorAll<HTMLButtonElement>('button')) boton.disabled = valor;
    form.setAttribute('aria-busy', String(valor));
    const estado = q('form-estado');
    estado.textContent = texto ?? '';
    estado.hidden = !texto;
  }

  function leerFormulario() {
    const datos = Object.fromEntries(camposFormulario.map((campo) => [campo, q<HTMLInputElement>(campo).value]));
    return formularioProductoSchema.safeParse(datos);
  }

  function cambios(original: Producto, datos: DatosProducto): Partial<DatosProducto> {
    const resultado: Partial<DatosProducto> = {};
    for (const campo of camposFormulario) {
      if ((original[campo] ?? null) !== datos[campo]) (resultado as Record<string, unknown>)[campo] = datos[campo];
    }
    return resultado;
  }

  function mostrarErroresServicio(error: unknown) {
    if (error instanceof ApiError && error.fields) {
      let alguno = false;
      for (const [campo, mensajes] of Object.entries(error.fields)) {
        if (mensajes?.[0]) alguno = errorCampo(campo, mensajes[0]) || alguno;
      }
      if (alguno) { errorFormulario('Revisa los campos marcados.'); return; }
    }
    errorFormulario(mensajeErrorProductos(error, 'guardar el producto'));
  }

  async function guardar(event: SubmitEvent) {
    event.preventDefault();
    if (ocupado) return;
    limpiarErrores();
    const resultado = leerFormulario();
    if (!resultado.success) {
      let primero: string | null = null;
      for (const problema of resultado.error.issues) {
        const campo = String(problema.path[0]);
        if (q(`error-${campo}`).hidden) errorCampo(campo, problema.message);
        primero ??= campo;
      }
      errorFormulario('Revisa los campos marcados antes de guardar.');
      if (primero) q(primero).focus();
      return;
    }

    const datos = resultado.data;
    const actual = editando;
    const modificados = actual ? cambios(actual, datos) : null;
    if (actual && modificados && Object.keys(modificados).length === 0 && imagenesNuevas.length === 0) {
      errorFormulario('No hay cambios para guardar.');
      return;
    }

    fijarOcupado(true, actual ? 'Guardando cambios…' : 'Guardando producto…');
    let producto: Producto | null = actual;
    try {
      if (!actual) producto = await cliente.crear(datos);
      else if (modificados && Object.keys(modificados).length > 0) producto = await cliente.actualizar(actual, modificados);
    } catch (error) {
      fijarOcupado(false);
      mostrarErroresServicio(error);
      return;
    }

    if (imagenesNuevas.length > 0 && producto) {
      fijarOcupado(true, 'Cargando imágenes…');
      try {
        await cliente.subirImagenes(producto.id_producto, imagenesNuevas.map((i) => i.archivo));
      } catch (error) {
        fijarOcupado(false);
        editando = producto;
        q('form-titulo').textContent = `Editar «${producto.nombre}»`;
        q('guardar').textContent = 'Confirmar edición';
        q('form-nota').hidden = true;
        errorFormulario(`El producto se guardó, pero no fue posible cargar las imágenes. ${mensajeErrorProductos(error, 'cargar las imágenes')}`);
        void cargarListado();
        return;
      }
    }

    fijarOcupado(false);
    cerrarFormulario();
    confirmar(actual ? 'Producto actualizado correctamente.' : 'Producto creado exitosamente');
    await cargarListado();
  }

  function agregarImagenes() {
    const archivos = [...(inputImagenes.files ?? [])];
    inputImagenes.value = '';
    q('error-imagenes').hidden = true;
    inputImagenes.removeAttribute('aria-invalid');
    const errores: string[] = [];
    for (const archivo of archivos) {
      const error = validarImagenProducto(archivo);
      if (error) { errores.push(error); continue; }
      if (imagenesNuevas.length >= MAXIMO_IMAGENES_POR_CARGA) {
        errores.push(`Puedes cargar hasta ${MAXIMO_IMAGENES_POR_CARGA} imágenes a la vez.`);
        break;
      }
      imagenesNuevas.push({ archivo, url: URL.createObjectURL(archivo) });
    }
    if (errores.length > 0) errorCampo('imagenes', errores.join(' '));
    renderizarVistaPrevia();
  }

  // ---------- Publicación ----------
  function pedirConfirmacion(producto: Producto) {
    const publicar = !producto.publicado;
    pendientePublicacion = { producto, publicar };
    q('dialogo-titulo').textContent = publicar ? '¿Publicar en el catálogo?' : '¿Retirar del catálogo?';
    q('dialogo-texto').textContent = publicar
      ? `«${producto.nombre}» quedará visible en el catálogo público de cotizaciones.`
      : `«${producto.nombre}» dejará de estar visible en el catálogo público y no podrá incluirse en nuevas solicitudes de cotización.`;
    const aceptar = q<HTMLButtonElement>('dialogo-aceptar');
    aceptar.textContent = publicar ? 'Sí, publicar' : 'Sí, retirar';
    aceptar.className = aceptar.className.replace(/bg-\[#[0-9A-F]+\] hover:bg-\[#[0-9A-F]+\]/g, '')
      + (publicar ? ' bg-[#4C4688] hover:bg-[#423C76]' : ' bg-[#C81E5B] hover:bg-[#AD174F]');
    q('dialogo-error').hidden = true;
    q('dialogo-estado').hidden = true;
    dialogo.showModal();
  }

  async function confirmarPublicacion() {
    if (!pendientePublicacion || ocupado) return;
    const { producto, publicar } = pendientePublicacion;
    const aceptar = q<HTMLButtonElement>('dialogo-aceptar');
    const cancelar = q<HTMLButtonElement>('dialogo-cancelar');
    aceptar.disabled = true; cancelar.disabled = true; ocupado = true;
    q('dialogo-error').hidden = true;
    q('dialogo-estado').textContent = publicar ? 'Publicando…' : 'Retirando del catálogo…';
    q('dialogo-estado').hidden = false;
    try {
      const actualizado = await cliente.cambiarPublicacion(producto, publicar);
      productos = productos.map((p) => (p.id_producto === actualizado.id_producto ? actualizado : p));
      pendientePublicacion = null;
      dialogo.close();
      actualizarResumen();
      renderizarListado();
      confirmar(publicar ? `«${actualizado.nombre}» ahora está publicado en el catálogo.` : `«${actualizado.nombre}» se retiró del catálogo.`);
    } catch (error) {
      q('dialogo-error').textContent = mensajeErrorProductos(error, publicar ? 'publicar el producto' : 'retirar el producto');
      q('dialogo-error').hidden = false;
      q('dialogo-estado').hidden = true;
    } finally {
      aceptar.disabled = false; cancelar.disabled = false; ocupado = false;
      for (const boton of lista.querySelectorAll<HTMLButtonElement>('button')) boton.disabled = false;
    }
  }

  // ---------- Eventos ----------
  q('nuevo').addEventListener('click', () => abrirFormulario(null));
  q('cancelar').addEventListener('click', () => { if (!ocupado) cerrarFormulario(); });
  q('recargar').addEventListener('click', () => void cargarListado());
  q('reintentar').addEventListener('click', () => void cargarListado());
  q('buscar').addEventListener('input', renderizarListado);
  q('limpiar').addEventListener('click', () => {
    q<HTMLInputElement>('buscar').value = ''; q<HTMLSelectElement>('estado').value = 'todos'; renderizarListado();
  });
  q('estado').addEventListener('change', renderizarListado);
  q('id_organizacion').addEventListener('change', mostrarPais);
  inputImagenes.addEventListener('change', agregarImagenes);
  q('vista-previa').addEventListener('click', (event) => {
    const boton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-quitar]');
    if (!boton || ocupado) return;
    const [quitada] = imagenesNuevas.splice(Number(boton.dataset.quitar), 1);
    if (quitada) URL.revokeObjectURL(quitada.url);
    renderizarVistaPrevia();
  });
  form.addEventListener('submit', (event) => void guardar(event));
  lista.addEventListener('click', (event) => {
    const objetivo = event.target as HTMLElement;
    const editar = objetivo.closest<HTMLButtonElement>('[data-editar]');
    const publicacion = objetivo.closest<HTMLButtonElement>('[data-publicacion]');
    const id = editar?.dataset.editar ?? publicacion?.dataset.publicacion;
    const producto = productos.find((p) => p.id_producto === id);
    if (!producto || ocupado) return;
    if (editar) abrirFormulario(producto);
    else pedirConfirmacion(producto);
  });
  q('dialogo-aceptar').addEventListener('click', () => void confirmarPublicacion());
  q('dialogo-cancelar').addEventListener('click', () => { if (!ocupado) { pendientePublicacion = null; dialogo.close(); } });
  dialogo.addEventListener('cancel', (event) => { if (ocupado) event.preventDefault(); else pendientePublicacion = null; });

  let autorizado = false;
  try {
    autorizado = (await getUserRoles()).some((rol) => rol.codigo === 'ADMIN');
  } catch {
    autorizado = false;
  }
  if (!autorizado) return;
  await Promise.all([cargarListado(), cargarOrganizaciones()]);
}
