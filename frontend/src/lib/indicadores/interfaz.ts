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
    for (const cat of catalogo) {
      const asociado = indicadores.some(i => i.id_catalogo === cat.id_indicador);
      const row = document.createElement('div'); row.className = 'rounded-xl border border-neutral-200 bg-white p-4';
      const label = document.createElement('label'); label.className = 'flex min-h-[48px] cursor-pointer items-start gap-3 font-semibold';
      const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.catalogo = cat.id_indicador;
      check.id = `ind-seleccion-${cat.id_indicador}`; check.disabled = asociado; check.className = 'mt-1 size-5 shrink-0 accent-primary';
      const nombre = document.createElement('span'); nombre.textContent = cat.nombre; label.append(check, nombre);
      const desc = document.createElement('p'); desc.className = 'mt-1 text-sm text-neutral-700'; desc.textContent = asociado ? `${cat.unidad_medida} · Ya asociado a esta acción` : `${cat.descripcion} Unidad: ${cat.unidad_medida}.`;
      const valores = document.createElement('div'); valores.hidden = true; valores.className = 'mt-3';
      const metaLabel = document.createElement('label'); metaLabel.htmlFor = `ind-meta-${cat.id_indicador}`; metaLabel.className = 'block font-medium'; metaLabel.textContent = 'Meta esperada *';
      const meta = document.createElement('input'); meta.type = 'number'; meta.min = '0'; meta.step = 'any'; meta.id = metaLabel.htmlFor; meta.disabled = true;
      meta.dataset.meta = cat.id_indicador; meta.className = 'mt-2 min-h-[48px] w-full rounded-lg border border-neutral-300 p-3';
      check.addEventListener('change', () => { valores.hidden = !check.checked; meta.disabled = !check.checked; if (check.checked) meta.focus(); });
      valores.append(metaLabel, meta); row.append(label, desc, valores); q('catalogo').append(row);
    }
  }
  function boton(texto: string, accion: () => void) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'min-h-[48px] rounded-lg border-2 border-primary px-4 py-2 font-medium text-primary hover:bg-primary/5'; b.textContent = texto; b.addEventListener('click', accion); return b;
  }
  function renderSeguimiento() {
    q('cantidad').textContent = `${indicadores.length} ${indicadores.length === 1 ? 'indicador' : 'indicadores'}`;
    q('vacio').hidden = indicadores.length > 0; q('lista').replaceChildren();
    for (const item of indicadores) {
      const cat = definicion(item);
      const card = document.createElement('article'); card.dataset.indicador = item.id_indicador; card.className = 'min-w-0 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm';
      const h = document.createElement('h4'); h.className = 'break-words text-xl font-semibold'; h.textContent = cat.nombre;
      const unidad = document.createElement('p'); unidad.className = 'mt-1 text-neutral-700'; unidad.textContent = `Unidad: ${cat.unidad_medida}`;
      const valores = document.createElement('dl'); valores.className = 'my-4 grid grid-cols-2 gap-3';
      for (const [etiqueta, valor, clase] of [
        ['Meta esperada', mostrarCantidad(item.meta), 'bg-primary/5'],
        ['Resultado obtenido', item.resultado === null ? 'Sin registrar' : mostrarCantidad(item.resultado.valor_medido), 'bg-neutral-100'],
      ]) {
        const div = document.createElement('div'); div.className = `min-w-0 rounded-lg p-3 ${clase}`;
        const dt = document.createElement('dt'); dt.className = 'text-sm font-medium'; dt.textContent = etiqueta;
        const dd = document.createElement('dd'); dd.className = 'indicador-valor mt-2 break-words font-bold'; dd.textContent = valor; div.append(dt, dd); valores.append(div);
      }
      const fecha = document.createElement('p'); fecha.className = 'mb-3 text-sm text-neutral-700';
      fecha.textContent = item.resultado ? `Medición: ${item.resultado.fecha_medicion.split('-').reverse().join('/')}` : 'Puedes registrar el resultado más adelante.';
      const observaciones = document.createElement('p'); observaciones.className = 'mb-4 whitespace-pre-wrap break-words text-neutral-700'; observaciones.textContent = item.resultado?.observaciones ?? ''; observaciones.hidden = !observaciones.textContent;
      const acciones = document.createElement('div'); acciones.className = 'flex flex-wrap gap-3';
      acciones.append(boton('Editar meta', () => abrir(item, 'meta')), boton(item.resultado ? 'Actualizar resultado' : 'Registrar resultado', () => abrir(item, 'resultado')));
      card.append(h, unidad, valores, fecha, observaciones, acciones); q('lista').append(card);
    }
  }
  function tieneCambios() { return checks().length > 0 || dialogo.open; }
  async function cargar(confirmar = true) {
    if (ocupado) return;
    if (confirmar && tieneCambios() && !window.confirm('Se descartará la selección sin guardar para recargar los datos. ¿Continuar?')) return;
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
      const nuevos = await servicio.asociar(accion, entradas); indicadores.push(...nuevos); renderCatalogo(); renderSeguimiento();
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
  q('recargar').addEventListener('click', () => cargar());
  const iniciar = () => { if (!iniciado) { iniciado = true; void cargar(false); } };
  window.addEventListener('accion:detalle-cargado', iniciar);
  if (document.querySelector<HTMLElement>('#accion-detalle')?.dataset.cargada === 'true') iniciar();
}
