import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteCompromisos } from './cliente';
import { crearDescargaPdfCompromisos, guardarArchivo } from './pdf';
import { guardarCompromisoSchema, vencido, type ActaOrigen, type Compromiso } from './modelo';
import { crearTarjetaRegistro, type TonoInsignia } from '../ui/registro';

export function iniciarCompromisos() {
  const encontrada = document.querySelector<HTMLElement>('#compromisos');
  if (!encontrada) return;

  const raiz = encontrada;
  if (raiz.dataset.compromisosInicializado === 'true') return;
  raiz.dataset.compromisosInicializado = 'true';

  const org = raiz.dataset.organizacion;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const elemento = raiz.querySelector<T>(`#comp-${id}`);
    if (!elemento) throw new Error(`No se encontró el elemento #comp-${id} del módulo Compromisos.`);
    return elemento;
  };
  const opcional = <T extends HTMLElement = HTMLElement>(id: string): T | null => raiz.querySelector<T>(`#comp-${id}`);

  if (!org) {
    const mensaje = opcional('error');
    if (mensaje) {
      mensaje.textContent = 'No se encontró la organización para consultar sus compromisos.';
      mensaje.hidden = false;
    }
    return;
  }

  const form = q<HTMLFormElement>('form');
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const apiBase = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';
  const tokenSesion = async () => {
    const { data, error: errorSesion } = await getSupabaseClient().auth.getSession();
    if (errorSesion || !data.session) {
      throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    }
    return data.session.access_token;
  };
  const real = crearClienteCompromisos(createApiTransport(apiBase), tokenSesion);
  const pdf = crearDescargaPdfCompromisos(apiBase, tokenSesion);

  let servicio = real;
  let demo = false;
  let ocupado = false;
  let conflicto = false;
  let cargado = false;
  let actas: ActaOrigen[] = [];
  let actual: Compromiso | null = null;

  function ocupar(valor: boolean) {
    ocupado = valor;
    raiz.setAttribute('aria-busy', String(valor));
    q('carga').hidden = !valor;

    // Conserva el estado previo de cada botón para no dejar bloqueados
    // los botones de detalle/listado al terminar una petición.
    raiz.querySelectorAll<HTMLButtonElement>('button').forEach((boton) => {
      if (valor) {
        if (boton.dataset.disabledAntesCarga === undefined) {
          boton.dataset.disabledAntesCarga = String(boton.disabled);
        }
        boton.disabled = true;
      } else if (boton.dataset.disabledAntesCarga !== undefined) {
        boton.disabled = boton.dataset.disabledAntesCarga === 'true';
        delete boton.dataset.disabledAntesCarga;
      }
    });

    q<HTMLFieldSetElement>('campos').disabled = valor;

    if (!valor) {
      q<HTMLButtonElement>('nuevo').disabled = !cargado || actas.length === 0;
      // El PDF se genera en el Backend con datos reales: no aplica a la demostración.
      q<HTMLButtonElement>('pdf-acta').disabled = demo;
      q<HTMLButtonElement>('guardar').disabled = conflicto;
    }
  }

  function limpiar() {
    q('error').hidden = true;
    q('exito').hidden = true;

    form.querySelectorAll('[data-comp-error]').forEach((nodo) => nodo.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach((nodo) => {
      nodo.setAttribute('aria-invalid', 'false');
      const control = nodo as HTMLElement;
      const hint = document.getElementById(`${control.id}-hint`);
      if (hint) control.setAttribute('aria-describedby', hint.id);
      else control.removeAttribute('aria-describedby');
    });
  }

  function error(fallo: unknown) {
    q('error').textContent = fallo instanceof ApiError && (fallo.code === 'RUTA_NO_ENCONTRADA' || fallo.status === 501)
      ? 'El servicio de Compromisos todavía no está disponible. Puedes probar la demostración en desarrollo.'
      : fallo instanceof Error
        ? fallo.message
        : 'No fue posible completar la operación. Inténtalo nuevamente.';
    q('error').hidden = false;
  }

  function vista(nombre: 'listado' | 'detalle' | 'form') {
    for (const id of ['listado', 'detalle', 'form']) q(id).hidden = id !== nombre;
    q('nuevo').hidden = nombre !== 'listado';
  }

  function texto(nodo: HTMLElement, etiqueta: string, valor: string | null | undefined) {
    const grupo = document.createElement('div');
    grupo.className = 'min-w-0 rounded-xl border border-[#E8E5EF] bg-white p-3.5';

    const dt = document.createElement('dt');
    dt.className = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
    dt.textContent = etiqueta;

    const dd = document.createElement('dd');
    dd.className = 'mt-1.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900';
    dd.textContent = (valor ?? '').trim() || 'Sin información';

    grupo.append(dt, dd);
    nodo.append(grupo);
  }

  function fecha(valor: string | null | undefined) {
    return valor ? valor.slice(0, 10).split('-').reverse().join('/') : '—';
  }

  function etiquetaEstado(registro: Compromiso) {
    if (vencido(registro)) return 'Vencido';
    return registro.estado === 'cumplido' ? 'Cumplido' : 'Pendiente';
  }

  function clasesEstado(registro: Compromiso) {
    if (vencido(registro)) return 'registro-insignia registro-insignia--rosado';
    if (registro.estado === 'cumplido') return 'registro-insignia registro-insignia--verde';
    return 'registro-insignia registro-insignia--amarillo';
  }

  function tonoEstado(registro: Compromiso): TonoInsignia {
    if (vencido(registro)) return 'rosado';
    return registro.estado === 'cumplido' ? 'verde' : 'amarillo';
  }

  function listar(registros: Compromiso[]) {
    const lista = q('lista');
    lista.replaceChildren();
    q('vacio').hidden = registros.length > 0;
    q('sin-actas').hidden = actas.length > 0;
    q('cantidad').hidden = registros.length === 0;
    q('cantidad').textContent = `${registros.length} ${registros.length === 1 ? 'compromiso registrado' : 'compromisos registrados'}`;

    for (const registro of registros) {
      const origen = actas.find((acta) => acta.id_acta === registro.id_acta);
      const estado = etiquetaEstado(registro);
      lista.append(crearTarjetaRegistro({
        contexto: `Fecha límite ${fecha(registro.fecha_limite)}`,
        titulo: registro.descripcion || 'Compromiso sin descripción',
        insignias: [{ texto: estado, tono: tonoEstado(registro), etiqueta: `Estado: ${estado}` }],
        datos: [['Responsable', registro.responsable_nombre], ['Acta de origen', origen?.nombre ?? 'Acta asociada']],
        accion: { texto: 'Ver detalle', alPulsar: () => { void consultar(registro.id_compromiso); } },
      }));
    }

    vista('listado');
  }

  async function cargar(confirmar = true) {
    if (ocupado) return;
    if (confirmar && !form.hidden && !window.confirm('Se descartarán los cambios del formulario. ¿Recargar?')) return;

    limpiar();
    ocupar(true);
    try {
      const [registros, origenes] = await Promise.all([servicio.listar(org), servicio.actas(org)]);
      actas = origenes;
      cargado = true;
      conflicto = false;
      actual = null;
      listar(registros);
    } catch (fallo) {
      cargado = false;
      q('lista').replaceChildren();
      q('vacio').hidden = true;
      q('sin-actas').hidden = true;
      vista('listado');
      error(fallo);
    } finally {
      ocupar(false);
    }
  }

  function detalle(registro: Compromiso) {
    actual = registro;
    q('datos').replaceChildren();
    q('datos').className = 'mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

    const camposDetalle: [string, string | null | undefined][] = [
      ['Acuerdo', registro.descripcion],
      ['Responsable', registro.responsable_nombre],
      ['Contacto del responsable', registro.responsable_contacto],
      ['Fecha límite', fecha(registro.fecha_limite)],
      ['Registrado', fecha(registro.created_at)],
      ['Última actualización', fecha(registro.updated_at)],
      ['Cumplido el', fecha(registro.cumplido_at)],
      ['Observaciones', registro.observaciones],
    ];
    camposDetalle.forEach(([etiqueta, valor]) => texto(q('datos'), etiqueta, valor));

    const estado = q('detalle-estado');
    estado.textContent = etiquetaEstado(registro);
    estado.className = clasesEstado(registro);

    const origen = actas.find((acta) => acta.id_acta === registro.id_acta);
    const enlace = q<HTMLAnchorElement>('origen');
    const etiquetaOrigen = q<HTMLSpanElement>('origen-label');
    etiquetaOrigen.textContent = origen?.nombre ?? 'Consultar acta de origen';
    // La ficha de organización reconoce #actas como subsección interna.
    // El parámetro acta permite que el módulo abra directamente ese registro.
    enlace.href = `/organizaciones/${encodeURIComponent(org)}?acta=${encodeURIComponent(registro.id_acta)}#actas`;
    enlace.onclick = (evento) => {
      if (!demo) return;
      evento.preventDefault();
      // En modo demo no navegamos a otra página: mostramos la subsección y
      // enviamos el ID para abrir el acta seleccionada dentro del módulo.
      document.querySelector<HTMLElement>('[data-org-seccion="actas"]')?.click();
      window.dispatchEvent(new CustomEvent('compromisos:abrir-acta', { detail: { id: registro.id_acta, org } }));
    };

    const accion = q<HTMLAnchorElement>('accion');
    accion.hidden = !origen?.id_plan || !origen?.id_accion;
    if (!accion.hidden && origen?.id_plan && origen?.id_accion) {
      accion.href = `/planes/${encodeURIComponent(origen.id_plan)}/acciones/${encodeURIComponent(origen.id_accion)}`;
    }

    vista('detalle');
  }

  async function consultar(id: string) {
    if (ocupado) return;
    limpiar();
    ocupar(true);
    try {
      detalle(await servicio.obtener(org, id));
    } catch (fallo) {
      error(fallo);
    } finally {
      ocupar(false);
    }
  }

  function editar(nuevo = false) {
    if (ocupado) return;
    limpiar();
    if (nuevo) actual = null;
    form.reset();

    q('form-titulo').textContent = actual ? 'Editar compromiso' : 'Registrar compromiso';
    const select = q<HTMLSelectElement>('acta');
    select.replaceChildren(new Option('Selecciona un acta', ''));
    actas.forEach((acta) => select.add(new Option(acta.nombre, acta.id_acta)));
    if (actual && !actas.some((acta) => acta.id_acta === actual!.id_acta)) {
      select.add(new Option('Acta de origen', actual.id_acta));
    }

    for (const nombre of Object.keys(guardarCompromisoSchema.shape)) {
      const control = campo(nombre);
      control.value = actual
        ? String(actual[nombre as keyof Compromiso] ?? '')
        : nombre === 'estado' ? 'pendiente' : '';
    }

    select.disabled = !!actual;
    campo('estado').disabled = !actual;
    q<HTMLButtonElement>('guardar').disabled = conflicto;
    if (conflicto) error(new Error('Recarga los datos antes de guardar: el registro cambió en otra sesión.'));

    vista('form');
    (actual ? campo('descripcion') : select).focus();
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado || conflicto) return;
    limpiar();

    const valores = Object.fromEntries(
      Object.keys(guardarCompromisoSchema.shape).map((nombre) => [nombre, campo(nombre).value]),
    );
    const datos = guardarCompromisoSchema.safeParse(valores);

    if (!datos.success) {
      for (const issue of datos.error.issues) {
        const control = campo(String(issue.path[0]));
        if (control.getAttribute('aria-invalid') === 'true') continue;
        control.setAttribute('aria-invalid', 'true');
        const mensaje = document.createElement('p');
        mensaje.id = `${control.id}-error`;
        mensaje.dataset.compError = '';
        mensaje.className = 'mt-1.5 text-sm text-rose-700';
        mensaje.textContent = issue.message;
        const hint = document.getElementById(`${control.id}-hint`);
        control.setAttribute('aria-describedby', `${hint ? `${hint.id} ` : ''}${mensaje.id}`);
        control.after(mensaje);
      }
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    ocupar(true);
    try {
      const guardado = actual
        ? await servicio.actualizar(org, actual.id_compromiso, actual.version, datos.data)
        : await servicio.crear(org, datos.data);
      detalle(guardado);
      q('exito').textContent = demo
        ? 'Compromiso guardado en la demostración. No se guardó en el servidor.'
        : 'Compromiso guardado correctamente.';
      q('exito').hidden = false;
    } catch (fallo) {
      if (fallo instanceof ApiError && fallo.status === 409) conflicto = true;
      error(fallo);
      q('error').focus();
    } finally {
      ocupar(false);
    }
  });

  // Solo se descarga el PDF de un acta: sus compromisos se comparten con quienes participaron en esa reunión.
  async function descargarPdf(idActa: string) {
    if (ocupado || demo) return;
    limpiar();
    ocupar(true);
    try {
      const archivo = await pdf.descargar(org!, idActa);
      guardarArchivo(archivo.blob, archivo.fileName);
      q('exito').textContent = 'Se descargó el PDF con los compromisos del acta.';
      q('exito').hidden = false;
    } catch (fallo) {
      error(fallo);
    } finally {
      ocupar(false);
    }
  }
  q('pdf-acta').addEventListener('click', () => { if (actual) void descargarPdf(actual.id_acta); });
  q('nuevo').addEventListener('click', () => editar(true));
  q('editar').addEventListener('click', () => editar());
  q('cancelar').addEventListener('click', () => {
    if (ocupado) return;
    limpiar();
    if (actual) detalle(actual);
    else void cargar(false);
  });
  q('volver').addEventListener('click', () => { void cargar(false); });

  async function activarDemo() {
    if (ocupado || demo) return;
    if (!form.hidden && !window.confirm('Se descartarán los cambios para entrar en la demostración. ¿Continuar?')) return;

    ocupar(true);
    try {
      servicio = (await import('./demo')).crearDemoCompromisos();
      demo = true;
      cargado = false;
      conflicto = false;
      const aviso = opcional('demo-aviso');
      if (aviso) {
        aviso.textContent = 'Modo demostración: los cambios no se envían al servidor y se pierden al recargar la página. Las actas también son temporales.';
        aviso.hidden = false;
      }
      const botonDemo = opcional<HTMLButtonElement>('demo');
      const botonReal = opcional<HTMLButtonElement>('real');
      if (botonDemo) botonDemo.hidden = true;
      if (botonReal) botonReal.hidden = false;
    } finally {
      ocupar(false);
    }
    await cargar(false);
  }

  if (import.meta.env.DEV) {
    opcional<HTMLButtonElement>('demo')?.addEventListener('click', () => { void activarDemo(); });
    opcional<HTMLButtonElement>('real')?.addEventListener('click', () => {
      if (!ocupado) window.location.reload();
    });
    window.addEventListener('compromisos:demo-guardados', () => {
      if (demo && form.hidden) void cargar(false);
    });
  }

  document.querySelector<HTMLButtonElement>('[data-tab="compromisos"]')?.addEventListener('click', () => {
    if (!cargado || (demo && form.hidden)) void cargar(false);
  });

  void cargar(false);
}
