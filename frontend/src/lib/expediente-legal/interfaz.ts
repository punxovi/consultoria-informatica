import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteExpediente } from './cliente';
import { camposLegalSchema, documentosVacios, tiposDocumento, validarPdf, type ExpedienteLegal, type GuardarExpediente, type TipoDocumento } from './modelo';

export async function iniciarExpedienteLegal() {
  const raiz = document.querySelector<HTMLElement>('#expediente-legal');
  if (!raiz || raiz.dataset.iniciado === 'true') return;
  raiz.dataset.iniciado = 'true';
  const id = raiz.dataset.organizacion;
  if (!id) throw new Error('No se encontró la organización del expediente legal.');
  const buscar = <T extends HTMLElement = HTMLElement>(selector: string) => raiz.querySelector<T>(selector)!;
  const formulario = buscar<HTMLFormElement>('#legal-form');
  const campos = buscar<HTMLFieldSetElement>('#legal-campos');
  const carga = buscar('#legal-carga');
  const error = buscar('#legal-error');
  const confirmacion = buscar('#legal-confirmacion');
  const recarga = buscar('#legal-recarga');
  const guardar = buscar<HTMLButtonElement>('#legal-guardar');
  const estadoDocumento = (tipo: TipoDocumento) => buscar<HTMLSelectElement>(`[data-documento-estado="${tipo}"]`);
  const archivoDocumento = (tipo: TipoDocumento) => buscar<HTMLInputElement>(`[data-documento-pdf="${tipo}"]`);
  let registro: ExpedienteLegal | null = null;
  let ocupado = false;
  let iniciado = false;
  let conflicto = false;
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('expediente') === 'demo';
  const servicio = demo
    ? (await import('./demo')).crearDemoExpediente()
    : crearClienteExpediente(createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'), async () => {
      const { data, error: fallo } = await getSupabaseClient().auth.getSession();
      if (fallo || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
      return data.session.access_token;
    });
  buscar('#legal-demo').hidden = !demo;

  function limpiarErrores() {
    error.hidden = true;
    formulario.querySelectorAll('[data-error-legal]').forEach(nodo => nodo.remove());
    formulario.querySelectorAll('[aria-invalid="true"]').forEach(nodo => {
      nodo.setAttribute('aria-invalid', 'false');
      const descripcion = nodo.getAttribute('aria-describedby')?.split(' ').filter(id => !id.endsWith('-error-legal')).join(' ');
      if (descripcion) nodo.setAttribute('aria-describedby', descripcion); else nodo.removeAttribute('aria-describedby');
    });
  }
  function errorCampo(control: HTMLElement, mensaje: string) {
    if (control.getAttribute('aria-invalid') === 'true') return;
    const texto = document.createElement('p');
    texto.id = `${control.id}-error-legal`;
    texto.dataset.errorLegal = '';
    texto.className = 'mt-1 text-sm text-danger';
    texto.textContent = mensaje;
    control.after(texto);
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), texto.id].filter(Boolean).join(' '));
  }
  function mostrarError(fallo: unknown) {
    error.textContent = fallo instanceof ApiError && (fallo.code === 'RUTA_NO_ENCONTRADA' || fallo.status === 501)
      ? 'El servicio de Expediente Legal todavía no está disponible. No se han guardado cambios.'
      : fallo instanceof Error ? fallo.message : 'No fue posible completar la operación.';
    error.hidden = false;
  }
  function ocupar(valor: boolean, mensaje = '') {
    ocupado = valor;
    campos.disabled = valor;
    raiz.setAttribute('aria-busy', String(valor));
    carga.hidden = !valor;
    buscar('#legal-carga-texto').textContent = mensaje;
    buscar<HTMLButtonElement>('#legal-reintentar').disabled = valor;
    buscar<HTMLButtonElement>('#legal-registrar').disabled = valor;
    buscar<HTMLButtonElement>('#legal-editar').disabled = valor;
    guardar.disabled = valor || conflicto;
  }
  function mostrarResumen() {
    formulario.hidden = true;
    buscar('#legal-vacio').hidden = registro !== null;
    buscar('#legal-resumen').hidden = registro === null;
    if (!registro) return;
    const etiquetas = { si: 'Sí', no: 'No', en_proceso: 'En proceso' };
    const valores = { ...registro, estado_personalidad_juridica: etiquetas[registro.estado_personalidad_juridica],
      fecha_constitucion: registro.fecha_constitucion ? new Date(`${registro.fecha_constitucion}T00:00:00`).toLocaleDateString('es-CL') : '' };
    for (const nodo of raiz!.querySelectorAll<HTMLElement>('[data-legal-resumen]')) {
      nodo.textContent = String(valores[nodo.dataset.legalResumen as keyof typeof valores] || 'Sin información');
    }
    const estados = { pendiente: 'Pendiente', no_aplica: 'No aplica', cargado: demo ? 'Cargado (demostración)' : 'Cargado' };
    const tonos = { pendiente: 'amarillo', no_aplica: 'neutro', cargado: 'verde' } as const;
    for (const doc of registro.documentos) {
      const insignia = buscar(`[data-legal-estado="${doc.tipo}"]`);
      insignia.textContent = estados[doc.estado];
      insignia.className = `registro-insignia registro-insignia--${tonos[doc.estado]}`;
      buscar(`[data-legal-archivo="${doc.tipo}"]`).textContent = doc.nombre_archivo || 'Sin archivo adjunto';
    }
    const fecha = new Date(registro.updated_at);
    buscar('#legal-actualizacion').textContent = Number.isNaN(fecha.getTime()) ? '' : `Última actualización: ${fecha.toLocaleString('es-CL')}`;
  }
  async function conTiempoLimite<T>(operacion: Promise<T>, milisegundos = 15000): Promise<T> {
    let temporizador: number | undefined;
    const limite = new Promise<never>((_, rechazar) => {
      temporizador = window.setTimeout(() => rechazar(new Error('La consulta está tardando más de lo esperado. Comprueba que el servicio esté disponible y vuelve a intentarlo.')), milisegundos);
    });
    try { return await Promise.race([operacion, limite]); }
    finally { if (temporizador !== undefined) window.clearTimeout(temporizador); }
  }

  async function cargar() {
    if (ocupado) return;
    if (!formulario.hidden && !window.confirm('Al recargar se descartarán los cambios del formulario. ¿Continuar?')) return;
    iniciado = true;
    limpiarErrores();
    recarga.hidden = true;
    confirmacion.hidden = true;
    ocupar(true, 'Cargando expediente legal…');
    try {
      registro = await conTiempoLimite(servicio.obtener(id));
      conflicto = false;
      mostrarResumen();
    } catch (fallo) {
      formulario.hidden = true;
      buscar('#legal-vacio').hidden = true;
      buscar('#legal-resumen').hidden = true;
      mostrarError(fallo);
      recarga.hidden = false;
    } finally { ocupar(false); }
  }
  function editar() {
    if (ocupado) return;
    limpiarErrores(); confirmacion.hidden = true;
    formulario.reset(); guardar.disabled = conflicto;
    if (conflicto) mostrarError(new Error('Recarga los datos del servidor antes de guardar nuevos cambios.'));
    buscar('#legal-vacio').hidden = buscar('#legal-resumen').hidden = true;
    buscar('#legal-form-titulo').textContent = registro ? 'Editar antecedentes legales' : 'Registrar antecedentes legales';
    for (const nombre of Object.keys(camposLegalSchema.shape)) {
      const control = formulario.elements.namedItem(nombre) as HTMLInputElement | HTMLSelectElement;
      control.value = registro ? String(registro[nombre as keyof ExpedienteLegal] ?? '') : '';
    }
    for (const doc of registro?.documentos ?? documentosVacios()) {
      const selector = estadoDocumento(doc.tipo);
      selector.value = doc.estado;
      selector.disabled = doc.estado === 'cargado';
      buscar(`[data-documento-actual="${doc.tipo}"]`).textContent = doc.nombre_archivo ? `Archivo registrado: ${doc.nombre_archivo}` : 'Sin archivo registrado';
      buscar(`[data-quitar-seleccion="${doc.tipo}"]`).hidden = true;
    }
    formulario.hidden = false;
    buscar('#legal-personalidad').focus();
  }
  for (const { id: tipo } of tiposDocumento) {
    const input = archivoDocumento(tipo);
    input.addEventListener('change', () => {
      limpiarErrores();
      const archivo = input.files?.[0];
      const mensaje = archivo && validarPdf(archivo);
      if (mensaje) { errorCampo(input, mensaje); input.value = ''; }
      const seleccionado = !!input.files?.length;
      const anterior = registro?.documentos.find(doc => doc.tipo === tipo);
      estadoDocumento(tipo).disabled = seleccionado || anterior?.estado === 'cargado';
      if (seleccionado) estadoDocumento(tipo).value = 'cargado';
      else estadoDocumento(tipo).value = anterior?.estado ?? 'pendiente';
      buscar(`[data-quitar-seleccion="${tipo}"]`).hidden = !seleccionado;
    });
    buscar(`[data-quitar-seleccion="${tipo}"]`).addEventListener('click', () => {
      input.value = ''; input.dispatchEvent(new Event('change'));
    });
  }
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || conflicto) return;
    limpiarErrores();
    const entrada = Object.fromEntries(Object.keys(camposLegalSchema.shape).map(nombre => [nombre, (formulario.elements.namedItem(nombre) as HTMLInputElement).value]));
    const validacion = camposLegalSchema.safeParse(entrada);
    if (!validacion.success) {
      for (const issue of validacion.error.issues) {
        const control = formulario.elements.namedItem(String(issue.path[0]));
        if (control instanceof HTMLElement) errorCampo(control, issue.message);
      }
    }
    const archivos: GuardarExpediente['archivos'] = {};
    let archivosValidos = true;
    for (const { id: tipo } of tiposDocumento) {
      const archivo = archivoDocumento(tipo).files?.[0];
      if (!archivo) continue;
      const mensaje = validarPdf(archivo);
      if (mensaje) { errorCampo(archivoDocumento(tipo), mensaje); archivosValidos = false; }
      else archivos[tipo] = archivo;
    }
    if (!validacion.success || !archivosValidos) {
      mostrarError(new Error('Revisa los campos indicados antes de guardar.'));
      formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const datos: GuardarExpediente = { campos: validacion.data, archivos,
      documentos: tiposDocumento.map(({ id: tipo }) => ({ tipo,
        estado: estadoDocumento(tipo).value as 'pendiente' | 'no_aplica' | 'cargado',
        nombre_archivo: archivos[tipo]?.name ?? registro?.documentos.find(doc => doc.tipo === tipo)?.nombre_archivo ?? null,
      })),
    };
    ocupar(true, 'Guardando antecedentes legales…');
    try {
      registro = registro ? await servicio.actualizar(id, registro.version, datos) : await servicio.crear(id, datos);
      mostrarResumen();
      confirmacion.textContent = demo ? 'Demostración actualizada. Los datos no se guardaron en el servidor.' : 'Antecedentes legales guardados correctamente.';
      confirmacion.hidden = false;
    } catch (fallo) {
      mostrarError(fallo); error.focus();
      if (fallo instanceof ApiError && fallo.status === 409) {
        conflicto = true; recarga.hidden = false;
        buscar('#legal-reintentar').textContent = 'Reintentar';
      }
    } finally { ocupar(false); guardar.disabled = conflicto; }
  });
  buscar('#legal-registrar').addEventListener('click', editar);
  buscar('#legal-editar').addEventListener('click', editar);
  buscar('#legal-cancelar').addEventListener('click', () => { if (!ocupado) { limpiarErrores(); formulario.reset(); mostrarResumen(); } });
  buscar('#legal-reintentar').addEventListener('click', () => void cargar());
  const activarExpediente = () => { if (!iniciado) void cargar(); };
  document.querySelectorAll<HTMLElement>('[data-org-seccion="expediente-legal"], [data-tab="expediente-legal"]').forEach(acceso => acceso.addEventListener('click', activarExpediente));
  const panel = raiz.closest<HTMLElement>('#tab-expediente-legal');
  const accesoDirecto = window.location.hash.replace(/^#/, '') === 'expediente-legal';
  if (accesoDirecto || (panel && !panel.classList.contains('hidden'))) void cargar();
}
