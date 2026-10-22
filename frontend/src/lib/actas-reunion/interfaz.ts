import { ApiError, createApiTransport } from '../api/transporte.ts';
import { getSupabaseClient } from '../supabase.ts';
import { camposActaSchema, type ActaReunion, type CatalogoActas } from './modelo.ts';
import { crearClienteActas } from './cliente.ts';
import { iniciarCompromisosEnActas } from '../compromisos/en-actas.ts';

export async function iniciarActasReunion() {
  const raiz = document.querySelector<HTMLElement>('#actas-reunion');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const org = raiz.dataset.organizacion!;
  const buscar = <T extends HTMLElement = HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const servicio = crearClienteActas(createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'), async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
  const compromisos = iniciarCompromisosEnActas(raiz);
  const formulario = buscar<HTMLFormElement>('#actas-formulario');
  const plan = buscar<HTMLSelectElement>('#actas-plan');
  const accion = buscar<HTMLSelectElement>('#actas-accion');
  const asistentes = buscar<HTMLSelectElement>('#actas-asistentes');
  const fecha = buscar<HTMLInputElement>('#actas-fecha');
  const guardar = buscar<HTMLButtonElement>('#actas-guardar');
  const nueva = buscar<HTMLButtonElement>('#actas-nueva');
  const editar = buscar<HTMLButtonElement>('#actas-editar');
  let catalogo: CatalogoActas | null = null;
  let registros: ActaReunion[] = [];
  let actual: ActaReunion | null = null;
  let editando: ActaReunion | null = null;
  let ocupado = false;
  let cargado = false;
  const conflictos = new Set<string>();
  const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const texto = (s: string) => buscar<HTMLInputElement | HTMLTextAreaElement>(s).value.trim();
  const nombrePlan = (id: string) => catalogo?.planes.find(p => p.id_plan === id)?.nombre ?? 'Plan no disponible';
  const nombreAccion = (id: string) => !id ? 'Sin acción asociada' : catalogo?.acciones.find(a => a.id_accion === id)?.nombre ?? 'Acción no disponible';
  const fechaVisible = (valor: string) => new Date(`${valor}T12:00:00`).toLocaleDateString('es-CL');

  function limpiarMensajes() {
    buscar('#actas-error').hidden = true;
    buscar('#actas-mensaje').hidden = true;
    formulario.querySelectorAll<HTMLElement>('[data-error-acta]').forEach(n => { n.textContent = ''; n.hidden = true; });
    formulario.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach(n => {
      n.removeAttribute('aria-invalid');
      n.classList.remove('border-danger');
    });
  }
  function error(fallo: unknown) {
    buscar('#actas-error').textContent = fallo instanceof Error ? fallo.message : 'No fue posible completar la operación.';
    buscar('#actas-error').hidden = false;
  }
  function errorCampo(campo: string, mensaje: string) {
    const controles: Record<string, string> = { id_plan: 'plan', id_accion: 'accion', fecha_reunion: 'fecha', asistentes: 'asistentes', asistentes_externos: 'asistentes-externos', objetivo: 'objetivo', observaciones: 'observaciones' };
    const control = buscar(`#actas-${controles[campo]}`);
    if (!control) return;
    control.classList.add('border-danger');
    control.setAttribute('aria-invalid', 'true');
    const id = `actas-validacion-${campo}`;
    let aviso = buscar(`#${id}`) || buscar(`#error-${controles[campo]}-acta`);
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = id;
      aviso.dataset.errorActa = '';
      aviso.className = 'mt-1 text-sm text-danger';
      control.after(aviso);
    }
    aviso.textContent = mensaje;
    aviso.hidden = false;
    control.setAttribute('aria-describedby', aviso.id || id);
  }
  function ocupar(valor: boolean) {
    ocupado = valor;
    raiz!.setAttribute('aria-busy', String(valor));
    formulario.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input,select,textarea,button').forEach(n => n.disabled = valor);
    nueva.disabled = valor || !cargado || !catalogo?.puede_gestionar || !catalogo.planes.length || !catalogo.asistentes.length;
    editar.disabled = valor || !catalogo?.puede_gestionar;
    buscar<HTMLButtonElement>('#actas-volver').disabled = valor;
    buscar<HTMLButtonElement>('#actas-recargar').disabled = valor;
    guardar.disabled = valor || !catalogo?.puede_gestionar || !!editando && conflictos.has(editando.id_acta);
    accion.disabled = valor || !plan.value;
  }
  function ocultar() {
    for (const id of ['carga','vacio','historial','formulario-contenedor','detalle']) buscar(`#actas-${id}`).hidden = true;
  }
  function cargarVista() { ocultar(); buscar('#actas-carga').hidden = false; ocupar(true); }
  function actualizarOpcionesAccion(seleccion = '') {
    accion.replaceChildren(new Option('Sin acción asociada', ''));
    for (const a of catalogo?.acciones.filter(a => a.id_plan === plan.value) ?? []) accion.add(new Option(a.nombre, a.id_accion));
    if (seleccion && ![...accion.options].some(o => o.value === seleccion)) accion.add(new Option('Acción anterior no disponible: selecciona otra o quítala', seleccion));
    accion.value = seleccion;
    accion.disabled = ocupado || !plan.value;
  }
  plan.addEventListener('change', () => actualizarOpcionesAccion());

  function campoResumen(etiqueta: string, valor: string): HTMLElement {
    const grupo = document.createElement('div');
    grupo.className = 'rounded-xl border border-[#E3DFF0] bg-[#F7F6FA] p-3.5';
    const titulo = document.createElement('dt');
    titulo.className = 'text-xs font-medium uppercase tracking-wide text-slate-500';
    titulo.textContent = etiqueta;
    const dato = document.createElement('dd');
    dato.className = 'mt-1 break-words text-sm font-semibold text-slate-900';
    dato.textContent = valor;
    grupo.append(titulo, dato);
    return grupo;
  }

  function historial() {
    ocultar(); actual = null; editando = null;
    buscar('#actas-vacio').hidden = registros.length > 0;
    buscar('#actas-historial').hidden = registros.length === 0;
    buscar('#cantidad-actas').textContent = `${registros.length} ${registros.length === 1 ? 'acta registrada' : 'actas registradas'}`;
    const lista = buscar('#lista-actas'); lista.replaceChildren();
    for (const acta of [...registros].sort((a, b) => b.fecha_reunion.localeCompare(a.fecha_reunion) || b.id_acta.localeCompare(a.id_acta))) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'overflow-hidden rounded-xl border border-[#E3DFF0] bg-white shadow-[0_2px_8px_rgba(38,28,76,0.04)] transition hover:border-[#D8D2E8] hover:shadow-[0_4px_12px_rgba(38,28,76,0.06)]';
      const linea = document.createElement('div'); linea.className = 'h-0.5 bg-[#D8D3E8]';
      const contenido = document.createElement('div'); contenido.className = 'grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch';
      const cabecera = document.createElement('div'); cabecera.className = 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between';
      const principal = document.createElement('div'); principal.className = 'flex min-w-0 items-start gap-3';
      const icono = document.createElement('div');
      icono.className = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0EDF8] text-[#4C4688]';
      icono.setAttribute('aria-hidden', 'true');
      icono.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.75h7l4.25 4.25v11A1.5 1.5 0 0 1 16.75 20.5h-9.5A1.5 1.5 0 0 1 5.75 19V5.25A1.5 1.5 0 0 1 7.25 3.75Z"/><path d="M14 4v4h4M8.5 12h7M8.5 15.5h7"/></svg>';
      const encabezado = document.createElement('div'); encabezado.className = 'min-w-0';
      const etiqueta = document.createElement('p'); etiqueta.className = 'text-xs font-semibold uppercase tracking-[0.12em] text-[#77719F]'; etiqueta.textContent = 'Acta de reunión';
      const titulo = document.createElement('h4'); titulo.className = 'mt-1 break-words text-base font-semibold text-slate-900'; titulo.textContent = acta.objetivo || 'Acta sin objetivo registrado';
      encabezado.append(etiqueta, titulo); principal.append(icono, encabezado);
      const fecha = document.createElement('span'); fecha.className = 'inline-flex w-fit shrink-0 items-center rounded-full bg-[#F0EDF8] px-3 py-1.5 text-sm font-medium text-[#4C4688]'; fecha.textContent = fechaVisible(acta.fecha_reunion);
      cabecera.append(principal, fecha);
      const datos = document.createElement('dl'); datos.className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';
      datos.append(campoResumen('Plan relacionado', nombrePlan(acta.id_plan)), campoResumen('Acción relacionada', nombreAccion(acta.id_accion)), campoResumen('Asistentes', `${acta.asistentes.length} ${acta.asistentes.length === 1 ? 'persona' : 'personas'}`));
      const principalContenido = document.createElement('div');
      principalContenido.className = 'min-w-0 space-y-4';
      principalContenido.append(cabecera, datos);

      const acciones = document.createElement('div');
      acciones.className = 'flex justify-end border-t border-[#F0EDF6] pt-3 lg:h-full lg:min-w-[130px] lg:items-center lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0';
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.verActa = acta.id_acta;
      boton.innerHTML = 'Ver detalle <span aria-hidden="true">→</span>';
      boton.className = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#4C4688] transition hover:bg-[#F5F3FA] focus:outline-none focus:ring-2 focus:ring-[#4C4688]/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
      boton.addEventListener('click', () => void consultarDetalle(acta.id_acta));
      acciones.append(boton);

      contenido.append(principalContenido, acciones);
      tarjeta.append(linea, contenido);
      lista.append(tarjeta);
    }
  }
  function detalle(acta: ActaReunion) {
    ocultar(); actual = acta; editando = null; buscar('#actas-detalle').hidden = false;
    buscar('#detalle-fecha').textContent = fechaVisible(acta.fecha_reunion);
    buscar('#detalle-plan').textContent = nombrePlan(acta.id_plan);
    buscar('#detalle-accion').textContent = nombreAccion(acta.id_accion);
    buscar('#detalle-objetivo').textContent = acta.objetivo || 'Sin objetivo registrado.';
    buscar('#detalle-observaciones').textContent = acta.observaciones || 'Sin observaciones registradas.';
    const externos = buscar('#detalle-asistentes-externos'); externos.hidden = !acta.asistentes_externos;
    externos.textContent = `Asistentes externos: ${acta.asistentes_externos}`;
    const lista = buscar('#detalle-asistentes'); lista.replaceChildren();
    if (!acta.asistentes.length) lista.textContent = 'Sin asistentes registrados.';
    for (const nombre of acta.asistentes) { const item = document.createElement('span'); item.className = 'rounded-full bg-primary/10 px-3 py-1 text-sm'; item.textContent = nombre; lista.append(item); }
    compromisos?.detalle(acta.compromisos ?? []);
    editar.hidden = !catalogo?.puede_gestionar;
  }
  async function consultarDetalle(id: string) {
    if (ocupado) return;
    limpiarMensajes(); cargarVista();
    try { detalle(await servicio.detalle(org, id)); }
    catch (fallo) { ocultar(); error(fallo); buscar('#actas-recuperacion').hidden = false; }
    finally { ocupar(false); }
  }
  function abrirFormulario(acta: ActaReunion | null = null) {
    if (ocupado || !cargado || !catalogo?.puede_gestionar) return;
    limpiarMensajes(); ocultar(); formulario.reset(); editando = acta;
    compromisos?.reiniciar(!!acta);
    plan.replaceChildren(new Option('Selecciona un plan',''));
    for (const p of catalogo.planes) plan.add(new Option(p.nombre,p.id_plan));
    if (acta && !catalogo.planes.some(p => p.id_plan === acta.id_plan)) plan.add(new Option('Plan anterior no disponible: selecciona otro',acta.id_plan));
    plan.value = acta?.id_plan ?? '';
    actualizarOpcionesAccion(acta?.id_accion ?? '');
    asistentes.replaceChildren();
    for (const nombre of new Set([...catalogo.asistentes, ...(acta?.asistentes ?? [])])) asistentes.add(new Option(nombre,nombre,false,acta?.asistentes.includes(nombre) ?? false));
    fecha.value = acta?.fecha_reunion ?? hoy(); fecha.max = hoy();
    buscar<HTMLInputElement>('#actas-asistentes-externos').value = acta?.asistentes_externos ?? '';
    buscar<HTMLTextAreaElement>('#actas-objetivo').value = acta?.objetivo ?? '';
    buscar<HTMLTextAreaElement>('#actas-observaciones').value = acta?.observaciones ?? '';
    buscar('#actas-formulario-titulo').textContent = acta ? 'Editar acta de reunión' : 'Registrar acta';
    guardar.textContent = acta ? 'Guardar cambios' : 'Guardar acta';
    buscar('#actas-formulario-contenedor').hidden = false;
    ocupar(false); plan.focus();
  }
  async function cargar() {
    if (ocupado) return false;
    if (!buscar('#actas-formulario-contenedor').hidden && !confirm('Al recargar se descartarán los cambios del formulario. ¿Continuar?')) return false;
    limpiarMensajes(); cargado = false; buscar('#actas-catalogo-estado').hidden = true;
    buscar('#actas-recuperacion').hidden = true; cargarVista();
    try {
      const [lista, opciones] = await Promise.all([servicio.obtener(org), servicio.catalogo(org)]);
      registros = lista; catalogo = opciones; cargado = true; conflictos.clear();
      nueva.hidden = !opciones.puede_gestionar;
      const aviso = buscar('#actas-catalogo-estado');
      aviso.textContent = !opciones.puede_gestionar ? 'Puedes consultar las actas. No tienes permiso para modificarlas en esta organización.'
        : !opciones.planes.length ? 'Registra un plan de intervención para esta organización antes de crear un acta.'
        : !opciones.asistentes.length ? 'No hay usuarios habilitados disponibles para seleccionar como asistentes.' : '';
      aviso.hidden = !aviso.textContent;
      historial(); return true;
    } catch (fallo) { ocultar(); error(fallo); buscar('#actas-recuperacion').hidden = false; return false; }
    finally { ocupar(false); }
  }
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || !catalogo?.puede_gestionar || editando && conflictos.has(editando.id_acta)) return;
    limpiarMensajes();
    const validacion = camposActaSchema.safeParse({
      id_plan: plan.value, id_accion: accion.value, fecha_reunion: fecha.value,
      asistentes: [...asistentes.selectedOptions].map(o => o.value), asistentes_externos: texto('#actas-asistentes-externos'),
      objetivo: texto('#actas-objetivo'), observaciones: texto('#actas-observaciones'),
    });
    if (!validacion.success || fecha.value > hoy()) {
      if (!validacion.success) for (const issue of validacion.error.issues) errorCampo(String(issue.path[0]),issue.message);
      if (fecha.value > hoy()) errorCampo('fecha_reunion','La fecha no puede ser posterior a hoy.');
      formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return;
    }
    const borradores = editando ? [] : compromisos ? compromisos.obtener() : [];
    if (borradores === null) return;
    const eraEdicion = !!editando;
    ocupar(true); guardar.textContent = 'Guardando…';
    try {
      const entrada = { campos: validacion.data, compromisos: borradores };
      const guardada = editando ? await servicio.actualizar(org,editando.id_acta,editando.version,entrada) : await servicio.crear(org,entrada);
      registros = [...registros.filter(a => a.id_acta !== guardada.id_acta),guardada];
      historial();
      const mensaje = buscar('#actas-mensaje'); mensaje.className = 'rounded-lg bg-success/10 p-4 text-success';
      mensaje.textContent = eraEdicion ? 'El acta se actualizó correctamente.' : 'El acta se registró correctamente.'; mensaje.hidden = false;
      window.dispatchEvent(new CustomEvent('actas:guardadas', { detail: { org, id: guardada.id_acta } }));
    } catch (fallo) {
      if (fallo instanceof ApiError && ['CONFLICTO_CONCURRENCIA','NO_ENCONTRADA'].includes(fallo.code)) {
        if (editando) conflictos.add(editando.id_acta);
        buscar('#actas-recuperacion').hidden = false;
      }
      error(fallo);
    } finally { ocupar(false); guardar.textContent = editando ? 'Guardar cambios' : 'Guardar acta'; }
  });
  nueva.addEventListener('click', () => abrirFormulario());
  editar.addEventListener('click', () => { if (actual) abrirFormulario(actual); });
  buscar('#actas-cancelar').addEventListener('click', () => { if (!ocupado) { limpiarMensajes(); if (editando) detalle(editando); else historial(); ocupar(false); } });
  buscar('#actas-volver').addEventListener('click', () => { if (!ocupado) { limpiarMensajes(); historial(); } });
  buscar('#actas-recargar').addEventListener('click', () => void cargar());
  window.addEventListener('compromisos:abrir-acta', async evento => {
    const datos = (evento as CustomEvent<{ id: string; org: string }>).detail;
    if (datos.org === org && await cargar()) await consultarDetalle(datos.id);
  });
  if (await cargar()) {
    const id = new URLSearchParams(location.search).get('acta');
    if (id) { document.querySelector<HTMLButtonElement>('[data-tab="actas"]')?.click(); await consultarDetalle(id); }
  }
}
