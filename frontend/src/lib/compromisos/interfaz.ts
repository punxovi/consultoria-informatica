import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteCompromisos } from './cliente';
import { guardarCompromisoSchema, vencido, type ActaOrigen, type Compromiso } from './modelo';

export function iniciarCompromisos() {
  const encontrada = document.querySelector<HTMLElement>('#compromisos');
  if (!encontrada || encontrada.dataset.iniciado) return;
  encontrada.dataset.iniciado = 'true';
  const raiz: HTMLElement = encontrada;
  const org = raiz.dataset.organizacion!;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#comp-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const servicio = crearClienteCompromisos(createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'), async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
  let ocupado = false, iniciado = false, cargado = false, puedeGestionar = false;
  const conflictos = new Set<string>();
  const enConflicto = () => !!actual && conflictos.has(actual.id_compromiso);
  let actas: ActaOrigen[] = [], actual: Compromiso | null = null;
  function ocupar(valor: boolean) {
    ocupado = valor;
    raiz.setAttribute('aria-busy', String(valor));
    q('carga').hidden = !valor;
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = valor; });
    q<HTMLFieldSetElement>('campos').disabled = valor;
    if (!valor) {
      q<HTMLButtonElement>('nuevo').disabled = !cargado || !puedeGestionar || !actas.length;
      q<HTMLButtonElement>('guardar').disabled = !puedeGestionar || enConflicto();
      q<HTMLButtonElement>('editar').disabled = !puedeGestionar;
    }
  }
  function limpiar() {
    q('error').hidden = q('exito').hidden = true;
    form.querySelectorAll('[data-comp-error]').forEach(n => n.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach(n => {
      n.setAttribute('aria-invalid', 'false');
      const hint = document.getElementById(`${n.id}-hint`);
      if (hint) n.setAttribute('aria-describedby', hint.id); else n.removeAttribute('aria-describedby');
    });
  }
  function error(fallo: unknown) {
    q('error').textContent = fallo instanceof Error ? fallo.message : 'No fue posible completar la operación. Inténtalo nuevamente.';
    q('error').hidden = false;
  }
  function vista(nombre: 'listado' | 'detalle' | 'form') {
    for (const id of ['listado', 'detalle', 'form']) q(id).hidden = id !== nombre;
    q('nuevo').hidden = nombre !== 'listado' || !puedeGestionar;
  }
  function texto(nodo: HTMLElement, etiqueta: string, valor: string) {
    const grupo = document.createElement('div');
    const dt = document.createElement('dt'); dt.className = 'text-sm text-neutral-600'; dt.textContent = etiqueta;
    const dd = document.createElement('dd'); dd.className = 'whitespace-pre-wrap break-words font-medium'; dd.textContent = valor || 'Sin información';
    grupo.append(dt, dd); nodo.append(grupo);
  }
  function fecha(valor: string | null) { return valor ? valor.slice(0, 10).split('-').reverse().join('/') : '—'; }
  function listar(registros: Compromiso[]) {
    q('lista').replaceChildren();
    q('vacio').hidden = registros.length > 0;
    q('sin-actas').hidden = actas.length > 0 || !puedeGestionar;
    for (const r of registros) {
      const card = document.createElement('article');
      card.className = `min-w-0 rounded-xl border bg-white p-5 ${vencido(r) ? 'border-danger' : 'border-neutral-200'}`;
      const titulo = document.createElement('h3'); titulo.className = 'font-semibold break-words whitespace-pre-wrap'; titulo.textContent = r.descripcion;
      const datos = document.createElement('dl'); datos.className = 'my-4 space-y-2';
      texto(datos, 'Responsable', r.responsable_nombre);
      texto(datos, 'Fecha límite', fecha(r.fecha_limite));
      texto(datos, 'Estado', `${r.estado === 'cumplido' ? 'Cumplido' : 'Pendiente'}${vencido(r) ? ' · Vencido' : ''}`);
      const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'min-h-[48px] text-primary underline'; boton.textContent = 'Ver detalle';
      boton.addEventListener('click', () => consultar(r.id_compromiso));
      card.append(titulo, datos, boton); q('lista').append(card);
    }
    vista('listado');
  }
  async function cargar(confirmar = true) {
    if (ocupado) return;
    if (confirmar && !form.hidden && !window.confirm('Se descartarán los cambios del formulario. ¿Recargar?')) return;
    iniciado = true; cargado = false; limpiar(); ocupar(true);
    for (const id of ['listado','detalle','form']) q(id).hidden = true;
    try {
      const [registros, catalogo] = await Promise.all([servicio.listar(org), servicio.catalogo(org)]);
      actas = catalogo.actas; puedeGestionar = catalogo.puede_gestionar;
      q('permisos').hidden = puedeGestionar;
      cargado = true; conflictos.clear(); actual = null; listar(registros);
    } catch (fallo) { iniciado = false; error(fallo); }
    finally { ocupar(false); }
  }
  function detalle(r: Compromiso) {
    actual = r; q('datos').replaceChildren();
    const campos: [string, string][] = [['Acuerdo', r.descripcion], ['Responsable', r.responsable_nombre], ['Contacto', r.responsable_contacto],
      ['Fecha límite', fecha(r.fecha_limite)], ['Estado', `${r.estado === 'cumplido' ? 'Cumplido' : 'Pendiente'}${vencido(r) ? ' · Vencido' : ''}`],
      ['Registrado', fecha(r.created_at)], ['Última actualización', fecha(r.updated_at)], ['Cumplido el', fecha(r.cumplido_at)], ['Observaciones', r.observaciones]];
    campos.forEach(([k, v]) => texto(q('datos'), k, v));
    const origen = actas.find(a => a.id_acta === r.id_acta);
    const enlace = q<HTMLAnchorElement>('origen');
    enlace.textContent = origen?.nombre ?? 'Ver acta de origen';
    enlace.href = `/organizaciones/${encodeURIComponent(org)}?acta=${encodeURIComponent(r.id_acta)}#tab-actas`;
    q('editar').hidden = !puedeGestionar;
    const accion = q<HTMLAnchorElement>('accion'); accion.hidden = !origen?.id_plan || !origen?.id_accion;
    if (!accion.hidden) accion.href = `/planes/${encodeURIComponent(origen!.id_plan!)}/acciones/${encodeURIComponent(origen!.id_accion!)}`;
    vista('detalle');
  }
  async function consultar(id: string) {
    if (ocupado) return;
    limpiar(); ocupar(true);
    try { detalle(await servicio.obtener(org, id)); } catch (fallo) { error(fallo); } finally { ocupar(false); }
  }
  function editar(nuevo = false) {
    if (ocupado || !cargado || !puedeGestionar) return;
    limpiar(); if (nuevo) actual = null;
    form.reset();
    q('form-titulo').textContent = actual ? 'Editar compromiso' : 'Registrar compromiso';
    const select = q<HTMLSelectElement>('acta'); select.replaceChildren(new Option('Selecciona un acta', ''));
    actas.forEach(a => select.add(new Option(a.nombre, a.id_acta)));
    if (actual && !actas.some(a => a.id_acta === actual!.id_acta)) select.add(new Option('Acta de origen', actual.id_acta));
    for (const nombre of Object.keys(guardarCompromisoSchema.shape)) campo(nombre).value = actual ? String(actual[nombre as keyof Compromiso]) : nombre === 'estado' ? 'pendiente' : '';
    select.disabled = !!actual;
    campo('estado').disabled = !actual;
    q<HTMLButtonElement>('guardar').disabled = enConflicto();
    if (enConflicto()) error(new Error('Recarga los datos antes de guardar: el registro cambió o ya no está disponible.'));
    vista('form'); (actual ? campo('descripcion') : select).focus();
  }
  form.addEventListener('submit', async evento => {
    evento.preventDefault(); if (ocupado || !puedeGestionar || enConflicto()) return;
    limpiar();
    const valores = Object.fromEntries(Object.keys(guardarCompromisoSchema.shape).map(n => [n, campo(n).value]));
    const datos = guardarCompromisoSchema.safeParse(valores);
    if (!datos.success) {
      for (const issue of datos.error.issues) {
        const control = campo(String(issue.path[0]));
        if (control.getAttribute('aria-invalid') === 'true') continue;
        control.setAttribute('aria-invalid', 'true');
        const mensaje = document.createElement('p'); mensaje.id = `${control.id}-error`; mensaje.dataset.compError = ''; mensaje.className = 'text-sm text-danger'; mensaje.textContent = issue.message;
        control.setAttribute('aria-describedby', `${document.getElementById(`${control.id}-hint`) ? `${control.id}-hint ` : ''}${mensaje.id}`); control.after(mensaje);
      }
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return;
    }
    ocupar(true);
    try {
      const eraEdicion=!!actual;
      const guardado = actual ? await servicio.actualizar(org, actual.id_compromiso, actual.version, datos.data) : await servicio.crear(org, datos.data);
      detalle(guardado);
      q('exito').textContent = eraEdicion ? 'Compromiso actualizado correctamente.' : 'Compromiso guardado correctamente.';
      q('exito').hidden = false;
    } catch (fallo) {
      if (actual && fallo instanceof ApiError && (fallo.code === 'CONFLICTO_CONCURRENCIA' || fallo.status === 404)) conflictos.add(actual.id_compromiso);
      error(fallo); q('error').focus();
    } finally { ocupar(false); }
  });
  q('nuevo').addEventListener('click', () => editar(true));
  q('editar').addEventListener('click', () => editar());
  q('cancelar').addEventListener('click', () => { if (ocupado) return; limpiar(); if (actual) detalle(actual); else cargar(false); });
  q('volver').addEventListener('click', () => cargar(false));
  q('recargar').addEventListener('click', () => cargar());
  window.addEventListener('actas:guardadas', evento => {
    if ((evento as CustomEvent<{org:string}>).detail.org === org && form.hidden) iniciado = false;
  });
  document.querySelector('[data-tab="compromisos"]')?.addEventListener('click', () => {
    if (!iniciado && !ocupado) void cargar(false);
  });
}
