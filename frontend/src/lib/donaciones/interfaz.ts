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

  function renderListadoDonaciones() {
    const lista = q('lista');
    lista.replaceChildren();
    q('vacio').hidden = donaciones.length > 0;

    for (const item of donaciones) {
      const card = document.createElement('article');
      card.className =
        'flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md';

      const cabecera = document.createElement('div');
      cabecera.className = 'flex items-start justify-between gap-3';

      const contraparte = document.createElement('h3');
      contraparte.className = 'text-lg font-bold text-neutral-900 break-words';
      contraparte.textContent = item.contraparte_nombre;

      const badgeMov = document.createElement('span');
      const esRecibida = item.tipo_movimiento === 'recibida';
      badgeMov.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        esRecibida ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
      }`;
      badgeMov.textContent = esRecibida ? 'Donación Recibida' : 'Donación Entregada';

      cabecera.append(contraparte, badgeMov);

      const cuerpo = document.createElement('div');
      cuerpo.className = 'mt-3 space-y-2 text-sm text-neutral-600';

      const fechaP = document.createElement('p');
      fechaP.innerHTML = `<span class="font-medium text-neutral-800">Fecha:</span> ${formatearFecha(item.fecha)}`;

      const aporteP = document.createElement('p');
      if (item.tipo_aporte === 'dinero') {
        const montoStr = Number(item.monto).toLocaleString('es-CL');
        aporteP.innerHTML = `<span class="font-medium text-neutral-800">Aporte en dinero:</span> $${montoStr} ${item.moneda ?? ''}`;
      } else {
        aporteP.innerHTML = `<span class="font-medium text-neutral-800">Aporte en recurso:</span> ${item.cantidad} ${item.unidad ?? ''}`;
      }

      const descP = document.createElement('p');
      descP.className = 'line-clamp-2 text-neutral-700 italic break-words';
      descP.textContent = item.descripcion;

      cuerpo.append(fechaP, aporteP, descP);

      const pie = document.createElement('div');
      pie.className = 'mt-4 border-t border-neutral-100 pt-3 flex justify-end';

      const botonVer = document.createElement('button');
      botonVer.type = 'button';
      botonVer.className =
        'inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-200 transition-colors';
      botonVer.innerHTML = `Ver detalle y respaldos &rarr;`;
      botonVer.addEventListener('click', () => abrirDetalle(item));

      pie.append(botonVer);
      card.append(cabecera, cuerpo, pie);
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
        'flex flex-col justify-between rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 transition-all hover:bg-white hover:border-neutral-300';

      const encabezado = document.createElement('div');
      encabezado.className = 'flex flex-wrap items-center justify-between gap-2';

      const etiqueta = document.createElement('span');
      etiqueta.className =
        'rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-primary';
      etiqueta.textContent = etiquetasTipoRespaldo[item.tipo_respaldo] ?? item.tipo_respaldo;

      const estado = document.createElement('span');
      if (item.estado_carga === 'disponible') {
        estado.className = 'text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded';
        estado.textContent = 'Disponible';
      } else if (item.estado_carga === 'reservado') {
        estado.className = 'text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded';
        estado.textContent = 'Carga pendiente';
      } else {
        estado.className = 'text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded';
        estado.textContent = 'Carga fallida';
      }

      encabezado.append(etiqueta, estado);

      const cuerpo = document.createElement('div');
      cuerpo.className = 'mt-2 space-y-1';

      const nombre = document.createElement('p');
      nombre.className = 'text-sm font-semibold text-neutral-900 break-words';
      nombre.textContent = item.nombre_original;

      const meta = document.createElement('p');
      meta.className = 'text-xs text-neutral-500';
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
          'inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm border border-neutral-300 hover:bg-neutral-50';
        btnDescargar.innerHTML = `⬇️ Descargar`;
        btnDescargar.addEventListener('click', () => descargar(item));
        acciones.append(btnDescargar);
      } else {
        const btnReintentar = document.createElement('button');
        btnReintentar.type = 'button';
        btnReintentar.className =
          'inline-flex items-center gap-1 rounded bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200 hover:bg-amber-100';
        btnReintentar.innerHTML = `🔄 Reintentar carga`;
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
    badgeMov.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      esRecibida ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
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
      btn.classList.toggle('bg-primary', activo);
      btn.classList.toggle('text-white', activo);
      btn.classList.toggle('bg-neutral-100', !activo);
      btn.classList.toggle('text-neutral-700', !activo);
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
    q('respaldo-tipo').value = item.tipo_respaldo;
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

  q('don-cancelar').addEventListener('click', () => {
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
