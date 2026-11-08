import { ApiError } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteEvidencias } from './cliente';
import { confirmar } from '../ui/confirmar';
import { DECLARACION_RETIRADA, consentimientoOtorgado, datosSchema, declaracion, edicionSchema, personasDesde, tipoArchivo, type Cambios, type Evidencia } from './modelo';
import { crearTarjetaRegistro } from '../ui/registro';

export function iniciarEvidencias() {
  const nodo = document.querySelector<HTMLElement>('#evidencias-accion');
  if (!nodo) return;
  const raiz: HTMLElement = nodo, accion = raiz.dataset.accion!;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#ev-${id}`)!;
  const form = q<HTMLFormElement>('form'), archivo = q<HTMLInputElement>('archivo');
  const dialogo = q<HTMLDialogElement>('detalle');
  let evidenciaAbierta: string | null = null, focoAlCerrar: HTMLElement | null = null;
  const cliente = crearClienteEvidencias(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  });
  let ocupado = false, iniciado = false, habilitado = false, incierto = false;
  let registros: Evidencia[] = [], seleccion: Evidencia | null = null, reserva: Evidencia | null = null, editando: Evidencia | null = null;
  let publicarAlCompletar = false;
  const valor = (id: string) => q<HTMLInputElement>(id).value;
  const marcado = (id: string) => q<HTMLInputElement>(id).checked;
  function bloquear(estado: boolean, mensaje = '') {
    ocupado = estado; raiz.setAttribute('aria-busy', String(estado));
    q('carga').hidden = !estado; q('carga').textContent = mensaje;
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = estado && b.id !== 'ev-detalle-cerrar'; });
    q<HTMLFieldSetElement>('campos').disabled = estado || !habilitado;
    q<HTMLButtonElement>('guardar').disabled = estado || incierto;
    q<HTMLButtonElement>('nueva').disabled = estado || !habilitado;
    if (!estado && seleccion) controles();
  }
  // Igual que en Actas: el listado es la vista principal y el formulario se abre con «Agregar evidencia».
  function vista(formulario: boolean) {
    q('vista-lista').hidden = formulario; q('vista-form').hidden = !formulario; q('nueva').hidden = formulario;
  }
  function moverMensajes(alDetalle: boolean) {
    q(alDetalle ? 'detalle-mensajes' : 'mensajes').append(q('carga'), q('error'), q('exito'));
  }
  q('detalle-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => {
    moverMensajes(false);
    const destino = focoAlCerrar ?? raiz.querySelector<HTMLButtonElement>(`[data-evidencia-id="${evidenciaAbierta}"]`);
    destino?.focus(); focoAlCerrar = null;
  });
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
    if (id === 'consentimiento' || id === 'tutor') input.parentElement!.after(error);
    else if (id === 'publicable') input.closest('label')!.after(error);
    else input.after(error);
  }
  const estadoCarga = (e: Evidencia) => ({ reservado: 'Carga pendiente', disponible: 'Archivo disponible', fallido: 'Carga fallida' })[e.estado_carga];
  const estadoPublicacion = (e: Evidencia) => ({ no_publicada: 'Sin publicar', publicada: 'Publicada', retirada: 'Retirada' })[e.estado_publicacion];
  const fecha = (f?: string | null) => f && !Number.isNaN(Date.parse(f)) ? new Date(f).toLocaleString('es-CL') : 'No disponible';
  function render() {
    q('cantidad').textContent = `${registros.length} ${registros.length === 1 ? 'archivo registrado' : 'archivos registrados'}`;
    q('vacio').hidden = registros.length > 0; q('lista').replaceChildren();
    for (const item of registros) {
      const tipo = document.createElement('span'); tipo.setAttribute('aria-hidden', 'true');
      tipo.className = 'text-[11px] font-bold uppercase';
      tipo.textContent = (item.nombre_original.split('.').pop() ?? '').slice(0, 4) || 'doc';
      const tonoCarga = ({ reservado: 'amarillo', disponible: 'verde', fallido: 'rosado' } as const)[item.estado_carga];
      const tonoPublicacion = item.estado_publicacion === 'publicada' ? 'morado' : 'neutro';
      q('lista').append(crearTarjetaRegistro({
        acento: item.estado_carga === 'fallido' ? 'rosado' : item.estado_carga === 'reservado' ? 'amarillo' : 'morado',
        media: tipo,
        contexto: `${item.origen} · ${fecha(item.incorporado_at)}`,
        titulo: item.nombre_original,
        resumen: item.descripcion,
        insignias: [{ texto: estadoCarga(item), tono: tonoCarga }, { texto: estadoPublicacion(item), tono: tonoPublicacion }],
        accion: {
          texto: 'Ver detalle',
          etiquetaAccesible: `Ver detalle de ${item.nombre_original}`,
          atributos: { 'data-evidencia-id': item.id_evidencia, 'aria-haspopup': 'dialog', 'aria-controls': 'ev-detalle' },
          alPulsar: () => consultar(item),
        },
      }));
    }
  }
  function actualizar(item: Evidencia) {
    const i = registros.findIndex(r => r.id_evidencia === item.id_evidencia);
    if (i === -1) registros.unshift(item); else registros[i] = item;
    render();
  }
  function controles() {
    if (!seleccion) return;
    q('detalle-acciones').hidden = false;
    q('descargar').hidden = seleccion.estado_carga !== 'disponible';
    q('reintentar').hidden = seleccion.estado_carga !== 'reservado';
    q('sin-consentimiento').hidden = seleccion.consentimiento_declarado === true;
  }
  function detalle(item: Evidencia) {
    seleccion = item; q('detalle-titulo').textContent = item.nombre_original;
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
    if (ocupado) return; limpiar(); seleccion = null; evidenciaAbierta = item.id_evidencia;
    q('detalle-titulo').textContent = item.nombre_original; q('datos').replaceChildren(); q('declaracion').textContent = '';
    q('detalle-acciones').hidden = true; q('sin-consentimiento').hidden = true;
    moverMensajes(true); dialogo.showModal(); bloquear(true, 'Consultando evidencia…'); q('detalle-titulo').focus();
    try { const r = await cliente.obtener(accion, item.id_evidencia); actualizar(r); detalle(r); }
    catch (error) { fallo(error); } finally { bloquear(false); }
  }
  function reset() {
    reserva = null; editando = null; publicarAlCompletar = false; form.reset(); q('metadatos').hidden = false; q('pendiente').hidden = true;
    q('paso-archivo').hidden = false; q('edicion-archivo').hidden = true; q('edicion-consentimiento').hidden = true;
    q<HTMLInputElement>('publicable').disabled = false;
    q('publicable-ayuda').textContent = 'Se marcará como publicada solo después de completar la carga. Si no lo marcas, queda sin publicar.';
    q('form-titulo').textContent = 'Adjuntar evidencia'; q('guardar-texto').textContent = 'Guardar evidencia';
    q('form-ayuda').textContent = 'Los campos con * son obligatorios. El archivo queda vinculado a esta acción.';
    personas();
  }
  function prepararEdicion(item: Evidencia) {
    reset(); editando = item; vista(true);
    q('paso-archivo').hidden = true; q('edicion-archivo').hidden = false; q('edicion-nombre').textContent = item.nombre_original;
    q('edicion-consentimiento').hidden = false;
    q('form-titulo').textContent = 'Editar evidencia'; q('guardar-texto').textContent = 'Guardar cambios';
    q('form-ayuda').textContent = 'Modifica la información, el consentimiento o la publicación de esta evidencia.';
    q<HTMLInputElement>('origen').value = item.origen; q<HTMLTextAreaElement>('descripcion').value = item.descripcion;
    const eleccion = personasDesde(item);
    q<HTMLSelectElement>('personas').value = eleccion; personas();
    q<HTMLInputElement>('consentimiento').checked = eleccion === 'adultos' || eleccion === 'menores';
    q<HTMLInputElement>('tutor').checked = eleccion === 'menores';
    const publicable = q<HTMLInputElement>('publicable');
    publicable.checked = item.estado_publicacion === 'publicada';
    publicable.disabled = item.estado_carga !== 'disponible';
    q('publicable-ayuda').textContent = item.estado_carga !== 'disponible'
      ? 'Podrás publicarla cuando se complete la carga del archivo.'
      : 'Si la desmarcas, la evidencia publicada se retira de la publicación.';
    q<HTMLInputElement>('origen').focus();
  }
  async function guardarEdicion(item: Evidencia) {
    const datos = edicionSchema.safeParse({ origen: valor('origen'), descripcion: valor('descripcion'), personas: valor('personas'),
      consentimiento: marcado('consentimiento'), tutor: marcado('tutor'), publicable: marcado('publicable') });
    if (!datos.success) {
      for (const issue of datos.error.issues) errorCampo(String(issue.path[0]), issue.message);
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return;
    }
    const d = datos.data, cambios: Cambios = {}, resumen: string[] = [];
    if (d.origen !== item.origen) { cambios.origen = d.origen; resumen.push('Origen'); }
    if (d.descripcion !== item.descripcion) { cambios.descripcion = d.descripcion; resumen.push('Descripción'); }
    let retiraConsentimiento = false;
    if (consentimientoOtorgado(d)) {
      const nueva = declaracion({ ...d, publicable: false });
      if (item.consentimiento_declarado !== true || nueva.declaracion_consentimiento !== item.declaracion_consentimiento) { cambios.consentimiento = nueva; resumen.push('Consentimiento'); }
    } else if (item.consentimiento_declarado !== false) {
      cambios.consentimiento = { consentimiento_declarado: false, declaracion_consentimiento: DECLARACION_RETIRADA };
      resumen.push('Consentimiento (se retira)'); retiraConsentimiento = true;
    }
    let retiraPublicacion = false;
    if (d.publicable && item.estado_publicacion !== 'publicada') { cambios.estado_publicacion = 'publicada'; resumen.push('Publicación (se publica)'); }
    if (!d.publicable && item.estado_publicacion === 'publicada') { cambios.estado_publicacion = 'retirada'; resumen.push('Publicación (se retira)'); retiraPublicacion = true; }
    if (!resumen.length) { reset(); vista(false); q('exito').textContent = 'No había cambios que guardar.'; q('exito').hidden = false; return; }
    const delicado = retiraConsentimiento || retiraPublicacion;
    const ok = await confirmar({
      titulo: '¿Guardar los cambios de esta evidencia?',
      mensaje: `Se actualizará «${item.nombre_original}».\nCambios: ${resumen.join(', ')}.`,
      aviso: delicado ? 'La evidencia dejará de estar publicada. Revisa la información antes de confirmar.' : 'Esta operación modificará los registros del sistema. Revisa la información antes de confirmar.',
      confirmar: 'Guardar cambios', tono: delicado ? 'peligro' : 'normal',
    });
    if (!ok) return;
    bloquear(true, 'Guardando cambios…');
    try {
      const r = await cliente.actualizar(item, cambios); actualizar(r); reset(); vista(false);
      q('exito').textContent = 'Evidencia actualizada correctamente.'; q('exito').hidden = false;
    } catch (error) { fallo(error); } finally { bloquear(false); }
  }
  async function cargar() {
    if (ocupado) return; limpiar(); bloquear(true, 'Cargando evidencias…');
    try {
      registros = await cliente.listar(accion); habilitado = true; incierto = false; render();
      if (seleccion) { const actual = registros.find(r => r.id_evidencia === seleccion!.id_evidencia); if (actual) detalle(actual); else { seleccion = null; dialogo.close(); } }
    } catch (error) {
      habilitado = false;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        registros = []; seleccion = null; q('lista').replaceChildren(); dialogo.close(); q('vacio').hidden = true;
      }
      fallo(error);
    } finally { bloquear(false); }
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
    if (editando) { await guardarEdicion(editando); return; }
    const file = archivo.files?.[0]; let mime = '';
    try { if (!file) throw new Error('Selecciona un archivo.'); mime = tipoArchivo(file); }
    catch (error) { errorCampo('archivo', (error as Error).message); }
    const datos = datosSchema.safeParse({ origen: valor('origen'), descripcion: valor('descripcion'), personas: valor('personas'),
      consentimiento: marcado('consentimiento'), tutor: marcado('tutor'), publicable: marcado('publicable') });
    if (!reserva && !datos.success) for (const issue of datos.error.issues) errorCampo(String(issue.path[0]), issue.message);
    if (form.querySelector('[aria-invalid="true"]')) { form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
    if (!file || (!reserva && !datos.success)) return;
    if (!reserva && datos.success) publicarAlCompletar = datos.data.publicable;
    const publicar = publicarAlCompletar;
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
      let resultado = reserva; actualizar(resultado); detalle(resultado); reset(); vista(false);
      if (publicar) { q('carga').textContent = 'Actualizando publicación…'; resultado = await cliente.actualizar(resultado, { estado_publicacion: 'publicada' }); actualizar(resultado); detalle(resultado); }
      q('exito').textContent = publicar ? 'Archivo guardado y marcado como publicado.' : 'Archivo guardado correctamente. Puedes consultar su estado de publicación en el detalle.';
      q('exito').hidden = false;
    } catch (error) {
      if (creando && error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.code === 'RESPUESTA_INVALIDA')) {
        incierto = true; fallo(error, 'No se pudo confirmar el registro. Recarga la página y revisa si aparece antes de intentar crear otra. ');
      } else if (cargada) fallo(error, 'El archivo se guardó, pero no se pudo confirmar la publicación. Recarga la página para comprobar su estado. ');
      else {
        if (reserva) prepararReintento(reserva, false);
        fallo(error, reserva ? 'El registro se conserva; no crees otra evidencia. Puedes reintentar la carga. ' : '');
      }
    } finally { bloquear(false); }
  });
  function prepararReintento(item: Evidencia, limpiarArchivo = true) {
    reserva = item; vista(true); q('metadatos').hidden = true; q('pendiente').hidden = false;
    q('pendiente').textContent = `Completa la carga de «${item.nombre_original}». El origen, la descripción y el consentimiento ya están registrados. Selecciona el mismo archivo.`;
    q('form-titulo').textContent = 'Completar carga pendiente'; q('guardar-texto').textContent = 'Reintentar carga';
    if (limpiarArchivo) archivo.value = ''; archivo.focus();
  }
  q('reintentar').addEventListener('click', () => {
    if (!ocupado && seleccion) {
      limpiar(); publicarAlCompletar = false; focoAlCerrar = archivo; dialogo.close(); prepararReintento(seleccion);
    }
  });
  q('cancelar').addEventListener('click', () => {
    if (ocupado) return; const pendiente = !!reserva; limpiar(); reset(); vista(false); q('nueva').focus();
    if (pendiente) { q('exito').textContent = 'Se cerró el formulario. El registro pendiente se conserva y puedes completar su carga desde el listado.'; q('exito').hidden = false; }
  });
  q('nueva').addEventListener('click', () => {
    if (ocupado || !habilitado) return; limpiar(); reset(); vista(true); archivo.focus();
  });
  q('editar').addEventListener('click', () => {
    if (ocupado || !seleccion) return;
    const item = seleccion; limpiar(); focoAlCerrar = q('origen'); dialogo.close(); prepararEdicion(item);
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
