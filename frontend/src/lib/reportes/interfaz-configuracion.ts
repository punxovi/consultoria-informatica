import { ApiError, createApiTransport } from '../api/transporte.ts';
import { getSupabaseClient } from '../supabase.ts';
import { crearClienteIndicadores } from '../indicadores/cliente.ts';
import { listarOrganizaciones, listarPaisesOrganizaciones } from '../organizaciones/cliente.ts';
import { listarProgramas } from '../programas/cliente.ts';
import { listarAcciones } from '../acciones/cliente.ts';
import { cargarOpcionesIndicadoresYResultados, filtrarOpcionesReporte, type OpcionReporte } from './resultados.ts';
import { crearControladorConsulta, type EstadoConsulta, type SolicitudReporte } from './consulta.ts';
import { renderizarVistaPrevia } from './interfaz-vista-previa.ts';
import { crearClienteReportesPdf, type ReportFilters, type ReportPreview } from './pdf.ts';
import {
  MAX_SELECCION,
  configuracionInicial,
  etiquetasDestino,
  filtrosSeleccionados,
  quitarFiltro,
  restablecerFiltros,
  validarConfiguracion,
  type CampoConfiguracion,
  type ConfiguracionReporte,
  type NombresCatalogo,
} from './configuracion.ts';

type Opcion = { valor: string; etiqueta: string; detalle?: string };
type NombreCatalogo = 'Países' | 'Organizaciones' | 'Programas' | 'Indicadores' | 'Resultados';

