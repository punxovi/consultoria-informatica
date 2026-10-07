import {
  camposDiagnosticoSchema,
  type CamposDiagnostico,
  type Diagnostico,
} from './modelo';
import { crearDemoDiagnostico } from './demo';

let servicio = crearDemoDiagnostico();

let diagnosticoActual: Diagnostico | null = null;
let editando = false;

function obtenerElemento<T extends HTMLElement>(id: string): T {
  const elemento = document.getElementById(id);

  if (!elemento) {
    throw new Error(`No se encontró el elemento #${id}.`);
  }

  return elemento as T;
}

function obtenerOrganizacionId(): string {
  const estadoOrganizacion =
    document.querySelector<HTMLElement>('#estado-organizacion');

  const idOrganizacion = estadoOrganizacion?.dataset.id;

  if (!idOrganizacion) {
    throw new Error(
      'No fue posible obtener el identificador de la organización.',
    );
  }

  return idOrganizacion;
}

function ocultarTodo() {
  obtenerElemento<HTMLElement>('estado-sin-diagnostico').hidden = true;
  obtenerElemento<HTMLFormElement>('form-diagnostico').hidden = true;
  obtenerElemento<HTMLElement>('diagnostico-registrado').hidden = true;
}

function mostrarCarga(mostrar: boolean) {
  obtenerElemento<HTMLElement>('diagnostico-carga').hidden = !mostrar;
}

function mostrarError(mensaje: string | null) {
  const elemento = obtenerElemento<HTMLElement>('diagnostico-error');

  if (!mensaje) {
    elemento.textContent = '';
    elemento.hidden = true;
    return;
  }

  elemento.textContent = mensaje;
  elemento.hidden = false;
}

function mostrarConfirmacion(mensaje: string | null) {
  const elemento = obtenerElemento<HTMLElement>(
    'diagnostico-confirmacion',
  );

  if (!mensaje) {
    elemento.textContent = '';
    elemento.hidden = true;
    return;
  }

  elemento.textContent = mensaje;
  elemento.hidden = false;
}

function mostrarEstadoSinDiagnostico() {
  ocultarTodo();

  obtenerElemento<HTMLElement>('estado-sin-diagnostico').hidden = false;

  obtenerElemento<HTMLButtonElement>(
    'btn-registrar-diagnostico',
  ).hidden = false;

  diagnosticoActual = null;
  editando = false;

  limpiarFormulario();
}

