import { ApiError } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteEvidencias } from './cliente';
import { datosSchema, declaracion, tipoArchivo, type Evidencia } from './modelo';

export function iniciarEvidencias() {
  const nodo = document.querySelector<HTMLElement>('#evidencias-accion');
  if (!nodo) return;
  const raiz: HTMLElement = nodo, accion = raiz.dataset.accion!;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#ev-${id}`)!;
  const form = q<HTMLFormElement>('form'), archivo = q<HTMLInputElement>('archivo');
  const cliente = crearClienteEvidencias(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
  let ocupado = false, iniciado = false, habilitado = false, incierto = false;
  let registros: Evidencia[] = [], seleccion: Evidencia | null = null, reserva: Evidencia | null = null;
  const valor = (id: string) => q<HTMLInputElement>(id).value;
  const marcado = (id: string) => q<HTMLInputElement>(id).checked;
  function bloquear(estado: boolean, mensaje = '') {
    ocupado = estado; raiz.setAttribute('aria-busy', String(estado));
    q('carga').hidden = !estado; q('carga').textContent = mensaje;
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = estado; });
    q<HTMLFieldSetElement>('campos').disabled = estado || !habilitado;
    q<HTMLButtonElement>('guardar').disabled = estado || incierto;
    if (!estado && seleccion) controles();
  }
  function limpiar() {
    q('error').hidden = q('exito').hidden = true;
    form.querySelectorAll('[data-error-evidencia]').forEach(n => n.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach(n => {
      n.setAttribute('aria-invalid', 'false');
      if (n.id === 'ev-archivo') n.setAttribute('aria-describedby', 'ev-archivo-ayuda'); else n.removeAttribute('aria-describedby');
    });
  }
  function fallo(error: unknown, prefijo = '') {
    q('error').textContent = prefijo + (error instanceof Error ? error.message : 'No fue posible completar la operación.');
    q('error').hidden = false; q('error').focus();
  }
  function errorCampo(id: string, mensaje: string) {
    const input = q(id); if (input.getAttribute('aria-invalid') === 'true') return;
    const error = document.createElement('p'); error.id = `${input.id}-error`; error.dataset.errorEvidencia = ''; error.className = 'mt-2 text-sm text-red-800'; error.textContent = mensaje;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `${id === 'archivo' ? 'ev-archivo-ayuda ' : ''}${error.id}`);
    if (id === 'consentimiento' || id === 'tutor') input.parentElement!.after(error); else input.after(error);
  }
  const estadoCarga = (e: Evidencia) => ({ reservado: 'Carga pendiente', disponible: 'Archivo disponible', fallido: 'Carga fallida' })[e.estado_carga];
  const estadoPublicacion = (e: Evidencia) => ({ no_publicada: 'Sin publicar', publicada: 'Publicada', retirada: 'Retirada' })[e.estado_publicacion];
  const fecha = (f?: string | null) => f && !Number.isNaN(Date.parse(f)) ? new Date(f).toLocaleString('es-CL') : 'No disponible';
  function render() {
    q('cantidad').textContent = `${registros.length} ${registros.length === 1 ? 'archivo' : 'archivos'}`;
    q('vacio').hidden = registros.length > 0; q('lista').replaceChildren();
    for (const item of registros) {
      const card = document.createElement('article'); card.className = 'min-w-0 rounded-lg border border-neutral-200 p-4';
      const nombre = document.createElement('h4'); nombre.className = 'break-words text-lg font-semibold'; nombre.textContent = item.nombre_original;
      const descripcion = document.createElement('p'); descripcion.className = 'mt-2 line-clamp-2 break-words text-neutral-700'; descripcion.textContent = item.descripcion;
      const estado = document.createElement('p'); estado.className = 'my-3 text-sm font-medium text-primary'; estado.textContent = `${estadoCarga(item)} · ${estadoPublicacion(item)}`;
      const boton = document.createElement('button'); boton.type = 'button'; boton.className = 'min-h-[48px] font-medium text-primary underline'; boton.textContent = 'Ver evidencia';
      boton.addEventListener('click', () => consultar(item)); card.append(nombre, descripcion, estado, boton); q('lista').append(card);
    }
  }
  function actualizar(item: Evidencia) {
    const i = registros.findIndex(r => r.id_evidencia === item.id_evidencia);
    if (i === -1) registros.unshift(item); else registros[i] = item;
    render();
  }
  function controles() {
    if (!seleccion) return;
    q('descargar').hidden = seleccion.estado_carga !== 'disponible';
    q('reintentar').hidden = seleccion.estado_carga !== 'reservado';
    q('publicar').hidden = seleccion.estado_carga !== 'disponible';
    q('publicar').textContent = seleccion.estado_publicacion === 'publicada' ? 'Retirar publicación' : 'Permitir publicación';
    q<HTMLButtonElement>('publicar').disabled = ocupado || (seleccion.estado_publicacion !== 'publicada' && seleccion.consentimiento_declarado !== true);
    q('revocar').hidden = seleccion.consentimiento_declarado !== true;
    q('sin-consentimiento').hidden = seleccion.consentimiento_declarado === true;
  }
  function detalle(item: Evidencia) {
    seleccion = item; q('detalle').hidden = false; q('detalle-titulo').textContent = item.nombre_original;
    q('datos').replaceChildren();
    const datos: [string, string][] = [['Origen', item.origen], ['Descripción', item.descripcion], ['Incorporada', fecha(item.incorporado_at)],
      ['Usuario responsable (ID)', item.incorporado_por || 'No disponible'], ['Carga', estadoCarga(item)], ['Publicación', estadoPublicacion(item)],
      ['Tamaño', `${(item.tamano_bytes / 1024 / 1024).toFixed(2)} MiB`], ['Tipo', item.mime_type],
      ['Consentimiento registrado', fecha(item.consentimiento_at)], ['Usuario de declaración (ID)', item.consentimiento_por || 'No disponible']];
    for (const [etiqueta, contenido] of datos) {
      const div = document.createElement('div'); div.className = 'min-w-0';
      const dt = document.createElement('dt'); dt.className = 'text-sm font-medium text-neutral-700'; dt.textContent = etiqueta;
      const dd = document.createElement('dd'); dd.className = 'mt-1 whitespace-pre-wrap break-words'; dd.textContent = contenido;
      div.append(dt, dd); q('datos').append(div);
    }
    q('declaracion').textContent = item.declaracion_consentimiento || 'Sin declaración de consentimiento registrada.';
    controles();
  }
  async function consultar(item: Evidencia) {
    if (ocupado) return; limpiar(); bloquear(true, 'Consultando evidencia…');
    try { const r = await cliente.obtener(accion, item.id_evidencia); actualizar(r); detalle(r); q('detalle-titulo').focus(); }
    catch (error) { fallo(error); } finally { bloquear(false); }
  }
  function reset() {
    reserva = null; form.reset(); q('metadatos').hidden = false; q('pendiente').hidden = true;
    q('form-titulo').textContent = 'Adjuntar evidencia'; q('guardar').textContent = 'Guardar evidencia'; personas();
  }
  async function cargar() {
    if (ocupado) return; limpiar(); bloquear(true, 'Cargando evidencias…');
    try {
      registros = await cliente.listar(accion); habilitado = true; incierto = false; render();
      if (seleccion) { const actual = registros.find(r => r.id_evidencia === seleccion!.id_evidencia); if (actual) detalle(actual); else { seleccion = null; q('detalle').hidden = true; } }
      else if (registros.length) detalle(registros[0]);
    } catch (error) { fallo(error); } finally { bloquear(false); }
  }
  function personas() {
    const eleccion = valor('personas');
    q('consentimiento-grupo').hidden = eleccion !== 'adultos' && eleccion !== 'menores';
    q('tutor-grupo').hidden = eleccion !== 'menores';
    if (eleccion === 'sin_personas' || !eleccion) q<HTMLInputElement>('consentimiento').checked = false;
    if (eleccion !== 'menores') q<HTMLInputElement>('tutor').checked = false;
  }
  q('personas').addEventListener('change', personas);
  form.addEventListener('submit', async evento => {
    evento.preventDefault(); if (ocupado || incierto || !habilitado) return; limpiar();
    const file = archivo.files?.[0]; let mime = '';
    try { if (!file) throw new Error('Selecciona un archivo.'); mime = tipoArchivo(file); }
    catch (error) { errorCampo('archivo', (error as Error).message); }
    const datos = datosSchema.safeParse({ origen: valor('origen'), descripcion: valor('descripcion'), personas: valor('personas'),
      consentimiento: marcado('consentimiento'), tutor: marcado('tutor'), publicable: marcado('publicable') });
    if (!reserva && !datos.success) for (const issue of datos.error.issues) errorCampo(String(issue.path[0]), issue.message);
    if (form.querySelector('[aria-invalid="true"]')) { form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
    if (!file || (!reserva && !datos.success)) return;
    const publicar = !reserva && datos.success && datos.data.publicable;
    let cargada = false, creando = false;
    bloquear(true, reserva ? 'Reintentando carga…' : 'Registrando evidencia…');
    try {
      if (!reserva && datos.success) {
        creando = true;
        reserva = await cliente.reservar({ id_accion: accion, origen: datos.data.origen, descripcion: datos.data.descripcion,
          nombre_original: file.name, mime_type: mime, tamano_bytes: file.size, consentimiento: declaracion(datos.data) });
        creando = false; actualizar(reserva);
      } else if (reserva) reserva = await cliente.obtener(accion, reserva.id_evidencia);
      if (!reserva) throw new Error('No se pudo registrar la evidencia.');
      if (reserva.estado_carga !== 'disponible') {
        if (file.name !== reserva.nombre_original || mime !== reserva.mime_type || file.size !== reserva.tamano_bytes) throw new Error('Selecciona el mismo archivo de la reserva: deben coincidir nombre, tamaño y formato.');
        q('carga').textContent = 'Subiendo archivo…';
        reserva = await cliente.subir(reserva, file);
      }
      cargada = true;
      let resultado = reserva; actualizar(resultado); detalle(resultado); reset();
      if (publicar) { q('carga').textContent = 'Actualizando publicación…'; resultado = await cliente.actualizar(resultado, { estado_publicacion: 'publicada' }); actualizar(resultado); detalle(resultado); }
      q('exito').textContent = publicar ? 'Archivo guardado y marcado como publicado.' : 'Archivo guardado correctamente. Puedes consultar su estado de publicación en el detalle.';
      q('exito').hidden = false;
    } catch (error) {
      if (creando && error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
        incierto = true; fallo(error, 'No se pudo confirmar el registro. Pulsa Actualizar evidencias y revisa si aparece antes de intentar crear otra. ');
      } else if (cargada) fallo(error, 'El archivo se guardó, pero no se pudo confirmar la publicación. Actualiza las evidencias para comprobar su estado. ');
      else {
        if (reserva) prepararReintento(reserva, false);
        fallo(error, reserva ? 'El registro se conserva; no crees otra evidencia. Puedes reintentar la carga. ' : '');
      }
    } finally { bloquear(false); }
  });
  function prepararReintento(item: Evidencia, limpiarArchivo = true) {
    reserva = item; q('metadatos').hidden = true; q('pendiente').hidden = false;
    q('pendiente').textContent = `Completa la carga de «${item.nombre_original}». El origen, la descripción y el consentimiento ya están registrados. Selecciona el mismo archivo.`;
    q('form-titulo').textContent = 'Completar carga pendiente'; q('guardar').textContent = 'Reintentar carga';
    if (limpiarArchivo) archivo.value = ''; archivo.focus();
  }
  q('reintentar').addEventListener('click', () => { if (!ocupado && seleccion) { limpiar(); prepararReintento(seleccion); } });
  q('cancelar').addEventListener('click', () => {
    if (ocupado) return; const pendiente = !!reserva; limpiar(); reset();
    if (pendiente) { q('exito').textContent = 'Se cerró el formulario. El registro pendiente se conserva y puedes completar su carga desde el listado.'; q('exito').hidden = false; }
  });
  q('recargar').addEventListener('click', cargar);
  q('publicar').addEventListener('click', async () => {
    if (ocupado || !seleccion) return;
    const retirar = seleccion.estado_publicacion === 'publicada';
    if (!window.confirm(retirar ? '¿Retirar la publicación de esta evidencia?' : '¿Marcar esta evidencia como publicada? Podrá utilizarse en la publicación institucional.')) return;
    limpiar(); bloquear(true, 'Actualizando publicación…');
    try { const r = await cliente.actualizar(seleccion, { estado_publicacion: retirar ? 'retirada' : 'publicada' }); actualizar(r); detalle(r); q('exito').textContent = retirar ? 'Publicación retirada.' : 'Evidencia marcada como publicada.'; q('exito').hidden = false; }
    catch (error) { fallo(error); } finally { bloquear(false); }
  });
  q('revocar').addEventListener('click', async () => {
    if (ocupado || !seleccion) return;
    const motivo = window.prompt('Indica el motivo de revocación del consentimiento. Si está publicada, también se retirará.');
    if (motivo === null) return;
    limpiar(); if (!motivo.trim() || motivo.trim().length > 5000) { fallo(new Error('Indica un motivo de entre 1 y 5000 caracteres.')); return; }
    bloquear(true, 'Registrando revocación…');
    try {
      const r = await cliente.actualizar(seleccion, { consentimiento: { consentimiento_declarado: false, declaracion_consentimiento: motivo.trim() },
        ...(seleccion.estado_publicacion === 'publicada' ? { estado_publicacion: 'retirada' as const } : {}) });
      actualizar(r); detalle(r); q('exito').textContent = 'Consentimiento revocado. La evidencia no puede publicarse.'; q('exito').hidden = false;
    } catch (error) { fallo(error); } finally { bloquear(false); }
  });
  q('descargar').addEventListener('click', async () => {
    if (ocupado || !seleccion) return; limpiar(); bloquear(true, 'Preparando descarga…');
    try {
      const file = await cliente.descargar(seleccion), url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = seleccion.nombre_original; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { fallo(error); } finally { bloquear(false); }
  });
  const iniciar = () => { if (!iniciado) { iniciado = true; void cargar(); } };
  window.addEventListener('accion:lista-para-evidencias', iniciar);
  if (document.querySelector<HTMLElement>('#accion-detalle')?.dataset.cargada === 'true') iniciar();
}
