import { ApiError } from '../api/transporte.ts';
import { camposActaSchema, type ActaReunion, type GuardarActa } from './modelo.ts';
import { crearDemoActas } from './demo.ts';

export async function iniciarActasReunion() {
  const raizEncontrada =
    document.querySelector<HTMLElement>('#actas-reunion');

  if (!raizEncontrada) return;

  const raiz: HTMLElement = raizEncontrada;

  const idOrganizacion = raiz.dataset.organizacion;

if (!idOrganizacion) {
  throw new Error('No se encontró la organización asociada a las actas.');
}

const organizacionId: string = idOrganizacion;
const compromisos = import.meta.env.DEV
  ? (await import('../compromisos/en-actas')).iniciarCompromisosEnActas(raiz, organizacionId)
  : null;

const buscar = <T extends HTMLElement>(
  selector: string,
): T => raiz.querySelector<T>(selector)!;

  const estadoCarga = buscar('#actas-carga');
  const estadoVacio = buscar('#actas-vacio');
  const historial = buscar('#actas-historial');
  const listaActas = buscar('#lista-actas');
  const cantidadActas = buscar('#cantidad-actas');

  const formularioContenedor = buscar('#actas-formulario-contenedor');
  const formulario = buscar<HTMLFormElement>('#actas-formulario');

  const tituloFormulario = buscar('#actas-formulario-titulo');
  const btnGuardar = buscar<HTMLButtonElement>('#actas-guardar');
  const btnCancelar = buscar<HTMLButtonElement>('#actas-cancelar');
  const mensaje = buscar('#actas-mensaje');

  const detalle = buscar('#actas-detalle');
  const btnVolver = buscar<HTMLButtonElement>('#actas-volver');
  const btnEditar = buscar<HTMLButtonElement>('#actas-editar');

  const btnNueva = buscar<HTMLButtonElement>('#actas-nueva');

  const plan = buscar<HTMLSelectElement>('#actas-plan');
  const accion = buscar<HTMLSelectElement>('#actas-accion');
  const fecha = buscar<HTMLInputElement>('#actas-fecha');
  const asistentes = buscar<HTMLSelectElement>('#actas-asistentes');
  const asistentesExternos = buscar<HTMLInputElement>('#actas-asistentes-externos');
  const objetivo = buscar<HTMLTextAreaElement>('#actas-objetivo');
  const observaciones = buscar<HTMLTextAreaElement>('#actas-observaciones');

  const errorGeneral = buscar('#actas-error');

  let servicio = crearDemoActas();
  let registro: ActaReunion[] = [];
  let actaEditando: ActaReunion | null = null;
  let actaDetalle: ActaReunion | null = null;
  let ocupado = false;
  let iniciado = false;

  const fechaActual = new Date().toISOString().split('T')[0];

  function ocultarTodo() {
    estadoCarga.hidden = true;
    estadoVacio.hidden = true;
    historial.hidden = true;
    formularioContenedor.hidden = true;
    detalle.hidden = true;
  }

  function mostrarCarga() {
    ocultarTodo();
    estadoCarga.hidden = false;
  }

  function limpiarErrores() {
    errorGeneral.hidden = true;
    errorGeneral.textContent = '';

    formulario.querySelectorAll<HTMLElement>('[data-error-acta]').forEach((elemento) => {
      elemento.classList.add('hidden');
      elemento.textContent = '';
    });

    formulario
      .querySelectorAll<HTMLElement>('[aria-invalid="true"]')
      .forEach((elemento) => {
        elemento.setAttribute('aria-invalid', 'false');
        elemento.classList.remove('border-danger');
      });
  }

  function mostrarErrorGeneral(texto: string) {
    errorGeneral.textContent = texto;
    errorGeneral.hidden = false;
  }

  function mostrarErrorCampo(
    elemento: HTMLElement,
    selectorError: string,
    texto: string,
  ) {
    elemento.classList.add('border-danger');
    elemento.setAttribute('aria-invalid', 'true');

    const error = buscar<HTMLElement>(selectorError);
    error.textContent = texto;
    error.classList.remove('hidden');
  }

  function ocupar(valor: boolean, texto = '') {
    ocupado = valor;

    formulario.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >('input, select, textarea, button').forEach((elemento) => {
      elemento.disabled = valor;
    });

    btnNueva.disabled = valor;
    raiz.setAttribute('aria-busy', String(valor));

    if (texto) {
      estadoCarga.querySelector('p')!.textContent = texto;
    }
  }

  function formatearFecha(valor: string) {
    const [anio, mes, dia] = valor.split('-').map(Number);

    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(anio, mes - 1, dia));
  }

  function escaparHtml(valor: string) {
    return valor
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function mostrarHistorial() {
    ocultarTodo();

    if (registro.length === 0) {
      estadoVacio.hidden = false;
      return;
    }

    historial.hidden = false;
    renderizarActas();
  }

  function renderizarActas() {
    const ordenadas = [...registro].sort((a, b) =>
      b.fecha_reunion.localeCompare(a.fecha_reunion),
    );

    cantidadActas.textContent =
      `${ordenadas.length} ${ordenadas.length === 1 ? 'acta registrada' : 'actas registradas'}`;

    listaActas.innerHTML = ordenadas
      .map(
        (acta) => `
          <article class="rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-sm">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-wide text-primary">
                  ${escaparHtml(formatearFecha(acta.fecha_reunion))}
                </p>

                <h4 class="mt-1 text-base font-semibold text-neutral-900">
                  ${escaparHtml(acta.objetivo || 'Reunión registrada')}
                </h4>

                <p class="mt-1 text-sm text-neutral-500">
                  ${escaparHtml(acta.id_plan || 'Plan no especificado')}
                </p>
              </div>

              <button
                type="button"
                data-ver-acta="${escaparHtml(acta.id_acta)}"
                class="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Ver detalle
              </button>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-2">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Asistentes
                </p>

                <p class="mt-1 text-sm text-neutral-700">
                  ${acta.asistentes.length}
                  ${acta.asistentes.length === 1 ? 'persona' : 'personas'}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Acción
                </p>

                <p class="mt-1 text-sm text-neutral-700">
                  ${escaparHtml(acta.id_accion || 'No especificada')}
                </p>
              </div>
            </div>
          </article>
        `,
      )
      .join('');

    listaActas
      .querySelectorAll<HTMLButtonElement>('[data-ver-acta]')
      .forEach((boton) => {
        boton.addEventListener('click', () => {
          const id = boton.dataset.verActa;

          if (!id) return;

          mostrarDetalle(id);
        });
      });
  }

  function limpiarFormulario() {
    formulario.reset();

    fecha.value = fechaActual;
    fecha.max = fechaActual;

    Array.from(asistentes.options).forEach((opcion) => {
      opcion.selected = false;
    });

    limpiarErrores();
    mensaje.hidden = true;
    mensaje.textContent = '';
  }

  function cargarActaEnFormulario(acta: ActaReunion) {
    plan.value = acta.id_plan;
    accion.value = acta.id_accion;
    fecha.value = acta.fecha_reunion;
    asistentesExternos.value = acta.asistentes_externos;
    objetivo.value = acta.objetivo;
    observaciones.value = acta.observaciones;

    Array.from(asistentes.options).forEach((opcion) => {
      opcion.selected = acta.asistentes.includes(opcion.value);
    });
  }

  function mostrarFormulario(acta: ActaReunion | null = null) {
    if (ocupado) return;

    ocultarTodo();
    limpiarFormulario();

    actaEditando = acta;
    compromisos?.reiniciar(!!acta);

    tituloFormulario.textContent = acta
      ? 'Editar acta de reunión'
      : 'Registrar acta';

    btnGuardar.textContent = acta
      ? 'Guardar cambios'
      : 'Guardar acta';

    formularioContenedor.hidden = false;

    if (acta) {
      cargarActaEnFormulario(acta);
    }

    plan.focus();
  }

  function mostrarMensaje(tipo: 'success' | 'error', texto: string) {
    mensaje.textContent = texto;

    mensaje.className =
      tipo === 'success'
        ? 'rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success'
        : 'rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger';

    mensaje.hidden = false;
  }

  function obtenerDatosFormulario(): GuardarActa {
    const asistentesSeleccionados = Array.from(
      asistentes.selectedOptions,
    ).map((opcion) => opcion.value);

    return {
      campos: {
        id_plan: plan.value.trim(),
        id_accion: accion.value.trim(),
        fecha_reunion: fecha.value,
        asistentes: asistentesSeleccionados,
        asistentes_externos: asistentesExternos.value.trim(),
        objetivo: objetivo.value.trim(),
        observaciones: observaciones.value.trim(),
      },
    };
  }

  function validarFormulario(): GuardarActa | null {
    limpiarErrores();

    const entrada = obtenerDatosFormulario();

    const validacion = camposActaSchema.safeParse(entrada.campos);

    if (validacion.success) {
      return {
        campos: validacion.data,
      };
    }

    for (const issue of validacion.error.issues) {
      const campo = String(issue.path[0]);

      const mapa: Record<string, [HTMLElement, string]> = {
        id_plan: [plan, '#error-plan-acta'],
        id_accion: [accion, '#error-accion-acta'],
        fecha_reunion: [fecha, '#error-fecha-acta'],
        asistentes: [asistentes, '#error-asistentes-acta'],
        objetivo: [objetivo, '#error-objetivo-acta'],
      };

      const configuracion = mapa[campo];

      if (configuracion) {
        mostrarErrorCampo(
          configuracion[0],
          configuracion[1],
          issue.message,
        );
      }
    }

    mostrarErrorGeneral(
      'Debes completar correctamente los campos obligatorios antes de guardar.',
    );

    return null;
  }

  function mostrarDetalle(id: string) {
    const acta = registro.find((item) => item.id_acta === id);

    if (!acta) return;

    actaDetalle = acta;
    compromisos?.detalle(id);

    ocultarTodo();
    detalle.hidden = false;

    buscar('#detalle-fecha').textContent =
      formatearFecha(acta.fecha_reunion);

    buscar('#detalle-plan').textContent =
      acta.id_plan || 'No especificado';

    buscar('#detalle-accion').textContent =
      acta.id_accion || 'No especificada';

    const asistentesDetalle = buscar('#detalle-asistentes');

    asistentesDetalle.innerHTML = acta.asistentes
      .map(
        (persona) => `
          <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            ${escaparHtml(persona)}
          </span>
        `,
      )
      .join('');

    const externos = buscar('#detalle-asistentes-externos');

    if (acta.asistentes_externos) {
      externos.textContent =
        `Asistentes externos: ${acta.asistentes_externos}`;
      externos.classList.remove('hidden');
    } else {
      externos.textContent = '';
      externos.classList.add('hidden');
    }

    buscar('#detalle-objetivo').textContent = acta.objetivo;

    buscar('#detalle-observaciones').textContent =
      acta.observaciones || 'Sin observaciones registradas.';
  }

  async function cargar() {
    if (ocupado) return;

    iniciado = true;
    limpiarErrores();
    mostrarCarga();

    ocupar(true, 'Cargando actas...');

    try {
      registro = await servicio.obtener(organizacionId);
      mostrarHistorial();
    } catch (fallo) {
      mostrarHistorial();
      mostrarErrorGeneral(
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible cargar las actas.',
      );
    } finally {
      ocupar(false);
    }
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (ocupado) return;

    const entrada = validarFormulario();

    if (!entrada) return;
    if (!actaEditando && compromisos) {
      const borradores = compromisos.obtener();
      if (!borradores) return;
      entrada.compromisos = borradores;
    }

    btnGuardar.disabled = true;
    btnGuardar.textContent = actaEditando
      ? 'Guardando cambios...'
      : 'Guardando...';

    ocupar(true, 'Guardando acta...');

    try {
      if (actaEditando) {
        const actualizada = await servicio.actualizar(
          organizacionId,
          actaEditando.id_acta,
          actaEditando.version,
          entrada,
        );

        registro = registro.map((acta) =>
          acta.id_acta === actualizada.id_acta ? actualizada : acta,
        );

        mostrarMensaje(
          'success',
          'El acta se actualizó correctamente.',
        );
      } else {
        const nueva = await servicio.crear(
          organizacionId,
          entrada,
        );

        registro = [...registro, nueva];
        window.dispatchEvent(new CustomEvent('compromisos:demo-guardados'));

        mostrarMensaje(
          'success',
          'El acta se registró correctamente.',
        );
      }

      actaEditando = null;

      window.setTimeout(() => {
        mostrarHistorial();
      }, 900);
    } catch (fallo) {
      mostrarMensaje(
        'error',
        fallo instanceof Error
          ? fallo.message
          : 'No fue posible guardar el acta.',
      );
    } finally {
      ocupar(false);
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar acta';
    }
  });

  btnNueva.addEventListener('click', () => {
    mostrarFormulario();
  });

  btnCancelar.addEventListener('click', () => {
    if (ocupado) return;

    actaEditando = null;
    mostrarHistorial();
  });

  btnVolver.addEventListener('click', () => {
    actaDetalle = null;
    mostrarHistorial();
  });

  btnEditar.addEventListener('click', () => {
    if (!actaDetalle) return;

    mostrarFormulario(actaDetalle);
  });

  if (!iniciado) {
    await cargar();
  }
  window.addEventListener('compromisos:abrir-acta', async evento => {
    const datos = (evento as CustomEvent<{ id: string; org: string }>).detail;
    if (datos.org !== organizacionId || ocupado) return;
    await cargar();
    mostrarDetalle(datos.id);
  });
}