function mostrarFormulario(diagnostico: Diagnostico | null = null) {
  ocultarTodo();

  const formulario =
    obtenerElemento<HTMLFormElement>('form-diagnostico');

  formulario.hidden = false;

  obtenerElemento<HTMLButtonElement>(
    'btn-registrar-diagnostico',
  ).hidden = true;

  mostrarConfirmacion(null);
  mostrarError(null);

  editando = diagnostico !== null;
  diagnosticoActual = diagnostico;

  if (diagnostico) {
    cargarDiagnosticoEnFormulario(diagnostico);
  } else {
    limpiarFormulario();
  }

  window.requestAnimationFrame(() => {
    formulario.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

function mostrarDiagnosticoRegistrado(
  diagnostico: Diagnostico,
) {
  ocultarTodo();

  const resumen =
    obtenerElemento<HTMLElement>('diagnostico-registrado');

  resumen.hidden = false;

  obtenerElemento<HTMLButtonElement>(
    'btn-registrar-diagnostico',
  ).hidden = false;

  obtenerElemento<HTMLButtonElement>(
    'btn-registrar-diagnostico',
  ).textContent = 'Editar diagnóstico';

  diagnosticoActual = diagnostico;
  editando = false;

  asignarResumen(diagnostico);
}

function limpiarFormulario() {
  const formulario =
    obtenerElemento<HTMLFormElement>('form-diagnostico');

  formulario.reset();

  const radios =
    document.querySelectorAll<HTMLInputElement>(
      'input[name="tiene-espacio-fisico"]',
    );

  radios.forEach((radio) => {
    radio.checked = false;
  });

  limpiarErrores();
}

function cargarDiagnosticoEnFormulario(
  diagnostico: Diagnostico,
) {
  const mision = obtenerElemento<HTMLTextAreaElement>('mision');
  const vision = obtenerElemento<HTMLTextAreaElement>('vision');

  const infraestructura = obtenerElemento<HTMLTextAreaElement>(
    'caracteristicas-infraestructura',
  );

  const espacios = obtenerElemento<HTMLTextAreaElement>(
    'espacios-disponibles',
  );

  const recursos = obtenerElemento<HTMLTextAreaElement>(
    'recursos-existentes',
  );

  const danos = obtenerElemento<HTMLTextAreaElement>(
    'danos-detectados',
  );

  const necesidades = obtenerElemento<HTMLTextAreaElement>(
    'necesidades-prioritarias',
  );

  const observaciones =
    obtenerElemento<HTMLTextAreaElement>('observaciones');

  const raciones =
    obtenerElemento<HTMLInputElement>('raciones');

  const periodo =
    obtenerElemento<HTMLSelectElement>('periodo-raciones');

  mision.value = diagnostico.mision;
  vision.value = diagnostico.vision;

  infraestructura.value =
    diagnostico.caracteristicas_infraestructura;

  espacios.value = diagnostico.espacios_disponibles;

  recursos.value = diagnostico.recursos_existentes;

  danos.value = diagnostico.danos_detectados;

  necesidades.value =
    diagnostico.necesidades_prioritarias;

  observaciones.value = diagnostico.observaciones;

  raciones.value =
    diagnostico.raciones !== null
      ? String(diagnostico.raciones)
      : '';

  periodo.value =
    diagnostico.periodo_raciones ?? '';

  const radios =
    document.querySelectorAll<HTMLInputElement>(
      'input[name="tiene-espacio-fisico"]',
    );

  radios.forEach((radio) => {
    radio.checked =
      diagnostico.tiene_espacio_fisico === true
        ? radio.value === 'si'
        : diagnostico.tiene_espacio_fisico === false
          ? radio.value === 'no'
          : false;
  });
}

function limpiarErrores() {
  const ids = [
    'mision',
    'vision',
    'caracteristicas-infraestructura',
    'espacios-disponibles',
    'recursos-existentes',
    'danos-detectados',
    'necesidades-prioritarias',
    'observaciones',
    'raciones',
    'periodo-raciones',
  ];

  ids.forEach((id) => {
    const error = document.getElementById(`${id}-error`);

    if (error) {
      error.textContent = '';
    }
  });
}

function establecerError(
  campo: string,
  mensaje: string,
) {
  const elemento = document.getElementById(
    `${campo}-error`,
  );

  if (elemento) {
    elemento.textContent = mensaje;
  }
}

function obtenerValorTexto(id: string): string {
  return obtenerElemento<HTMLTextAreaElement>(id).value;
}

function obtenerDatosFormulario(): CamposDiagnostico {
  const espacioSeleccionado =
    document.querySelector<HTMLInputElement>(
      'input[name="tiene-espacio-fisico"]:checked',
    );

  const racionesTexto =
    obtenerElemento<HTMLInputElement>('raciones').value.trim();

  const periodoTexto =
    obtenerElemento<HTMLSelectElement>(
      'periodo-raciones',
    ).value;

  return {
    mision: obtenerValorTexto('mision'),

    vision: obtenerValorTexto('vision'),

    tiene_espacio_fisico:
      espacioSeleccionado?.value === 'si'
        ? true
        : espacioSeleccionado?.value === 'no'
          ? false
          : null,

    caracteristicas_infraestructura:
      obtenerValorTexto(
        'caracteristicas-infraestructura',
      ),

    espacios_disponibles:
      obtenerValorTexto('espacios-disponibles'),

    recursos_existentes:
      obtenerValorTexto('recursos-existentes'),

    danos_detectados:
      obtenerValorTexto('danos-detectados'),

    necesidades_prioritarias:
      obtenerValorTexto('necesidades-prioritarias'),

    observaciones:
      obtenerValorTexto('observaciones'),

    raciones:
      racionesTexto === ''
        ? null
        : Number(racionesTexto),

    periodo_raciones:
      periodoTexto === ''
        ? null
        : (periodoTexto as 'diaria' | 'semanal' | 'mensual'),
  };
}

function validarFormulario(
  datos: CamposDiagnostico,
): boolean {
  limpiarErrores();

  const resultado =
    camposDiagnosticoSchema.safeParse(datos);

  if (resultado.success) {
    return true;
  }

  resultado.error.issues.forEach((issue) => {
    const campo = issue.path[0];

    if (typeof campo === 'string') {
      establecerError(campo, issue.message);
    }
  });

  return false;
}

function asignarTexto(
  id: string,
  valor: string,
) {
  obtenerElemento<HTMLElement>(id).textContent = valor;
}

function asignarResumen(
  diagnostico: Diagnostico,
) {
  asignarTexto(
    'resumen-mision',
    diagnostico.mision || 'Sin información',
  );

  asignarTexto(
    'resumen-vision',
    diagnostico.vision || 'Sin información',
  );

  asignarTexto(
    'resumen-espacio-fisico',
    diagnostico.tiene_espacio_fisico === true
      ? 'Sí'
      : diagnostico.tiene_espacio_fisico === false
        ? 'No'
        : 'No informado',
  );

  asignarTexto(
    'resumen-caracteristicas-infraestructura',
    diagnostico.caracteristicas_infraestructura ||
      'Sin información',
  );

  asignarTexto(
    'resumen-espacios-disponibles',
    diagnostico.espacios_disponibles ||
      'Sin información',
  );

  asignarTexto(
    'resumen-recursos-existentes',
    diagnostico.recursos_existentes ||
      'Sin información',
  );

  asignarTexto(
    'resumen-danos-detectados',
    diagnostico.danos_detectados ||
      'Sin información',
  );

  asignarTexto(
    'resumen-necesidades-prioritarias',
    diagnostico.necesidades_prioritarias ||
      'Sin información',
  );

  asignarTexto(
    'resumen-observaciones',
    diagnostico.observaciones ||
      'Sin información',
  );

  asignarTexto(
    'resumen-raciones',
    diagnostico.raciones !== null
      ? String(diagnostico.raciones)
      : 'No informado',
  );

  asignarTexto(
    'resumen-periodo-raciones',
    diagnostico.periodo_raciones
      ? formatearPeriodo(
          diagnostico.periodo_raciones,
        )
      : 'No informado',
  );

  asignarTexto(
    'fecha-actualizacion-diagnostico',
    formatearFecha(
      diagnostico.updated_at,
    ),
  );
}

function formatearPeriodo(
  periodo: 'diaria' | 'semanal' | 'mensual',
): string {
  const valores = {
    diaria: 'Diaria',
    semanal: 'Semanal',
    mensual: 'Mensual',
  };

  return valores[periodo];
}

function formatearFecha(
  fecha: string,
): string {
  const resultado = new Date(fecha);

  if (Number.isNaN(resultado.getTime())) {
    return fecha;
  }

  return resultado.toLocaleDateString(
    'es-CL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  );
}

async function cargarDiagnostico() {
  mostrarCarga(true);
  mostrarError(null);

  try {
    const idOrganizacion =
      obtenerOrganizacionId();

    const diagnostico =
      await servicio.obtener(idOrganizacion);

    if (!diagnostico) {
      mostrarEstadoSinDiagnostico();
      return;
    }

    mostrarDiagnosticoRegistrado(
      diagnostico,
    );
  } catch (error) {
    mostrarError(
      error instanceof Error
        ? error.message
        : 'No fue posible cargar el diagnóstico.',
    );
  } finally {
    mostrarCarga(false);
  }
}

async function guardarDiagnostico() {
  const datos = obtenerDatosFormulario();

  if (!validarFormulario(datos)) {
    return;
  }

  const boton =
    obtenerElemento<HTMLButtonElement>(
      'btn-guardar-diagnostico',
    );

  const textoOriginal =
    boton.textContent ?? 'Guardar diagnóstico';

  boton.disabled = true;
  boton.textContent = editando
    ? 'Actualizando…'
    : 'Guardando…';

  mostrarError(null);
  mostrarConfirmacion(null);

  try {
    const idOrganizacion =
      obtenerOrganizacionId();

    let resultado: Diagnostico;

    if (
      editando &&
      diagnosticoActual
    ) {
      resultado =
        await servicio.actualizar(
          idOrganizacion,
          diagnosticoActual.id_diagnostico,
          diagnosticoActual.version,
          {
            campos: datos,
          },
        );

      mostrarDiagnosticoRegistrado(
        resultado,
      );

      mostrarConfirmacion(
        'El diagnóstico se ha actualizado correctamente.',
      );
    } else {
      resultado =
        await servicio.crear(
          idOrganizacion,
          {
            campos: datos,
          },
        );

      mostrarDiagnosticoRegistrado(
        resultado,
      );

      mostrarConfirmacion(
        'El diagnóstico se ha guardado correctamente.',
      );
    }
  } catch (error) {
    mostrarError(
      error instanceof Error
        ? error.message
        : 'No fue posible guardar el diagnóstico.',
    );
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function cancelarFormulario() {
  mostrarError(null);
  mostrarConfirmacion(null);

  if (diagnosticoActual) {
    mostrarDiagnosticoRegistrado(
      diagnosticoActual,
    );
    return;
  }

  mostrarEstadoSinDiagnostico();
}

function configurarEventos() {
  const botonRegistrar =
    obtenerElemento<HTMLButtonElement>(
      'btn-registrar-diagnostico',
    );

  const botonCancelar =
    obtenerElemento<HTMLButtonElement>(
      'btn-cancelar-diagnostico',
    );

  const formulario =
    obtenerElemento<HTMLFormElement>(
      'form-diagnostico',
    );

  botonRegistrar.addEventListener(
    'click',
    () => {
      if (diagnosticoActual) {
        mostrarFormulario(
          diagnosticoActual,
        );
      } else {
        mostrarFormulario();
      }
    },
  );

  botonCancelar.addEventListener(
    'click',
    cancelarFormulario,
  );

  formulario.addEventListener(
    'submit',
    async (evento) => {
      evento.preventDefault();

      await guardarDiagnostico();
    },
  );
}

export async function iniciarDiagnostico() {
  configurarEventos();

  await cargarDiagnostico();
}