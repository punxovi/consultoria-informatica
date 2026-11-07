import { iconoSvg } from '../ui/iconos.ts';
import { confirmar as confirmarAccion } from '../ui/confirmar';
import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteIndicadores } from './cliente';
import { numeroFormularioSchema, resultadoFormularioSchema, hoyLocal, mostrarCantidad, type IndicadorAccion, type IndicadorCatalogo, type Asociacion } from './modelo';

export function iniciarIndicadores() {
  const nodo = document.querySelector<HTMLElement>('#indicadores-accion');
  if (!nodo) return;
  const raiz: HTMLElement = nodo, accion = raiz.dataset.accion!;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#ind-${id}`)!;
  const dialogo = q<HTMLDialogElement>('dialogo'), form = q<HTMLFormElement>('form');
  const servicio = crearClienteIndicadores(createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'), async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
  let ocupado = false, iniciado = false, cargado = false, requiereRecarga = false;
  let catalogo: IndicadorCatalogo[] = [], indicadores: IndicadorAccion[] = [], seleccionado: IndicadorAccion | null = null;
  let modo: 'meta' | 'resultado' = 'resultado';
  const checks = () => [...form.querySelectorAll<HTMLInputElement>('[data-catalogo]:checked')];
  const definicion = (item: IndicadorAccion) => item.nombre && item.unidad_medida
    ? { nombre: item.nombre, unidad_medida: item.unidad_medida }
    : catalogo.find(c => c.id_indicador === item.id_catalogo)!;
  function bloquear(valor: boolean, texto = 'Cargando indicadores…') {
    ocupado = valor; raiz.setAttribute('aria-busy', String(valor));
    q('carga').hidden = !valor || dialogo.open; q('carga').textContent = texto;
    q('dialogo-carga').hidden = !valor || !dialogo.open;
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = valor; });
    q<HTMLFieldSetElement>('campos').disabled = valor || !cargado;
    q<HTMLFieldSetElement>('edicion-campos').disabled = valor;
    q<HTMLButtonElement>('asociar').disabled = valor || requiereRecarga || !catalogo.some(c => !indicadores.some(i => i.id_catalogo === c.id_indicador));
    q<HTMLButtonElement>('guardar').disabled = valor || requiereRecarga;
    q<HTMLButtonElement>('nueva').disabled = valor || !cargado || requiereRecarga || !catalogo.some(c => !indicadores.some(i => i.id_catalogo === c.id_indicador));
  }
  // Igual que en Actas: el listado es la vista principal y el catálogo se abre con «Agregar indicadores».
  function vista(formulario: boolean) {
    q('vista-lista').hidden = formulario; q('vista-form').hidden = !formulario; q('nueva').hidden = formulario;
  }
  function limpiarErrores() {
    q('error').hidden = q('exito').hidden = q('dialogo-error').hidden = q('seleccion-error').hidden = true;
    raiz.querySelectorAll('[data-error-indicador]').forEach(n => n.remove());
    raiz.querySelectorAll('[aria-invalid="true"]').forEach(n => {
      n.removeAttribute('aria-invalid');
      if (n.id === 'ind-valor') n.setAttribute('aria-describedby', 'ind-valor-ayuda'); else n.removeAttribute('aria-describedby');
    });
  }
  function errorCampo(input: HTMLElement, texto: string) {
    if (input.getAttribute('aria-invalid') === 'true') return;
    const p = document.createElement('p'); p.id = `${input.id}-error`; p.dataset.errorIndicador = ''; p.className = 'mt-2 text-sm text-red-800'; p.textContent = texto;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `${input.id === 'ind-valor' ? 'ind-valor-ayuda ' : ''}${p.id}`); input.after(p);
  }
  function error(fallo: unknown, mutacion = false) {
    const api = fallo instanceof ApiError;
    let mensaje = fallo instanceof Error ? fallo.message : 'No fue posible completar la operación.';
    if (api && (fallo.code === 'RUTA_NO_ENCONTRADA' || fallo.status === 501)) mensaje = 'El servicio de Indicadores todavía no está disponible. Revisa la configuración del Backend.';
    if (mutacion && api && (fallo.status === 409 || fallo.status === 0 || fallo.status >= 500)) {
      requiereRecarga = true;
      mensaje += ' Conservamos los valores ingresados. Cierra el formulario y pulsa Actualizar indicadores antes de volver a guardar.';
    }
    const destino = dialogo.open ? q('dialogo-error') : q('error'); destino.textContent = mensaje; destino.hidden = false; destino.focus();
  }
  function renderCatalogo() {
    q('catalogo').replaceChildren(); q('catalogo-vacio').hidden = catalogo.length > 0;
    const estaAsociado = (cat: IndicadorCatalogo) => indicadores.some(i => i.id_catalogo === cat.id_indicador);
    // Primero los disponibles; los ya asociados quedan al final, atenuados.
    const ordenado = [...catalogo].sort((a, b) => Number(estaAsociado(a)) - Number(estaAsociado(b)));
    for (const cat of ordenado) {
      const asociado = estaAsociado(cat);
      const row = document.createElement('div');
      row.className = asociado ? 'rounded-xl border border-neutral-200 bg-neutral-50 p-4' : 'rounded-xl border border-neutral-200 bg-white p-4 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-[#F7F6FC]';
      const label = document.createElement('label'); label.className = `flex items-start gap-3 ${asociado ? 'cursor-not-allowed' : 'cursor-pointer'}`;
      const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.catalogo = cat.id_indicador;
      check.id = `ind-seleccion-${cat.id_indicador}`; check.disabled = asociado; check.className = 'mt-0.5 size-5 shrink-0 accent-primary';
      const textos = document.createElement('span'); textos.className = 'min-w-0 flex-1';
      const cabecera = document.createElement('span'); cabecera.className = 'flex flex-wrap items-center gap-2';
      const nombre = document.createElement('span'); nombre.className = `font-semibold ${asociado ? 'text-neutral-500' : 'text-neutral-900'}`; nombre.textContent = cat.nombre;
      const unidad = document.createElement('span'); unidad.className = 'inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600'; unidad.textContent = cat.unidad_medida;
      cabecera.append(nombre, unidad);
      if (asociado) {
        const chip = document.createElement('span'); chip.className = 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'; chip.textContent = 'Ya asociado'; cabecera.append(chip);
      }
      const desc = document.createElement('span'); desc.className = 'mt-1 block text-sm leading-5 text-neutral-500'; desc.textContent = cat.descripcion;
      textos.append(cabecera, desc); label.append(check, textos);
      const valores = document.createElement('div'); valores.hidden = true; valores.className = 'mt-3 pl-8';
      const metaLabel = document.createElement('label'); metaLabel.htmlFor = `ind-meta-${cat.id_indicador}`; metaLabel.className = 'block text-sm font-semibold text-neutral-800'; metaLabel.textContent = `Meta esperada (${cat.unidad_medida.toLowerCase()}) *`;
      const meta = document.createElement('input'); meta.type = 'number'; meta.min = '0'; meta.step = 'any'; meta.id = metaLabel.htmlFor; meta.disabled = true; meta.placeholder = 'Ej.: 20';
      meta.dataset.meta = cat.id_indicador; meta.className = 'mt-2 min-h-[44px] w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
      check.addEventListener('change', () => { valores.hidden = !check.checked; meta.disabled = !check.checked; if (check.checked) meta.focus(); });
      valores.append(metaLabel, meta); row.append(label, valores); q('catalogo').append(row);
    }
  }
  function boton(texto: string, accion: () => void) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border-2 border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5'; b.textContent = texto;
    // Mismo ícono de «Editar» que en el resto de la aplicación.
    if (texto.startsWith('Editar')) b.insertAdjacentHTML('afterbegin', iconoSvg('editar'));
    b.addEventListener('click', accion); return b;
  }
  function renderSeguimiento() {
    q('cantidad').textContent = `${indicadores.length} ${indicadores.length === 1 ? 'indicador asociado' : 'indicadores asociados'}`;
    q('vacio').hidden = indicadores.length > 0; q('lista').replaceChildren();
    for (const item of indicadores) {
      const cat = definicion(item);
      const card = document.createElement('article'); card.dataset.indicador = item.id_indicador; card.className = 'min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5';
      const cabecera = document.createElement('div'); cabecera.className = 'flex flex-wrap items-start justify-between gap-2';
      const h = document.createElement('h4'); h.className = 'min-w-0 break-words text-lg font-semibold text-neutral-900'; h.textContent = cat.nombre;
      const unidad = document.createElement('span'); unidad.className = 'inline-flex shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600'; unidad.textContent = `Unidad: ${cat.unidad_medida}`;
      cabecera.append(h, unidad);
      const valores = document.createElement('dl'); valores.className = 'mt-4 grid grid-cols-2 gap-3';
      for (const [etiqueta, valor, clase] of [
        ['Meta esperada', mostrarCantidad(item.meta), 'bg-[#F4F2FC]'],
        ['Resultado obtenido', item.resultado === null ? 'Sin registrar' : mostrarCantidad(item.resultado.valor_medido), item.resultado === null ? 'bg-neutral-50 border border-dashed border-neutral-200' : 'bg-emerald-50'],
      ]) {
        const div = document.createElement('div'); div.className = `min-w-0 rounded-lg p-3 ${clase}`;
        const dt = document.createElement('dt'); dt.className = 'text-xs font-semibold uppercase tracking-wide text-neutral-500'; dt.textContent = etiqueta;
        const dd = document.createElement('dd'); dd.className = `indicador-valor mt-1 break-words font-bold${item.resultado === null && etiqueta === 'Resultado obtenido' ? ' indicador-pendiente' : ''}`; dd.textContent = valor; div.append(dt, dd); valores.append(div);
      }
      const detalle = document.createElement('div'); detalle.className = 'mt-3 space-y-1';
      const fecha = document.createElement('p'); fecha.className = 'text-sm text-neutral-600';
      fecha.textContent = item.resultado ? `Medición: ${item.resultado.fecha_medicion.split('-').reverse().join('/')}` : 'Puedes registrar el resultado más adelante.';
      const observaciones = document.createElement('p'); observaciones.className = 'whitespace-pre-wrap break-words text-sm text-neutral-700'; observaciones.textContent = item.resultado?.observaciones ?? ''; observaciones.hidden = !observaciones.textContent;
      detalle.append(fecha, observaciones);
      const acciones = document.createElement('div'); acciones.className = 'mt-4 flex flex-wrap gap-3 border-t border-neutral-100 pt-4';
      acciones.append(boton(item.resultado ? 'Actualizar resultado' : 'Registrar resultado', () => abrir(item, 'resultado')), boton('Editar meta', () => abrir(item, 'meta')));
      card.append(cabecera, valores, detalle, acciones); q('lista').append(card);
    }
  }
  function tieneCambios() { return checks().length > 0 || dialogo.open; }
  async function cargar(confirmar = true) {
    if (ocupado) return;
    if (confirmar && tieneCambios() && !(await confirmarAccion({
      titulo: '¿Recargar los indicadores?',
      mensaje: 'Se descartará la selección o los valores que aún no has guardado para volver a cargar los datos.',
      confirmar: 'Recargar', tono: 'peligro',
    }))) return;
    limpiarErrores(); bloquear(true);
    try {
      const [cat, items] = await Promise.all([servicio.catalogo(), servicio.listar(accion)]);
      if (items.some(i => !(i.nombre && i.unidad_medida) && !cat.some(c => c.id_indicador === i.id_catalogo))) throw new Error('El catálogo recibido no contiene todos los indicadores asociados. No es posible mostrar datos incompletos.');
      catalogo = cat; indicadores = items; cargado = true; requiereRecarga = false; renderCatalogo(); renderSeguimiento();
    } catch (fallo) { error(fallo); } finally { bloquear(false); }
  }
  form.addEventListener('submit', async evento => {
    evento.preventDefault(); if (ocupado || requiereRecarga || !cargado) return; limpiarErrores();
    const seleccionados = checks();
    if (!seleccionados.length) { q('seleccion-error').textContent = 'Selecciona al menos un indicador del catálogo.'; q('seleccion-error').hidden = false; form.querySelector<HTMLInputElement>('[data-catalogo]:not(:disabled)')?.focus(); return; }
    const entradas: Asociacion[] = [];
    for (const check of seleccionados) {
      const id = check.dataset.catalogo!, input = form.querySelector<HTMLInputElement>(`[data-meta="${id}"]`)!;
      const meta = numeroFormularioSchema.safeParse(input.value);
      if (!meta.success) errorCampo(input, meta.error.issues[0].message); else entradas.push({ id_indicador: id, meta: meta.data });
    }
    if (entradas.length !== seleccionados.length) { form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
    bloquear(true, 'Asociando indicadores…');
    try {
      const nuevos = await servicio.asociar(accion, entradas); indicadores.push(...nuevos); renderCatalogo(); renderSeguimiento(); vista(false);
      q('exito').textContent = 'Indicadores asociados correctamente.'; q('exito').hidden = false;
    } catch (fallo) { error(fallo, true); } finally { bloquear(false); }
  });
  function abrir(item: IndicadorAccion, operacion: typeof modo) {
    if (ocupado) return; limpiarErrores(); seleccionado = item; modo = operacion;
    q<HTMLFormElement>('edicion').reset();
    const titulo = modo === 'meta' ? 'Editar meta' : item.resultado ? 'Actualizar resultado' : 'Registrar resultado';
    q('dialogo-titulo').textContent = titulo; q('contexto').textContent = `${definicion(item).nombre} · ${definicion(item).unidad_medida}`;
    q('guardar').textContent = modo === 'meta' ? 'Guardar meta' : 'Guardar resultado';
    raiz.querySelector<HTMLLabelElement>('label[for="ind-valor"]')!.firstChild!.textContent = modo === 'meta' ? 'Meta esperada ' : 'Resultado obtenido ';
    const input = q<HTMLInputElement>('valor'); input.value = modo === 'meta' ? item.meta === null ? '' : String(item.meta) : item.resultado ? String(item.resultado.valor_medido) : '';
    input.min = '0'; input.step = 'any'; input.setAttribute('aria-describedby', 'ind-valor-ayuda');
    q('resultado-campos').hidden = modo === 'meta'; q<HTMLInputElement>('fecha').disabled = modo === 'meta';
    q<HTMLInputElement>('fecha').value = item.resultado?.fecha_medicion ?? hoyLocal(); q<HTMLTextAreaElement>('observaciones').value = item.resultado?.observaciones ?? '';
    q<HTMLButtonElement>('guardar').disabled = requiereRecarga;
    dialogo.showModal();
    if (requiereRecarga) error(new Error('Cierra el formulario y pulsa Actualizar indicadores antes de volver a guardar.'));
    else input.focus();
  }
  q('edicion').addEventListener('submit', async evento => {
    evento.preventDefault(); if (ocupado || requiereRecarga || !seleccionado) return; limpiarErrores();
    const meta = numeroFormularioSchema.safeParse(q<HTMLInputElement>('valor').value);
    const resultado = resultadoFormularioSchema.safeParse({ valor_medido: q<HTMLInputElement>('valor').value, fecha_medicion: q<HTMLInputElement>('fecha').value, observaciones: q<HTMLTextAreaElement>('observaciones').value });
    if (modo === 'meta' && !meta.success) errorCampo(q('valor'), meta.error.issues[0].message);
    if (modo === 'resultado' && !resultado.success) for (const issue of resultado.error.issues) errorCampo(q(({ valor_medido: 'valor', fecha_medicion: 'fecha', observaciones: 'observaciones' } as Record<string, string>)[String(issue.path[0])]), issue.message);
    if (dialogo.querySelector('[aria-invalid="true"]')) { dialogo.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
    bloquear(true);
    try {
      let actualizado: IndicadorAccion;
      if (modo === 'meta' && meta.success) actualizado = await servicio.actualizarMeta(seleccionado, meta.data);
      else if (modo === 'resultado' && resultado.success) actualizado = { ...seleccionado, resultado: await servicio.guardarResultado(seleccionado, resultado.data) };
      else return;
      indicadores = indicadores.map(i => i.id_indicador === actualizado.id_indicador ? actualizado : i); renderSeguimiento(); dialogo.close();
      q('exito').textContent = `${modo === 'meta' ? 'Meta actualizada' : 'Resultado guardado'} correctamente.`; q('exito').hidden = false;
    } catch (fallo) { error(fallo, true); } finally { bloquear(false); }
  });
  q('cancelar').addEventListener('click', () => { if (!ocupado) dialogo.close(); });
  dialogo.addEventListener('cancel', evento => { if (ocupado) evento.preventDefault(); });
  q('limpiar').addEventListener('click', () => { if (!ocupado) { limpiarErrores(); renderCatalogo(); } });
  q('nueva').addEventListener('click', () => {
    if (ocupado || !cargado) return; limpiarErrores(); renderCatalogo(); vista(true);
    form.querySelector<HTMLInputElement>('[data-catalogo]:not(:disabled)')?.focus();
  });
  q('volver').addEventListener('click', () => {
    if (ocupado) return; limpiarErrores(); renderCatalogo(); vista(false); q('nueva').focus();
  });
  q('recargar').addEventListener('click', () => cargar());
  const iniciar = () => { if (!iniciado) { iniciado = true; void cargar(false); } };
  window.addEventListener('accion:detalle-cargado', iniciar);
  if (document.querySelector<HTMLElement>('#accion-detalle')?.dataset.cargada === 'true') iniciar();
}