export function iniciarConfiguracionReporte() {
  const contenedor = document.querySelector<HTMLElement>('#reporte-configuracion');
  if (!contenedor || contenedor.dataset.iniciado) return;
  contenedor.dataset.iniciado = 'true';

  const raiz: HTMLElement = contenedor;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#rep-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const apiBase = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';

  async function token(): Promise<string> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  }
  const indicadores = crearClienteIndicadores(createApiTransport(apiBase), token);
  const reportes = crearClienteReportesPdf(apiBase, token);

  let config: ConfiguracionReporte = configuracionInicial();
  const nombres: NombresCatalogo = {
    id_pais: new Map(),
    id_organizacion: new Map(),
    id_programa: new Map(),
    indicadores: new Map(),
    resultados: new Map(),
  };
  let intentado = false;
  let secuenciaOrganizaciones = 0;
  let fallidos: NombreCatalogo[] = [];
  let opcionesTodas: { indicadores: OpcionReporte[]; resultados: OpcionReporte[] } = { indicadores: [], resultados: [] };
  let opcionesCargadas = false;

  const selectores = {
    id_pais: q<HTMLSelectElement>('pais'),
    id_organizacion: q<HTMLSelectElement>('organizacion'),
    id_programa: q<HTMLSelectElement>('programa'),
  };

  function limpiarErrores(campo?: CampoConfiguracion) {
    const filtro = campo ? `[data-campo="${campo}"]` : '';
    raiz.querySelectorAll(`[data-error-campo]${filtro}`).forEach((n) => n.remove());
    const controles = campo
      ? raiz.querySelectorAll<HTMLElement>(`[data-campo-wrap="${campo}"] [aria-invalid="true"]`)
      : raiz.querySelectorAll<HTMLElement>('[aria-invalid="true"]');
    controles.forEach((c) => c.setAttribute('aria-invalid', 'false'));
  }

  function mostrarError(campo: CampoConfiguracion, mensaje: string) {
    const envoltura = raiz.querySelector<HTMLElement>(`[data-campo-wrap="${campo}"]`);
    if (!envoltura) return;
    const control = envoltura.querySelector<HTMLElement>('input:not([type=checkbox]), select');
    control?.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.dataset.errorCampo = '';
    p.dataset.campo = campo;
    p.className = 'mt-1 text-sm text-[#AD174F]';
    p.setAttribute('role', 'alert');
    p.textContent = mensaje;
    if (control?.id) {
      p.id = `${control.id}-error`;
      control.setAttribute('aria-describedby', p.id);
    }
    envoltura.append(p);
  }

  function leerFormulario() {
    config = {
      ...config,
      fecha_inicio: q<HTMLInputElement>('fecha-inicio').value,
      fecha_termino: q<HTMLInputElement>('fecha-termino').value,
      id_pais: selectores.id_pais.value,
      id_organizacion: selectores.id_organizacion.value,
      id_programa: selectores.id_programa.value,
      destino: q<HTMLSelectElement>('destino').value as ConfiguracionReporte['destino'],
      indicadores: marcados('indicadores'),
      resultados: marcados('resultados'),
    };
  }

  const marcados = (lista: 'indicadores' | 'resultados') =>
    [...raiz.querySelectorAll<HTMLInputElement>(`#rep-${lista}-opciones input[type=checkbox]:checked`)].map((i) => i.value);

  function pintarFormulario() {
    q<HTMLInputElement>('fecha-inicio').value = config.fecha_inicio;
    q<HTMLInputElement>('fecha-termino').value = config.fecha_termino;
    selectores.id_pais.value = config.id_pais;
    selectores.id_organizacion.value = config.id_organizacion;
    selectores.id_programa.value = config.id_programa;
    q<HTMLSelectElement>('destino').value = config.destino;
    for (const lista of ['indicadores', 'resultados'] as const) {
      raiz.querySelectorAll<HTMLInputElement>(`#rep-${lista}-opciones input[type=checkbox]`).forEach((i) => {
        i.checked = config[lista].includes(i.value);
      });
    }
  }

  function pintarSeleccion() {
    const lista = q('seleccion');
    lista.replaceChildren();
    const filtros = filtrosSeleccionados(config, nombres);
    q('seleccion-resumen').textContent =
      filtros.length === 0
        ? 'Sin filtros: se incluirán todos los datos visibles para tu sesión.'
        : `${filtros.length} ${filtros.length === 1 ? 'filtro seleccionado' : 'filtros seleccionados'}.`;
    for (const filtro of filtros) {
      const item = document.createElement('li');
      item.className = 'rep-chip';
      const texto = document.createElement('span');
      texto.textContent = filtro.etiqueta;
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.setAttribute('aria-label', `Quitar filtro ${filtro.etiqueta}`);
      quitar.textContent = '×';
      quitar.addEventListener('click', () => {
        config = quitarFiltro(config, filtro);
        pintarFormulario();
        actualizar();
        if (filtro.campo === 'id_organizacion' || filtro.campo === 'id_programa' || filtro.campo === 'indicadores') pintarRelacionados();
        if (filtro.campo === 'id_pais') void cargarOrganizaciones();
      });
      item.append(texto, quitar);
      lista.append(item);
    }
    q<HTMLButtonElement>('restablecer').disabled = filtros.length === 0;
    for (const lista of ['indicadores', 'resultados'] as const) {
      const total = config[lista].length;
      q(`${lista}-contador`).textContent = total > 0 ? `(${total} ${total === 1 ? 'seleccionado' : 'seleccionados'})` : '';
    }
  }

  function revalidar() {
    if (!intentado) return;
    limpiarErrores();
    const resultado = validarConfiguracion(config);
    if (!resultado.ok) {
      for (const [campo, mensaje] of Object.entries(resultado.errores)) mostrarError(campo as CampoConfiguracion, mensaje);
    }
  }

  function actualizar() {
    leerFormulario();
    consulta.reiniciar();
    pintarSeleccion();
    revalidar();
  }

  function llenarSelect(select: HTMLSelectElement, mapa: Map<string, string>, opciones: Opcion[]) {
    const vacio = select.options[0];
    select.replaceChildren(vacio);
    mapa.clear();
    for (const opcion of opciones) {
      const nodo = document.createElement('option');
      nodo.value = opcion.valor;
      nodo.textContent = opcion.etiqueta;
      select.append(nodo);
      mapa.set(opcion.valor, opcion.etiqueta);
    }
  }

  function avisoSelect(select: HTMLSelectElement, mensaje: string) {
    const ayuda = raiz.querySelector<HTMLElement>(`#${select.id}-ayuda`);
    if (!ayuda) return;
    ayuda.hidden = !mensaje;
    ayuda.textContent = mensaje;
  }

  function pintarLista(lista: 'indicadores' | 'resultados', opciones: Opcion[], mensajeVacio: string) {
    const contenedorOpciones = q(`${lista}-opciones`);
    contenedorOpciones.replaceChildren();
    nombres[lista].clear();
    if (opciones.length === 0) {
      const p = document.createElement('p');
      p.className = 'px-1 py-2 text-sm text-neutral-500';
      p.textContent = mensajeVacio;
      contenedorOpciones.append(p);
      return;
    }
    for (const opcion of opciones) {
      nombres[lista].set(opcion.valor, opcion.etiqueta);
      const etiqueta = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.name = lista;
      check.value = opcion.valor;
      check.checked = config[lista].includes(opcion.valor);
      const texto = document.createElement('span');
      texto.textContent = opcion.detalle ? `${opcion.etiqueta} (${opcion.detalle})` : opcion.etiqueta;
      etiqueta.append(check, texto);
      contenedorOpciones.append(etiqueta);
    }
  }

  function hayFiltroContexto() {
    return Boolean(config.id_pais || config.id_organizacion || config.id_programa);
  }

  function pintarIndicadores() {
    if (!opcionesCargadas) return;
    leerFormulario();
    const { indicadores: opciones } = filtrarOpcionesReporte(opcionesTodas, config);
    pintarLista('indicadores', opciones, hayFiltroContexto()
      ? 'No hay indicadores relacionados con el país, la organización o el programa elegidos.'
      : 'No hay indicadores disponibles para seleccionar.');
    q('indicadores-ayuda').textContent = hayFiltroContexto()
      ? 'Solo se muestran los relacionados con el país, la organización y el programa elegidos.'
      : 'Elige un país, una organización o un programa para ver solo los relacionados.';
    leerFormulario();
  }

  function pintarResultados() {
    if (!opcionesCargadas) return;
    leerFormulario();
    const { resultados: opciones } = filtrarOpcionesReporte(opcionesTodas, config);
    const conIndicadores = config.indicadores.length > 0;
    pintarLista('resultados', opciones, conIndicadores
      ? 'Los indicadores marcados todavía no tienen resultados registrados.'
      : hayFiltroContexto()
        ? 'No hay resultados relacionados con el país, la organización o el programa elegidos.'
        : 'No hay resultados disponibles para seleccionar.');
    q('resultados-ayuda').textContent = conIndicadores
      ? 'Solo se muestran los resultados de los indicadores marcados.'
      : hayFiltroContexto()
        ? 'Solo se muestran los relacionados con el país, la organización y el programa elegidos.'
        : 'Marca indicadores o elige filtros para ver solo los resultados relacionados.';
    leerFormulario();
  }

  function pintarRelacionados() {
    pintarIndicadores();
    pintarResultados();
    pintarSeleccion();
  }

  async function cargarOrganizaciones() {
    const secuencia = ++secuenciaOrganizaciones;
    const select = selectores.id_organizacion;
    select.disabled = true;
    avisoSelect(select, 'Cargando organizaciones…');
    try {
      const organizaciones = await listarOrganizaciones({ idPais: config.id_pais || undefined });
      if (secuencia !== secuenciaOrganizaciones) return;
      llenarSelect(select, nombres.id_organizacion, organizaciones.map((o) => ({ valor: o.id_organizacion, etiqueta: o.nombre })));
      if (!nombres.id_organizacion.has(config.id_organizacion)) config.id_organizacion = '';
      select.value = config.id_organizacion;
      select.disabled = false;
      avisoSelect(select, organizaciones.length === 0 ? 'No hay organizaciones disponibles para este país.' : '');
      fallidos = fallidos.filter((n) => n !== 'Organizaciones');
    } catch {
      if (secuencia !== secuenciaOrganizaciones) return;
      llenarSelect(select, nombres.id_organizacion, []);
      avisoSelect(select, 'No fue posible cargar las organizaciones.');
      if (!fallidos.includes('Organizaciones')) fallidos.push('Organizaciones');
    }
    pintarRelacionados();
    pintarSeleccion();
  }

  async function cargarCatalogos(solo?: NombreCatalogo[]) {
    const quiere = (nombre: NombreCatalogo) => !solo || solo.includes(nombre);
    q('catalogos-estado').hidden = false;
    q('catalogos-estado').textContent = 'Cargando opciones de filtro…';
    q('catalogos-error').hidden = true;
    q<HTMLButtonElement>('reintentar').disabled = true;
    raiz.setAttribute('aria-busy', 'true');

    const tareas: [NombreCatalogo, Promise<void>][] = [];
    if (quiere('Países')) {
      tareas.push(['Países', listarPaisesOrganizaciones().then((paises) => {
        llenarSelect(selectores.id_pais, nombres.id_pais, paises.map((p) => ({ valor: p.id_pais, etiqueta: p.nombre })));
        selectores.id_pais.value = config.id_pais;
        selectores.id_pais.disabled = false;
        avisoSelect(selectores.id_pais, paises.length === 0 ? 'No hay países disponibles.' : '');
      })]);
    }
    if (quiere('Programas')) {
      tareas.push(['Programas', listarProgramas().then((programas) => {
        const activos = programas.filter((p) => !p.archived_at);
        llenarSelect(selectores.id_programa, nombres.id_programa, activos.map((p) => ({ valor: p.id_programa, etiqueta: p.nombre })));
        selectores.id_programa.value = config.id_programa;
        selectores.id_programa.disabled = false;
        avisoSelect(selectores.id_programa, activos.length === 0 ? 'No hay programas disponibles.' : '');
      })]);
    }
    const necesitaIndicadoresOResultados = quiere('Indicadores') || quiere('Resultados');
    const opcionesIndicadoresYResultados = necesitaIndicadoresOResultados
      ? cargarOpcionesIndicadoresYResultados(
        () => listarAcciones(),
        (accion) => indicadores.listar(accion),
        () => listarOrganizaciones({}),
      ).then((opciones) => {
        opcionesTodas = opciones;
        opcionesCargadas = true;
        return opciones;
      })
      : null;
    if (quiere('Indicadores') && opcionesIndicadoresYResultados) {
      tareas.push(['Indicadores', opcionesIndicadoresYResultados.then(() => pintarIndicadores())]);
    }
    if (quiere('Organizaciones')) tareas.push(['Organizaciones', cargarOrganizaciones()]);
    if (quiere('Resultados')) {
      tareas.push(['Resultados', opcionesIndicadoresYResultados!.then(() => pintarResultados())]);
    }

    const resultados = await Promise.allSettled(tareas.map(([, tarea]) => tarea));
    resultados.forEach((resultado, indice) => {
      const nombre = tareas[indice][0];
      if (nombre === 'Organizaciones') return;
      if (resultado.status === 'fulfilled') {
        fallidos = fallidos.filter((n) => n !== nombre);
      } else if (!fallidos.includes(nombre)) {
        fallidos.push(nombre);
        if (nombre === 'Países') avisoSelect(selectores.id_pais, 'No fue posible cargar los países.');
        if (nombre === 'Programas') avisoSelect(selectores.id_programa, 'No fue posible cargar los programas.');
        if (nombre === 'Indicadores') pintarLista('indicadores', [], 'No fue posible cargar los indicadores.');
        if (nombre === 'Resultados') pintarLista('resultados', [], 'No fue posible cargar los resultados.');
      }
    });

    raiz.setAttribute('aria-busy', 'false');
    q<HTMLButtonElement>('reintentar').disabled = false;
    catalogosListos = true;
    q<HTMLButtonElement>('solicitar').disabled = consulta.estado.tipo === 'carga';
    if (fallidos.length > 0) {
      q('catalogos-estado').hidden = true;
      q('catalogos-error-texto').textContent =
        `No fue posible cargar: ${fallidos.join(', ')}. Los demás filtros siguen disponibles.`;
      q('catalogos-error').hidden = false;
    } else {
      q('catalogos-estado').hidden = true;
    }
    pintarSeleccion();
  }

  let catalogosListos = false;
  const paneles = { inactivo: 'inactivo', preparada: 'listo', carga: 'carga', error: 'error', vacio: 'vacio', exito: 'exito' } as const;

  let criteriosSolicitud: [string, string][] = [];
  let vistaParaExportar: ReportPreview | null = null;

  type EstadoExportacion = 'oculto' | 'lista' | 'confirmacion' | 'generando' | 'exito' | 'error';
  const estadosExportacion: Record<EstadoExportacion, string | null> = {
    oculto: null,
    lista: 'lista',
    confirmacion: 'confirmacion',
    generando: 'generando',
    exito: 'exito',
    error: 'error',
  };

  function pintarExportacion(estado: EstadoExportacion, mensaje?: string) {
    const seccion = q('exportacion');
    seccion.hidden = estado === 'oculto';
    seccion.setAttribute('aria-busy', String(estado === 'generando'));
    for (const panel of ['lista', 'confirmacion', 'generando', 'exito', 'error']) {
      q(`exportacion-${panel}`).hidden = estadosExportacion[estado] !== panel;
    }
    if (estado === 'exito') q('exportacion-exito').textContent = mensaje ?? 'El PDF fue descargado correctamente.';
    if (estado === 'error') q('exportacion-error-texto').textContent = mensaje ?? 'No fue posible descargar el PDF.';
  }

  function describirErrorPdf(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === 'REPORTE_NO_DISPONIBLE') return 'La vista previa ya no está disponible. Solicita una nueva antes de descargar el PDF.';
      if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión antes de descargar el PDF.';
      if (error.status === 403) return 'Tu cuenta no tiene permiso para exportar este reporte.';
      if (error.status === 413) return 'El reporte supera el límite de exportación. Reduce el período o los filtros.';
      if (error.status === 429) return 'Hay demasiados reportes en preparación. Espera un momento e inténtalo nuevamente.';
      if (error.status === 0 || error.status >= 500) return 'No fue posible generar el PDF. Inténtalo nuevamente.';
      return error.message || 'No fue posible descargar el PDF.';
    }
    return 'No fue posible descargar el PDF. Inténtalo nuevamente.';
  }

  function iniciarDescarga(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = fileName;
    enlace.hidden = true;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function descargarPdf() {
    const vista = vistaParaExportar;
    if (!vista) return;
    pintarExportacion('generando');
    try {
      const archivo = await reportes.descargar(vista.download);
      iniciarDescarga(archivo.blob, archivo.fileName);
      pintarExportacion('exito', `PDF descargado: ${archivo.fileName}. Volviendo a Reportes…`);
      window.setTimeout(() => {
        window.location.assign(`/reportes?${new URLSearchParams({ pdf: archivo.fileName })}`);
      }, 1200);
    } catch (error) {
      pintarExportacion('error', describirErrorPdf(error));
    }
  }

  const HASH_VISTA = '#vista-previa';
  function mostrarPaso(paso: 'configurar' | 'vista', enfocar = true) {
    const enVista = paso === 'vista';
    q('paso-configurar').hidden = enVista;
    q('paso-vista').hidden = !enVista;
    q('paso-1').classList.toggle('rep-paso-activo', !enVista);
    q('paso-2').classList.toggle('rep-paso-activo', enVista);
    q('vista-disponible').hidden = enVista || !vistaParaExportar;
    const migas = document.getElementById('rep-migas-paso');
    if (migas) migas.textContent = enVista ? 'Vista previa' : 'Configurar reporte';
    raiz.scrollIntoView({ block: 'start' });
    if (!enfocar) return;
    if (enVista) q('vista-titulo').focus({ preventScroll: true });
    else q<HTMLButtonElement>('solicitar').focus({ preventScroll: true });
  }
  function abrirVista() {
    if (!vistaParaExportar) return;
    if (location.hash !== HASH_VISTA) history.pushState({ paso: 'vista' }, '', HASH_VISTA);
    mostrarPaso('vista');
  }
  function volverAConfigurar() {
    if (location.hash === HASH_VISTA && history.state?.paso === 'vista') history.back();
    else mostrarPaso('configurar');
  }
  window.addEventListener('popstate', () => {
    if (location.hash === HASH_VISTA && vistaParaExportar) mostrarPaso('vista');
    else mostrarPaso('configurar');
  });

  function pintarConsulta(estado: EstadoConsulta) {
    for (const panel of Object.values(paneles)) q(`consulta-${panel}`).hidden = panel !== paneles[estado.tipo];
    const conVista = estado.tipo === 'exito' || estado.tipo === 'vacio';
    q('consulta-parametros').hidden = estado.tipo === 'inactivo' || conVista;
    q('consulta').setAttribute('aria-busy', String(estado.tipo === 'carga'));
    q<HTMLButtonElement>('solicitar').disabled = !catalogosListos || estado.tipo === 'carga';
    if (estado.tipo === 'error') {
      q('consulta-error-texto').textContent = estado.mensaje;
      q('consulta-reintentar').hidden = !estado.reintentable;
    }
    const contenedorVista = q('vista-previa');
    contenedorVista.hidden = !conVista;
    if (conVista) {
      vistaParaExportar = estado.vista;
      renderizarVistaPrevia(contenedorVista, estado.vista, { criterios: criteriosSolicitud });
      pintarExportacion('lista');
      abrirVista();
    } else {
      vistaParaExportar = null;
      contenedorVista.replaceChildren();
      pintarExportacion('oculto');
      if (!q('paso-vista').hidden) mostrarPaso('configurar', false);
      q('vista-disponible').hidden = true;
    }
  }

  const consulta = crearControladorConsulta(pintarConsulta);

  function solicitar(parametros: ReportFilters) {
    criteriosSolicitud = criteriosActuales();
    pintarParametros();
    const responderConsulta = consulta.preparar(parametros);
    let atendidaPorExtension = false;
    const responder: SolicitudReporte['responder'] = (respuesta) => {
      atendidaPorExtension = true;
      responderConsulta(respuesta);
    };
    const detalle: SolicitudReporte = { parametros, responder };
    raiz.dispatchEvent(new CustomEvent<SolicitudReporte>('reporte:solicitar', { detail: detalle, bubbles: true }));
    if (!atendidaPorExtension) responder(reportes.preparar(parametros));
  }

  function formatearFecha(valor: string) {
    const [anio, mes, dia] = valor.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  function criteriosActuales(): [string, string][] {
    return [
      ['Período', `${formatearFecha(config.fecha_inicio)} al ${formatearFecha(config.fecha_termino)}`],
      ['Destino', etiquetasDestino[config.destino]],
      ...filtrosSeleccionados(config, nombres).map((f): [string, string] => {
        const [titulo, ...resto] = f.etiqueta.split(': ');
        return [titulo, resto.join(': ')];
      }),
    ];
  }

  function pintarParametros() {
    const lista = q('parametros');
    lista.replaceChildren();
    for (const [titulo, valor] of criteriosSolicitud) {
      const caja = document.createElement('div');
      caja.className = 'rep-param';
      const dt = document.createElement('dt');
      dt.textContent = titulo;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      caja.append(dt, dd);
      lista.append(caja);
    }
  }

  form.addEventListener('input', (evento) => {
    const control = evento.target as HTMLInputElement;
    if (control.name === 'id_pais') return;
    actualizar();
  });

  selectores.id_pais.addEventListener('change', () => {
    consulta.reiniciar();
    leerFormulario();
    config.id_organizacion = '';
    selectores.id_organizacion.value = '';
    pintarSeleccion();
    revalidar();
    void cargarOrganizaciones();
  });

  q('restablecer').addEventListener('click', () => {
    consulta.reiniciar();
    leerFormulario();
    const paisAnterior = config.id_pais;
    config = restablecerFiltros(config);
    pintarFormulario();
    pintarSeleccion();
    revalidar();
    if (paisAnterior) void cargarOrganizaciones();
    else pintarRelacionados();
  });

  q('reintentar').addEventListener('click', () => {
    void cargarCatalogos([...fallidos]);
  });

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    intentado = true;
    leerFormulario();
    limpiarErrores();
    q('error-general').hidden = true;
    const resultado = validarConfiguracion(config);
    if (!resultado.ok) {
      let primero: HTMLElement | null = null;
      for (const [campo, mensaje] of Object.entries(resultado.errores)) {
        mostrarError(campo as CampoConfiguracion, mensaje);
        primero ??= raiz.querySelector<HTMLElement>(`[data-campo-wrap="${campo}"] input:not([type=checkbox]), [data-campo-wrap="${campo}"] select`);
      }
      q('error-general').textContent = 'Corrige los campos marcados antes de continuar.';
      q('error-general').hidden = false;
      consulta.reiniciar();
      primero?.focus();
      return;
    }
    solicitar(resultado.parametros);
  });

  q('consulta-reintentar').addEventListener('click', () => {
    const estado = consulta.estado;
    if (estado.tipo === 'error' && estado.reintentable) solicitar(estado.parametros);
  });

  q('volver-configurar').addEventListener('click', volverAConfigurar);
  q('ver-vista').addEventListener('click', abrirVista);
  q('exportar-pdf').addEventListener('click', () => pintarExportacion('confirmacion'));
  q('cancelar-pdf').addEventListener('click', () => pintarExportacion('lista'));
  q('confirmar-pdf').addEventListener('click', () => { void descargarPdf(); });
  q('exportacion-reintentar').addEventListener('click', () => pintarExportacion('confirmacion'));

  selectores.id_organizacion.addEventListener('change', () => { pintarRelacionados(); revalidar(); });
  selectores.id_programa.addEventListener('change', () => { pintarRelacionados(); revalidar(); });

  q('indicadores-opciones').addEventListener('change', () => {
    pintarResultados();
    pintarSeleccion();
    if (marcados('indicadores').length > MAX_SELECCION) {
      q('error-general').textContent = `Puedes seleccionar hasta ${MAX_SELECCION} indicadores.`;
      q('error-general').hidden = false;
    }
  });

  pintarSeleccion();
  consulta.reiniciar();
  pintarExportacion('oculto');
  if (location.hash === HASH_VISTA) history.replaceState(null, '', location.pathname + location.search);
  mostrarPaso('configurar', false);
  void cargarCatalogos();
}
