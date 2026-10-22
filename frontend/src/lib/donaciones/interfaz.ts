import { ApiError } from '../api/transporte.ts';
import { getSupabaseClient } from '../supabase.ts';
import { crearClienteDonaciones } from './cliente.ts';
import {
  donacionFormSchema,
  etiquetasTipoRespaldo,
  normalizarTipoRespaldo,
  tipoArchivo,
  type Donacion,
  type RespaldoDonacion,
  type TipoRespaldo,
} from './modelo.ts';

export function iniciarDonaciones() {
  const contenedor = document.querySelector<HTMLElement>('#seccion-donaciones');
  if (!contenedor || contenedor.dataset.iniciado) return;
  contenedor.dataset.iniciado = 'true';

  const raiz: HTMLElement = contenedor;
  const idOrganizacion = raiz.dataset.organizacion!;
  const q = <T extends HTMLElement = HTMLElement>(id: string) =>
    raiz.querySelector<T>(`#don-${id}`)!;

  const cliente = crearClienteDonaciones(
    import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000',
    async () => {
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error || !data.session) {
        throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
      }
      return data.session.access_token;
    },
  );

  let ocupado = false;
  let puedeGestionar = true;
  let donaciones: Donacion[] = [];
  let donacionActual: Donacion | null = null;
  let respaldosActuales: RespaldoDonacion[] = [];
  let filtroTipoRespaldo: TipoRespaldo | 'todos' = 'todos';
  let reservaPendiente: RespaldoDonacion | null = null;

  function bloquear(estado: boolean, mensaje = '') {
    ocupado = estado;
    raiz.setAttribute('aria-busy', String(estado));
    q('carga').hidden = !estado;
    if (mensaje) q('carga').textContent = mensaje;
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = estado;
    });
    const fsDon = raiz.querySelector<HTMLFieldSetElement>('#don-campos');
    if (fsDon) fsDon.disabled = estado || !puedeGestionar;
    const fsResp = raiz.querySelector<HTMLFieldSetElement>('#don-respaldo-campos');
    if (fsResp) fsResp.disabled = estado || !puedeGestionar;
    if (!estado) {
      q<HTMLButtonElement>('nueva').disabled = !puedeGestionar;
      q<HTMLButtonElement>('adjuntar-respaldo').disabled = !puedeGestionar;
    }
  }

  function limpiarAlertas() {
    q('error').hidden = true;
    q('exito').hidden = true;
    raiz.querySelectorAll('[data-error-campo]').forEach((n) => n.remove());
    raiz.querySelectorAll('[aria-invalid="true"]').forEach((n) => {
      n.setAttribute('aria-invalid', 'false');
    });
  }

  function mostrarError(err: unknown, prefijo = '') {
    q('error').textContent = prefijo + (err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    q('error').hidden = false;
    q('error').focus();
  }

  function mostrarExito(mensaje: string) {
    q('exito').textContent = mensaje;
    q('exito').hidden = false;
  }

  function errorCampo(input: HTMLElement, mensaje: string) {
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.dataset.errorCampo = '';
    p.className = 'mt-1 text-xs text-red-600';
    p.textContent = mensaje;
    input.parentElement?.append(p);
  }

  function cambiarVista(vista: 'listado' | 'form-donacion' | 'detalle') {
    limpiarAlertas();
    q('listado').hidden = vista !== 'listado';
    q('form-donacion').hidden = vista !== 'form-donacion';
    q('detalle').hidden = vista !== 'detalle';
    q('nueva').hidden = vista !== 'listado' || !puedeGestionar;
  }

  function formatearFecha(f?: string | null) {
    if (!f) return '—';
    const partes = f.slice(0, 10).split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return f;
  }

  function formatearTamano(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  const entidadesHtml: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const htmlSeguro = (valor: unknown) => String(valor ?? '').replace(/[&<>"']/g, c => entidadesHtml[c]);

  function renderListadoDonaciones() {
    const lista = q('lista');
    lista.replaceChildren();
    q('vacio').hidden = donaciones.length > 0;
    for (const item of donaciones) {
      const recibida = item.tipo_movimiento === 'recibida';
      const dinero = item.tipo_aporte === 'dinero';
      const aporte = dinero
        ? `$${Number(item.monto).toLocaleString('es-CL')} ${item.moneda ?? ''} (Dinero)`
        : `${item.cantidad ?? '—'} ${item.unidad ?? ''} (Recurso)`;
      const card = document.createElement('article');
      card.innerHTML = `
        <div class="h-0.5 bg-[#D8D3E8]"></div>
        <div class="don-card-layout flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-stretch">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0EDF8] text-[#4C4688]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.75h7l5 5V20a.75.75 0 0 1-.75.75h-11.5A.75.75 0 0 1 6 20V4.5a.75.75 0 0 1 .75-.75Z"/><path d="M14 4v5h5M9 13h6M9 16.5h6"/></svg>
                </span>
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#77719F]">Donación registrada</p>
                  <h3 class="mt-1 break-words text-base font-semibold text-neutral-900">${htmlSeguro(item.contraparte_nombre)}</h3>
                </div>
              </div>
              <span class="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium ${recibida ? 'bg-[#E5F6ED] text-[#14784D]' : 'bg-[#E7F7FA] text-[#167F91]'}">${recibida ? 'Donación recibida' : 'Donación entregada'}</span>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              ${[['Fecha', formatearFecha(item.fecha)], ['Aporte', aporte], ['Descripción', item.descripcion]].map(([label, value]) => `<div class="min-w-0 rounded-xl border border-[#E5E0EF] bg-[#F7F5FB] p-3"><p class="text-[11px] font-semibold uppercase tracking-wide text-[#77718F]">${htmlSeguro(label)}</p><p class="mt-1.5 break-words text-sm font-medium text-[#282435]">${htmlSeguro(value || 'Sin información')}</p></div>`).join('')}
            </div>
          </div>
          <div class="flex items-center justify-end border-t border-[#F0EDF6] pt-3 lg:min-w-[190px] lg:justify-center lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <button type="button" data-ver-detalle class="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#4C4688] transition hover:bg-[#F5F3FA] focus:outline-none focus:ring-2 focus:ring-[#4C4688]/25" aria-label="Ver detalle y respaldos de ${htmlSeguro(item.contraparte_nombre)}">Ver detalle y respaldos →</button>
          </div>
        </div>`;
      card.querySelector<HTMLButtonElement>('[data-ver-detalle]')?.addEventListener('click', () => { void abrirDetalle(item); });
      lista.append(card);
    }
  }

  async function cargarDonaciones() {
    if (ocupado) return;
    limpiarAlertas();
    bloquear(true, 'Cargando donaciones...');
    try {
      donaciones = await cliente.listarDonaciones(idOrganizacion);
      renderListadoDonaciones();
    } catch (err) {
      if (err instanceof ApiError && [401, 403].includes(err.status)) {
        puedeGestionar = false;
        raiz.querySelectorAll<HTMLButtonElement>('.solo-gestor').forEach((b) => (b.hidden = true));
      }
      mostrarError(err);
    } finally {
      bloquear(false);
    }
  }

  function renderRespaldos() {
    const lista = q('respaldos-lista');
    lista.replaceChildren();

    const filtrados =
      filtroTipoRespaldo === 'todos'
        ? respaldosActuales
        : respaldosActuales.filter((r) => r.tipo_respaldo === filtroTipoRespaldo);

    q('respaldos-vacio').hidden = filtrados.length > 0;
    q('respaldos-contador').textContent = `${respaldosActuales.length} ${
      respaldosActuales.length === 1 ? 'documento asociado' : 'documentos asociados'
    }`;

    for (const item of filtrados) {
      const card = document.createElement('article');
      card.className =
        'flex flex-col justify-between rounded-xl border border-[#E6E1EF] bg-[#FCFBFE] p-4 transition-colors hover:border-[#D5CFE8] hover:bg-white';

      const encabezado = document.createElement('div');
      encabezado.className = 'flex flex-wrap items-center justify-between gap-2';

      const etiqueta = document.createElement('span');
      etiqueta.className =
        'rounded-full bg-[#F0EDF8] px-3 py-1 text-xs font-medium text-[#4C4688]';
      etiqueta.textContent = etiquetasTipoRespaldo[item.tipo_respaldo] ?? item.tipo_respaldo;

      const estado = document.createElement('span');
      if (item.estado_carga === 'disponible') {
        estado.className = 'rounded-full bg-[#E5F6ED] px-3 py-1 text-xs font-medium text-[#14784D]';
        estado.textContent = 'Disponible';
      } else if (item.estado_carga === 'reservado') {
        estado.className = 'rounded-full bg-[#FFF3DC] px-3 py-1 text-xs font-medium text-[#925500]';
        estado.textContent = 'Carga pendiente';
      } else {
        estado.className = 'rounded-full bg-[#FDEBEC] px-3 py-1 text-xs font-medium text-[#B42332]';
        estado.textContent = 'Carga fallida';
      }

      encabezado.append(etiqueta, estado);

      const cuerpo = document.createElement('div');
      cuerpo.className = 'mt-2 space-y-1';

      const nombre = document.createElement('p');
      nombre.className = 'break-words text-sm font-semibold text-neutral-900';
      nombre.textContent = item.nombre_original;

      const meta = document.createElement('p');
      meta.className = 'text-xs leading-5 text-neutral-500';
      meta.textContent = `${formatearTamano(item.tamano_bytes)} · ${item.mime_type} · ${formatearFecha(
        item.created_at,
      )}`;

      cuerpo.append(nombre, meta);

      if (item.descripcion) {
        const desc = document.createElement('p');
        desc.className = 'text-xs italic text-neutral-600 mt-1 break-words';
        desc.textContent = item.descripcion;
        cuerpo.append(desc);
      }

      const acciones = document.createElement('div');
      acciones.className = 'mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200/60 pt-2';

      if (item.estado_carga === 'disponible') {
        const btnDescargar = document.createElement('button');
        btnDescargar.type = 'button';
        btnDescargar.className =
          'inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#D8D2E8] bg-white px-3 py-2 text-xs font-medium text-[#4C4688] transition hover:bg-[#F7F5FB]';
        btnDescargar.textContent = '↓ Descargar';
        btnDescargar.addEventListener('click', () => descargar(item));
        acciones.append(btnDescargar);
      } else {
        const btnReintentar = document.createElement('button');
        btnReintentar.type = 'button';
        btnReintentar.className =
          'inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#F1D5A2] bg-[#FFF8E9] px-3 py-2 text-xs font-medium text-[#925500] hover:bg-[#FFF2D9]';
        btnReintentar.textContent = '↻ Reintentar carga';
        btnReintentar.addEventListener('click', () => prepararReintento(item));
        acciones.append(btnReintentar);
      }

      card.append(encabezado, cuerpo, acciones);
      lista.append(card);
    }
  }

  async function descargar(item: RespaldoDonacion) {
    if (ocupado) return;
    limpiarAlertas();
    bloquear(true, `Descargando ${item.nombre_original}...`);
    try {
      const blob = await cliente.descargarRespaldo(idOrganizacion, item);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.nombre_original;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      mostrarExito(`Descarga de «${item.nombre_original}» iniciada correctamente.`);
    } catch (err) {
      mostrarError(err, 'No fue posible descargar el respaldo. ');
    } finally {
      bloquear(false);
    }
  }

  async function abrirDetalle(donacion: Donacion) {
    donacionActual = donacion;
    reservaPendiente = null;
    filtroTipoRespaldo = 'todos';
    cambiarVista('detalle');

    q('detalle-contraparte').textContent = donacion.contraparte_nombre;
    const badgeMov = q('detalle-movimiento');
    const esRecibida = donacion.tipo_movimiento === 'recibida';
    badgeMov.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
      esRecibida ? 'bg-[#E5F6ED] text-[#14784D]' : 'bg-[#E7F7FA] text-[#167F91]'
    }`;
    badgeMov.textContent = esRecibida ? 'Donación Recibida' : 'Donación Entregada';

    q('detalle-fecha').textContent = formatearFecha(donacion.fecha);
    if (donacion.tipo_aporte === 'dinero') {
      const montoStr = Number(donacion.monto).toLocaleString('es-CL');
      q('detalle-aporte').textContent = `$${montoStr} ${donacion.moneda ?? ''} (Dinero)`;
    } else {
      q('detalle-aporte').textContent = `${donacion.cantidad} ${donacion.unidad ?? ''} (Recurso)`;
    }
    q('detalle-descripcion').textContent = donacion.descripcion;

    cerrarFormRespaldo();
    actualizarFiltrosUI();

    bloquear(true, 'Cargando respaldos documentales...');
    try {
      respaldosActuales = await cliente.listarRespaldos(idOrganizacion, donacion.id_donacion);
      renderRespaldos();
    } catch (err) {
      mostrarError(err, 'No fue posible obtener los respaldos asociados. ');
    } finally {
      bloquear(false);
    }
  }

  function actualizarFiltrosUI() {
    raiz.querySelectorAll<HTMLButtonElement>('.chip-filtro-respaldo').forEach((btn) => {
      const activo = btn.dataset.tipo === filtroTipoRespaldo;
      btn.classList.toggle('activo', activo);
    });
  }

  raiz.querySelectorAll<HTMLButtonElement>('.chip-filtro-respaldo').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtroTipoRespaldo = (btn.dataset.tipo as TipoRespaldo | 'todos') ?? 'todos';
      actualizarFiltrosUI();
      renderRespaldos();
    });
  });

  function abrirFormRespaldo() {
    reservaPendiente = null;
    q('respaldo-form-contenedor').hidden = false;
    q('adjuntar-respaldo').hidden = true;
    const form = q<HTMLFormElement>('respaldo-form');
    form.reset();
    q('respaldo-pendiente-alerta').hidden = true;
    q('respaldo-guardar').textContent = 'Subir y asociar respaldo';
  }

  function cerrarFormRespaldo() {
    reservaPendiente = null;
    q('respaldo-form-contenedor').hidden = true;
    q('adjuntar-respaldo').hidden = false;
    limpiarAlertas();
  }

  function prepararReintento(item: RespaldoDonacion) {
    reservaPendiente = item;
    abrirFormRespaldo();
    q('respaldo-pendiente-alerta').hidden = false;
    q('respaldo-pendiente-alerta').textContent =
      `Reintentando carga para «${item.nombre_original}». Selecciona el archivo correspondiente (${item.mime_type}, máx. ${formatearTamano(item.tamano_bytes)}).`;
    q<HTMLSelectElement>('respaldo-tipo').value = item.tipo_respaldo;
    q<HTMLInputElement>('respaldo-descripcion').value = item.descripcion ?? '';
    q('respaldo-guardar').textContent = 'Reintentar subida';
  }

  q('adjuntar-respaldo').addEventListener('click', abrirFormRespaldo);
  q('respaldo-cancelar').addEventListener('click', cerrarFormRespaldo);

  const formDonacion = q<HTMLFormElement>('form-donacion-tag');
  const tipoAporteSelect = q<HTMLSelectElement>('aporte-tipo');
  const grupoDinero = q('grupo-dinero');
  const grupoRecurso = q('grupo-recurso');

  function actualizarCamposAporte() {
    const esDinero = tipoAporteSelect.value === 'dinero';
    grupoDinero.hidden = !esDinero;
    grupoRecurso.hidden = esDinero;
  }
  tipoAporteSelect.addEventListener('change', actualizarCamposAporte);

  q('nueva').addEventListener('click', () => {
    formDonacion.reset();
    actualizarCamposAporte();
    cambiarVista('form-donacion');
  });

  q('cancelar').addEventListener('click', () => {
    cambiarVista('listado');
  });

  formDonacion.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ocupado) return;
    limpiarAlertas();

    const fd = new FormData(formDonacion);
    const tipoAporte = fd.get('tipo_aporte') as 'dinero' | 'recurso';

    const raw = {
      fecha: String(fd.get('fecha') ?? ''),
      tipo_movimiento: fd.get('tipo_movimiento') as 'recibida' | 'entregada',
      contraparte_nombre: String(fd.get('contraparte_nombre') ?? ''),
      descripcion: String(fd.get('descripcion') ?? ''),
      tipo_aporte: tipoAporte,
      monto: tipoAporte === 'dinero' && fd.get('monto') ? Number(fd.get('monto')) : undefined,
      moneda: tipoAporte === 'dinero' && fd.get('moneda') ? String(fd.get('moneda')) : undefined,
      cantidad: tipoAporte === 'recurso' && fd.get('cantidad') ? Number(fd.get('cantidad')) : undefined,
      unidad: tipoAporte === 'recurso' && fd.get('unidad') ? String(fd.get('unidad')) : undefined,
    };

    const val = donacionFormSchema.safeParse(raw);
    if (!val.success) {
      for (const issue of val.error.issues) {
        const campo = issue.path[0] as string;
        const input = formDonacion.elements.namedItem(campo) as HTMLElement | null;
        if (input) errorCampo(input, issue.message);
      }
      mostrarError(new Error('Corrige los campos marcados antes de continuar.'));
      return;
    }

    bloquear(true, 'Registrando donación...');
    try {
      const nueva = await cliente.crearDonacion(idOrganizacion, val.data);
      donaciones.unshift(nueva);
      mostrarExito('Donación registrada correctamente.');
      abrirDetalle(nueva);
    } catch (err) {
      mostrarError(err, 'No fue posible registrar la donación. ');
    } finally {
      bloquear(false);
    }
  });

  const formRespaldo = q<HTMLFormElement>('respaldo-form');
  const inputArchivo = q<HTMLInputElement>('respaldo-archivo');

  formRespaldo.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ocupado || !donacionActual) return;
    limpiarAlertas();

    const file = inputArchivo.files?.[0];
    if (!file) {
      errorCampo(inputArchivo, 'Debes seleccionar un archivo.');
      return;
    }

    let mime = '';
    try {
      mime = tipoArchivo(file);
    } catch (err) {
      errorCampo(inputArchivo, (err as Error).message);
      return;
    }

    const selectTipo = q<HTMLSelectElement>('respaldo-tipo');
    let tipoRespaldo: TipoRespaldo;
    try {
      tipoRespaldo = normalizarTipoRespaldo(selectTipo.value);
    } catch (err) {
      errorCampo(selectTipo, (err as Error).message);
      return;
    }

    const desc = q<HTMLInputElement>('respaldo-descripcion').value.trim();

    bloquear(true, reservaPendiente ? 'Reintentando subida...' : 'Reservando respaldo...');
    let reserva = reservaPendiente;
    try {
      if (!reserva) {
        reserva = await cliente.reservarRespaldo(idOrganizacion, donacionActual.id_donacion, {
          tipo_respaldo: tipoRespaldo,
          nombre_original: file.name,
          mime_type: mime,
          tamano_bytes: file.size,
          descripcion: desc || undefined,
        });
      }

      bloquear(true, 'Subiendo archivo al almacenamiento...');
      const confirmado = await cliente.subirRespaldo(idOrganizacion, reserva, file);

      // Actualizar listado local
      const idx = respaldosActuales.findIndex((r) => r.id_archivo === confirmado.id_archivo);
      if (idx >= 0) {
        respaldosActuales[idx] = confirmado;
      } else {
        respaldosActuales.unshift(confirmado);
      }

      cerrarFormRespaldo();
      renderRespaldos();
      mostrarExito(`Respaldo «${confirmado.nombre_original}» incorporado exitosamente.`);
    } catch (err) {
      // Si la carga falla, el backend actualiza el estado a fallido o lo mantenemos en lista para reintento
      if (reserva) {
        try {
          const actualizado = await cliente.obtenerRespaldo(
            idOrganizacion,
            donacionActual.id_donacion,
            reserva.id_archivo,
          );
          const idx = respaldosActuales.findIndex((r) => r.id_archivo === actualizado.id_archivo);
          if (idx >= 0) respaldosActuales[idx] = actualizado;
          else respaldosActuales.unshift(actualizado);
          renderRespaldos();
        } catch {
          // ignore
        }
      }
      mostrarError(
        err,
        'Ocurrió un problema durante la carga del archivo. No se almacenó como disponible y puedes reintentar. ',
      );
    } finally {
      bloquear(false);
    }
  });

  q('detalle-volver').addEventListener('click', () => {
    cambiarVista('listado');
    renderListadoDonaciones();
  });

  q('recargar').addEventListener('click', () => {
    if (donacionActual && !q('detalle').hidden) {
      abrirDetalle(donacionActual);
    } else {
      cargarDonaciones();
    }
  });

  void cargarDonaciones();
}