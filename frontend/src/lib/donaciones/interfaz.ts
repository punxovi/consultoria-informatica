import { ApiError } from '../api/transporte.ts';
import { getSupabaseClient } from '../supabase.ts';
import { crearClienteDonaciones } from './cliente.ts';
import { listarProgramas } from '../programas/cliente.ts';
import {
  esDinero,
  partesDonacion,
  etiquetasTipoDonante,
  etiquetasTipoRespaldo,
  siguienteEstado,
  normalizarTipoRespaldo,
  tipoArchivo,
  validarRegistroDonacion,
  type CambiosDonacion,
  type Donacion,
  type RespaldoDonacion,
  type TipoRespaldo,
} from './modelo.ts';
import { crearTarjetaRegistro, type TonoInsignia } from '../ui/registro.ts';

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
  let modoFormulario: 'crear' | 'editar' = 'crear';
  let donaciones: Donacion[] = [];
  let donacionActual: Donacion | null = null;
  let respaldosActuales: RespaldoDonacion[] = [];
  let filtroTipoRespaldo: TipoRespaldo | 'todos' = 'todos';
  let reservaPendiente: RespaldoDonacion | null = null;
  let programas: { id: string; nombre: string }[] = [];
  let programasCargados = false;

  const nombreOrganizacion = () => raiz.dataset.organizacionNombre || 'Esta organización';
  const nombrePais = () => raiz.dataset.paisNombre || '—';
  const nombrePrograma = (id?: string | null) =>
    id ? (programas.find((p) => p.id === id)?.nombre ?? 'Programa asociado') : 'Sin Programa asociado';

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
    p.dataset.campo = (input as HTMLInputElement).name ?? '';
    p.className = 'mt-1 text-sm text-[#AD174F]';
    p.setAttribute('role', 'alert');
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


  function describirAporte(item: Donacion) {
    if (item.tipo_aporte === 'dinero') {
      return `$${Number(item.monto).toLocaleString('es-CL')} ${item.moneda ?? ''}`.trim();
    }
    return item.cantidad ? `${item.cantidad} ${item.unidad ?? ''}`.trim() : 'Sin cantidad indicada';
  }

  function describirCategoria(item: Donacion) {
    const base = item.categoria ?? (item.tipo_aporte === 'dinero' ? 'Dinero' : 'Recurso');
    return item.categoria === 'Otro' && item.categoria_otro ? `Otro: ${item.categoria_otro}` : base;
  }

  function describirValor(item: Donacion) {
    if (item.valor_estimado === null || item.valor_estimado === undefined) return 'Sin valorización';
    const valor = Number(item.valor_estimado).toLocaleString('es-CL');
    return `${valor} ${item.moneda_valorizacion ?? ''} · ${item.metodo_valorizacion ?? 'Método no indicado'}`.trim();
  }

  function formatearTamano(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }


  const tonoEstado: Record<string, TonoInsignia> = {
    Comprometida: 'amarillo',
    Recibida: 'verde',
    Entregada: 'verde',
    Cerrada: 'morado',
  };

  function renderListadoDonaciones() {
    const lista = q('lista');
    lista.replaceChildren();
    q('vacio').hidden = donaciones.length > 0;
    q('cantidad').hidden = donaciones.length === 0;
    q('cantidad').textContent = `${donaciones.length} ${donaciones.length === 1 ? 'donación registrada' : 'donaciones registradas'}`;
    for (const item of donaciones) {
      const recibida = item.tipo_movimiento === 'recibida';
      const partes = partesDonacion(item, nombreOrganizacion());
      const insignias: { texto: string; tono: TonoInsignia }[] = [
        { texto: recibida ? '↓ Recibida por la organización' : '↑ Entregada por la organización', tono: recibida ? 'verde' : 'morado' },
      ];
      if (item.estado) insignias.push({ texto: item.estado, tono: tonoEstado[item.estado] ?? 'neutro' });
      lista.append(crearTarjetaRegistro({
        acento: recibida ? 'verde' : 'morado',
        contexto: formatearFecha(item.fecha),
        titulo: item.contraparte_nombre,
        insignias,
        datos: [
          ['Aporte', `${describirCategoria(item)} · ${describirAporte(item)}`],
          [recibida ? 'Entrega' : 'Recibe', recibida ? partes.entrega : partes.recibe],
          ['Procedencia', item.origen ?? 'No registrada'],
        ],
        accion: {
          texto: 'Ver detalle',
          etiquetaAccesible: `Ver detalle y respaldos de ${item.contraparte_nombre}`,
          atributos: { 'data-ver-detalle': '' },
          alPulsar: () => { void abrirDetalle(item); },
        },
      }));
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

  function renderDetalle(donacion: Donacion) {
    const partes = partesDonacion(donacion, nombreOrganizacion());
    q('detalle-emisor').textContent = partes.entrega;
    q('detalle-receptor').textContent = partes.recibe;
    q('detalle-referencia').textContent = `${donacion.id_donacion} · Versión ${donacion.version}`;
    q('detalle-fecha').textContent = formatearFecha(donacion.fecha);
    q('detalle-organizacion').textContent = nombreOrganizacion();
    q('detalle-pais').textContent = nombrePais();
    q('detalle-programa').textContent = nombrePrograma(donacion.id_programa);
    const tipoDonante = etiquetasTipoDonante[donacion.tipo_donante as keyof typeof etiquetasTipoDonante];
    q('detalle-donante').textContent =
      [tipoDonante ?? donacion.tipo_donante, donacion.origen].filter(Boolean).join(' · ') || 'Sin información';
    q('detalle-categoria').textContent = describirCategoria(donacion);
    q('detalle-aporte').textContent = describirAporte(donacion);
    q('detalle-valor').textContent = describirValor(donacion);
    q('detalle-estado').textContent = donacion.estado ?? 'Sin estado registrado';
    q('detalle-descripcion').textContent = donacion.descripcion;

    const siguiente = siguienteEstado(donacion.estado);
    q<HTMLButtonElement>('editar').hidden = !puedeGestionar;
    const boton = q<HTMLButtonElement>('avanzar-estado');
    boton.hidden = !siguiente || !puedeGestionar;
    boton.textContent = siguiente ? `Avanzar a ${siguiente}` : '';
  }

  async function abrirDetalle(donacion: Donacion) {
    donacionActual = donacion;
    respaldosActuales = [];
    reservaPendiente = null;
    filtroTipoRespaldo = 'todos';
    cambiarVista('detalle');

    q('detalle-contraparte').textContent = donacion.contraparte_nombre;
    const badgeMov = q('detalle-movimiento');
    const esRecibida = donacion.tipo_movimiento === 'recibida';
    badgeMov.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
      esRecibida ? 'bg-[#E5F6ED] text-[#14784D]' : 'bg-violet-100 text-violet-900'
    }`;
    badgeMov.textContent = esRecibida ? '↓ Entrada · Recibida por la organización' : '↑ Salida · Entregada por la organización';

    renderDetalle(donacion);

    cerrarFormRespaldo();
    actualizarFiltrosUI();
    renderRespaldos();

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
    q('adjuntar-respaldo').hidden = !puedeGestionar;
    limpiarAlertas();
  }

  function prepararReintento(item: RespaldoDonacion) {
    abrirFormRespaldo();
    reservaPendiente = item;
    q('respaldo-pendiente-alerta').hidden = false;
    q('respaldo-pendiente-alerta').textContent =
      `Reintentando carga para «${item.nombre_original}». Selecciona el mismo archivo (${item.mime_type}, ${formatearTamano(item.tamano_bytes)} exactos).`;
    q<HTMLSelectElement>('respaldo-tipo').value = item.tipo_respaldo;
    q<HTMLInputElement>('respaldo-descripcion').value = item.descripcion ?? '';
    q('respaldo-guardar').textContent = 'Reintentar subida';
  }

  q('adjuntar-respaldo').addEventListener('click', abrirFormRespaldo);
  q('adjuntar-certificado').addEventListener('click', () => {
    if (ocupado || !puedeGestionar || !donacionActual) return;
    abrirFormRespaldo();
    q<HTMLSelectElement>('respaldo-tipo').value = 'certificado';
    q<HTMLInputElement>('respaldo-archivo').focus();
  });
  q('respaldo-cancelar').addEventListener('click', cerrarFormRespaldo);

  const formDonacion = q<HTMLFormElement>('form-donacion-tag');
  const grupoDinero = q('grupo-dinero');
  const grupoRecurso = q('grupo-recurso');

  const categoriaSelect = q<HTMLSelectElement>('categoria');
  const aporteTipo = q<HTMLInputElement>('aporte-tipo');

  function actualizarSentido() {
    const recibida = q<HTMLSelectElement>('tipo-movimiento').value === 'recibida';
    const contraparte = q<HTMLInputElement>('contraparte').value.trim() || 'Contraparte por indicar';
    const partes = partesDonacion({ tipo_movimiento: recibida ? 'recibida' : 'entregada', contraparte_nombre: contraparte }, nombreOrganizacion());
    q('sentido').textContent = `Entrega: ${partes.entrega}. Recibe: ${partes.recibe}. El movimiento se interpreta desde la organización y es independiente del estado de gestión.`;
  }
  q('tipo-movimiento').addEventListener('change', actualizarSentido);
  q('contraparte').addEventListener('input', actualizarSentido);

  function actualizarCamposAporte() {
    actualizarSentido();
    const dinero = esDinero(categoriaSelect.value);
    aporteTipo.value = dinero ? 'dinero' : 'recurso';
    grupoDinero.hidden = !dinero;
    grupoRecurso.hidden = dinero;
    const otro = categoriaSelect.value === 'Otro';
    q('grupo-otro').hidden = !otro;
    const campoOtro = q<HTMLInputElement>('categoria-otro');
    campoOtro.required = otro;
    // El texto de "Otro" no debe viajar con otra categoría aunque el campo esté oculto.
    if (!otro) campoOtro.value = '';
    for (const nombre of ['monto', 'moneda']) q<HTMLInputElement>(nombre).required = dinero;
    raiz.querySelectorAll('[data-error-campo]').forEach((n) => n.remove());
  }
  categoriaSelect.addEventListener('change', actualizarCamposAporte);

  async function cargarProgramas() {
    if (programasCargados) return;
    try {
      const lista = await listarProgramas();
      programas = lista.filter((p) => !p.archived_at).map((p) => ({ id: p.id_programa, nombre: p.nombre }));
      programasCargados = true;
      const select = q<HTMLSelectElement>('programa');
      for (const programa of programas) {
        const option = document.createElement('option');
        option.value = programa.id;
        option.textContent = programa.nombre;
        select.append(option);
      }
    } catch {
      q('programa-ayuda').textContent = 'No fue posible cargar los Programas. Puedes registrar la donación sin Programa.';
    }
  }

  function seleccionarMoneda(campo: string, codigo: string) {
    const select = q<HTMLSelectElement>(campo);
    if (codigo && !Array.from(select.options).some(opcion => opcion.value === codigo)) {
      const previa = new Option(codigo, codigo);
      previa.dataset.historica = '';
      select.add(previa);
    }
    select.value = codigo;
  }

  function abrirFormularioCreacion() {
    modoFormulario = 'crear';
    formDonacion.querySelectorAll('option[data-historica]').forEach(opcion => opcion.remove());
    formDonacion.reset();
    q<HTMLInputElement>('pais').value = nombrePais();
    q<HTMLInputElement>('organizacion').value = nombreOrganizacion();
    q('form-titulo').textContent = 'Registrar nueva donaci\u00f3n';
    q('form-ayuda').textContent = 'Una vez creada podr\u00e1s adjuntar sus respaldos documentales.';
    actualizarCamposAporte();
    cambiarVista('form-donacion');
    void cargarProgramas();
  }

  async function abrirFormularioEdicion() {
    if (!donacionActual || ocupado || !puedeGestionar) return;
    modoFormulario = 'editar';
    const donacion = donacionActual;
    formDonacion.querySelectorAll('option[data-historica]').forEach(opcion => opcion.remove());
    formDonacion.reset();
    q<HTMLInputElement>('pais').value = nombrePais();
    q<HTMLInputElement>('organizacion').value = nombreOrganizacion();
    q<HTMLInputElement>('fecha').value = donacion.fecha.slice(0, 10);
    q<HTMLSelectElement>('tipo-movimiento').value = donacion.tipo_movimiento;
    q<HTMLInputElement>('contraparte').value = donacion.contraparte_nombre;
    q<HTMLSelectElement>('tipo-donante').value = donacion.tipo_donante ?? '';
    q<HTMLInputElement>('origen').value = donacion.origen ?? '';
    categoriaSelect.value = donacion.categoria ?? (donacion.tipo_aporte === 'dinero' ? 'Dinero' : 'Servicio');
    actualizarCamposAporte();
    q<HTMLInputElement>('categoria-otro').value = donacion.categoria_otro ?? '';
    q<HTMLTextAreaElement>('descripcion').value = donacion.descripcion;
    q<HTMLInputElement>('monto').value = donacion.monto == null ? '' : String(donacion.monto);
    seleccionarMoneda('moneda', donacion.moneda ?? 'CLP');
    q<HTMLInputElement>('cantidad').value = donacion.cantidad == null ? '' : String(donacion.cantidad);
    q<HTMLInputElement>('unidad').value = donacion.unidad ?? '';
    q<HTMLInputElement>('valor-estimado').value = donacion.valor_estimado == null ? '' : String(donacion.valor_estimado);
    seleccionarMoneda('moneda-valorizacion', donacion.moneda_valorizacion ?? '');
    q<HTMLInputElement>('metodo-valorizacion').value = donacion.metodo_valorizacion ?? '';
    q<HTMLSelectElement>('estado').value = donacion.estado ?? 'Comprometida';
    q('form-titulo').textContent = 'Editar donaci\u00f3n';
    q('form-ayuda').textContent = 'Modifica los datos permitidos. La Organizaci\u00f3n y su pa\u00eds no se pueden cambiar.';
    cambiarVista('form-donacion');
    await cargarProgramas();
    q<HTMLSelectElement>('programa').value = donacion.id_programa ?? '';
  }

  q('nueva').addEventListener('click', abrirFormularioCreacion);
  q('editar').addEventListener('click', () => { void abrirFormularioEdicion(); });

  // Quita el error de un campo en cuanto la persona lo corrige.
  formDonacion.addEventListener('input', (e) => {
    const campo = (e.target as HTMLInputElement).name;
    formDonacion.querySelectorAll<HTMLElement>(`[data-error-campo][data-campo="${campo}"]`).forEach((n) => n.remove());
    (e.target as HTMLElement).setAttribute('aria-invalid', 'false');
  });

  q('cancelar').addEventListener('click', () => {
    if (modoFormulario === 'editar' && donacionActual) {
      cambiarVista('detalle');
      renderDetalle(donacionActual);
      return;
    }
    cambiarVista('listado');
  });

  function obtenerCambiosEdicion(datos: Record<string, unknown>): Record<string, unknown> {
    if (!donacionActual) return {};
    const candidatos: Record<string, unknown> = {
      id_programa: datos.id_programa ?? null,
      categoria: datos.categoria,
      categoria_otro: datos.categoria_otro ?? null,
      tipo_donante: datos.tipo_donante,
      origen: datos.origen,
      estado: datos.estado,
      valor_estimado: datos.valor_estimado ?? null,
      moneda_valorizacion: datos.moneda_valorizacion ?? null,
      metodo_valorizacion: datos.metodo_valorizacion ?? null,
      fecha: datos.fecha,
      tipo_movimiento: datos.tipo_movimiento,
      contraparte_nombre: datos.contraparte_nombre,
      descripcion: datos.descripcion,
      tipo_aporte: datos.tipo_aporte,
      monto: datos.monto ?? null,
      moneda: datos.moneda ?? null,
      cantidad: datos.cantidad ?? null,
      unidad: datos.unidad ?? null,
    };
    return Object.fromEntries(Object.entries(candidatos).filter(([campo, valor]) => {
      const previo = (donacionActual as Record<string, unknown>)[campo] ?? null;
      if (previo === valor) return false;
      // El layout capitaliza textos al enviar. No debe generar una escritura
      // accidental al editar otro campo de un registro ya existente.
      return !(typeof previo === 'string' && typeof valor === 'string'
        && previo.localeCompare(valor, 'es-CL', { sensitivity: 'accent' }) === 0);
    }));
  }

  formDonacion.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ocupado) return;
    limpiarAlertas();

    const fd = new FormData(formDonacion);
    const texto = (nombre: string) => String(fd.get(nombre) ?? '').trim() || undefined;
    const numero = (nombre: string) => (fd.get(nombre) ? Number(fd.get(nombre)) : undefined);
    const dinero = esDinero(String(fd.get('categoria')));

    const raw = {
      id_pais: raiz.dataset.pais,
      id_programa: texto('id_programa'),
      categoria: texto('categoria'),
      categoria_otro: texto('categoria_otro'),
      tipo_donante: texto('tipo_donante'),
      origen: texto('origen'),
      estado: texto('estado'),
      fecha: String(fd.get('fecha') ?? ''),
      tipo_movimiento: fd.get('tipo_movimiento') as 'recibida' | 'entregada',
      contraparte_nombre: String(fd.get('contraparte_nombre') ?? ''),
      descripcion: String(fd.get('descripcion') ?? ''),
      tipo_aporte: (dinero ? 'dinero' : 'recurso') as 'dinero' | 'recurso',
      monto: dinero ? numero('monto') : undefined,
      moneda: dinero ? texto('moneda')?.toUpperCase() : undefined,
      cantidad: dinero ? undefined : numero('cantidad'),
      unidad: dinero ? undefined : texto('unidad'),
      valor_estimado: numero('valor_estimado'),
      moneda_valorizacion: texto('moneda_valorizacion')?.toUpperCase(),
      metodo_valorizacion: texto('metodo_valorizacion'),
    };

    const val = validarRegistroDonacion(raw);
    if (!val.success) {
      let primero: HTMLElement | null = null;
      for (const issue of val.issues) {
        const campo = issue.path[0] as string;
        const input = formDonacion.elements.namedItem(campo) as HTMLElement | null;
        if (input && !formDonacion.querySelector(`[data-error-campo][data-campo="${campo}"]`)) {
          errorCampo(input, issue.message);
          primero ??= input;
        }
      }
      mostrarError(new Error('Corrige los campos marcados antes de continuar.'));
      primero?.focus();
      return;
    }

    const cambios = modoFormulario === 'editar' ? obtenerCambiosEdicion(val.data as Record<string, unknown>) : null;
    if (cambios && Object.keys(cambios).length === 0) {
      mostrarExito('No hay cambios para guardar.');
      return;
    }

    bloquear(true, modoFormulario === 'editar' ? 'Guardando cambios...' : 'Registrando donación...');
    try {
      if (modoFormulario === 'editar' && donacionActual && cambios) {
        const actualizada = await cliente.actualizarDonacion(
          idOrganizacion,
          donacionActual.id_donacion,
          donacionActual.version,
          cambios as CambiosDonacion,
        );
        const indice = donaciones.findIndex((item) => item.id_donacion === actualizada.id_donacion);
        if (indice >= 0) donaciones[indice] = actualizada;
        donacionActual = actualizada;
        await abrirDetalle(actualizada);
        mostrarExito('Donación actualizada correctamente.');
      } else {
        const nueva = await cliente.crearDonacion(idOrganizacion, val.data);
        donaciones.unshift(nueva);
        await abrirDetalle(nueva);
        mostrarExito('Donación registrada correctamente.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        for (const [campo, mensajes] of Object.entries(err.fields)) {
          const input = formDonacion.elements.namedItem(campo) as HTMLElement | null;
          if (input && Array.isArray(mensajes) && typeof mensajes[0] === 'string') errorCampo(input, mensajes[0]);
        }
      }
      mostrarError(err, modoFormulario === 'editar' ? 'No fue posible actualizar la donación. ' : 'No fue posible registrar la donación. ');
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

  q('avanzar-estado').addEventListener('click', async () => {
    if (ocupado || !donacionActual) return;
    const siguiente = siguienteEstado(donacionActual.estado);
    if (!siguiente) return;
    limpiarAlertas();
    bloquear(true, 'Actualizando estado...');
    try {
      const actualizada = await cliente.actualizarDonacion(
        idOrganizacion,
        donacionActual.id_donacion,
        donacionActual.version,
        { estado: siguiente },
      );
      donacionActual = actualizada;
      const idx = donaciones.findIndex((d) => d.id_donacion === actualizada.id_donacion);
      if (idx >= 0) donaciones[idx] = actualizada;
      renderDetalle(actualizada);
      mostrarExito(`El estado de la donación cambió a ${siguiente}.`);
    } catch (err) {
      mostrarError(err, 'No fue posible cambiar el estado. ');
    } finally {
      bloquear(false);
    }
  });

  q('detalle-volver').addEventListener('click', () => {
    cambiarVista('listado');
    renderListadoDonaciones();
  });

  // La ficha entrega el nombre de la organización y del país después de montar la sección.
  raiz.addEventListener('organizacion-cargada', () => {
    renderListadoDonaciones();
    if (donacionActual && !q('detalle').hidden) renderDetalle(donacionActual);
  });

  void cargarDonaciones();
}
