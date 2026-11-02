import { camposDiagnosticoSchema, type CamposDiagnostico, type Diagnostico } from './modelo';
import { ApiError, createApiTransport } from '../api/transporte';
import { getSupabaseClient } from '../supabase';
import { crearClienteDiagnostico } from './cliente';

const servicio = crearClienteDiagnostico(
  createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'),
  async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  },
);

const CAMPOS_TEXTO = [
  ['mision', 'mision'], ['vision', 'vision'],
  ['caracteristicas_infraestructura', 'caracteristicas-infraestructura'],
  ['espacios_disponibles', 'espacios-disponibles'], ['recursos_existentes', 'recursos-existentes'],
  ['danos_detectados', 'danos-detectados'], ['necesidades_prioritarias', 'necesidades-prioritarias'],
  ['observaciones', 'observaciones'],
] as const;
const IDS_CAMPOS: Record<string, string> = {
  mision: 'mision', vision: 'vision', caracteristicas_infraestructura: 'caracteristicas-infraestructura',
  espacios_disponibles: 'espacios-disponibles', recursos_existentes: 'recursos-existentes',
  danos_detectados: 'danos-detectados', necesidades_prioritarias: 'necesidades-prioritarias',
  observaciones: 'observaciones', raciones: 'raciones', periodo_raciones: 'periodo-raciones',
};
const PERIODOS = { diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual' } as const;

let diagnosticoActual: Diagnostico | null = null;
let editando = false;
let ocupado = false;
let conflicto = false;

function el<T extends HTMLElement>(id: string): T {
  const elemento = document.querySelector<HTMLElement>('#diagnostico-organizacion')?.querySelector(`#${id}`);
  if (!elemento) throw new Error(`No se encontró el elemento #${id}.`);
  return elemento as T;
}

function organizacionId(): string {
  const id = document.querySelector<HTMLElement>('#estado-organizacion')?.dataset.id;
  if (!id) throw new Error('No fue posible obtener el identificador de la organización.');
  return id;
}

function ocultarVistas() {
  el<HTMLElement>('estado-sin-diagnostico').hidden = true;
  el<HTMLFormElement>('form-diagnostico').hidden = true;
  el<HTMLElement>('diagnostico-registrado').hidden = true;
}

function mostrarCarga(valor: boolean) { el<HTMLElement>('diagnostico-carga').hidden = !valor; }
function mensaje(id: string, texto: string | null) {
  const nodo = el<HTMLElement>(id);
  nodo.textContent = texto ?? '';
  nodo.hidden = !texto;
}

function ocupar(valor: boolean) {
  ocupado = valor;
  el<HTMLFieldSetElement>('diagnostico-campos').disabled = valor;
  el<HTMLButtonElement>('btn-registrar-diagnostico').disabled = valor;
  el<HTMLButtonElement>('btn-recargar-diagnostico').disabled = valor;
  document.querySelector<HTMLElement>('#diagnostico-organizacion')!.setAttribute('aria-busy', String(valor));
  el<HTMLButtonElement>('btn-guardar-diagnostico').disabled = valor || conflicto;
}

function mostrarEstadoVacio() {
  ocultarVistas();
  el<HTMLElement>('estado-sin-diagnostico').hidden = false;
  const boton = el<HTMLButtonElement>('btn-registrar-diagnostico');
  boton.hidden = false;
  el<HTMLElement>('btn-registrar-diagnostico-texto').textContent = 'Registrar diagnóstico';
  diagnosticoActual = null;
  editando = false;
  limpiarFormulario();
}

function abrirFormulario(diagnostico: Diagnostico | null = null) {
  if (ocupado) return;
  ocultarVistas();
  const formulario = el<HTMLFormElement>('form-diagnostico');
  formulario.hidden = false;
  el<HTMLButtonElement>('btn-registrar-diagnostico').hidden = true;
  mensaje('diagnostico-confirmacion', null);
  mensaje('diagnostico-error', null);
  editando = !!diagnostico;
  diagnosticoActual = diagnostico;
  diagnostico ? cargarEnFormulario(diagnostico) : limpiarFormulario();
  limpiarErrores();
  ocupar(false);
  requestAnimationFrame(() => formulario.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function mostrarRegistrado(diagnostico: Diagnostico) {
  ocultarVistas();
  el<HTMLElement>('diagnostico-registrado').hidden = false;
  const boton = el<HTMLButtonElement>('btn-registrar-diagnostico');
  boton.hidden = false;
  el<HTMLElement>('btn-registrar-diagnostico-texto').textContent = 'Editar diagnóstico';
  diagnosticoActual = diagnostico;
  editando = false;
  asignarResumen(diagnostico);
}

function limpiarFormulario() {
  el<HTMLFormElement>('form-diagnostico').reset();
  document.querySelectorAll<HTMLInputElement>('#diagnostico-organizacion input[name="tiene-espacio-fisico"]').forEach(radio => { radio.checked = false; });
  limpiarErrores();
}

function cargarEnFormulario(diagnostico: Diagnostico) {
  for (const [propiedad, id] of CAMPOS_TEXTO) el<HTMLTextAreaElement>(id).value = diagnostico[propiedad];
  el<HTMLInputElement>('raciones').value = diagnostico.raciones === null ? '' : String(diagnostico.raciones);
  el<HTMLSelectElement>('periodo-raciones').value = diagnostico.periodo_raciones ?? '';
  document.querySelectorAll<HTMLInputElement>('#diagnostico-organizacion input[name="tiene-espacio-fisico"]').forEach(radio => {
    radio.checked = diagnostico.tiene_espacio_fisico === true ? radio.value === 'si'
      : diagnostico.tiene_espacio_fisico === false ? radio.value === 'no' : false;
  });
}

function limpiarErrores() {
  for (const id of new Set(Object.values(IDS_CAMPOS))) {
    const campo = el<HTMLElement>(id);
    const error = el<HTMLElement>(`${id}-error`);
    error.textContent = '';
    campo.removeAttribute('aria-invalid');
    campo.classList.remove('border-red-500', 'border-danger');
    campo.classList.add('border-neutral-300');
    const descripciones = (campo.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(ref => ref && ref !== error.id);
    descripciones.length ? campo.setAttribute('aria-describedby', descripciones.join(' ')) : campo.removeAttribute('aria-describedby');
  }
}

function establecerError(id: string, texto: string) {
  const campo = el<HTMLElement>(id);
  const error = el<HTMLElement>(`${id}-error`);
  error.textContent = texto;
  campo.setAttribute('aria-invalid', 'true');
  campo.classList.remove('border-neutral-300');
  campo.classList.add('border-red-500');
  const descripciones = new Set((campo.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  descripciones.add(error.id);
  campo.setAttribute('aria-describedby', [...descripciones].join(' '));
}

function valorTexto(id: string) { return el<HTMLTextAreaElement>(id).value; }

function datosFormulario(): CamposDiagnostico {
  const seleccionado = document.querySelector<HTMLInputElement>('#diagnostico-organizacion input[name="tiene-espacio-fisico"]:checked');
  const raciones = el<HTMLInputElement>('raciones').value.trim();
  const periodo = el<HTMLSelectElement>('periodo-raciones').value;
  return {
    mision: valorTexto('mision'), vision: valorTexto('vision'),
    tiene_espacio_fisico: seleccionado?.value === 'si' ? true : seleccionado?.value === 'no' ? false : null,
    caracteristicas_infraestructura: valorTexto('caracteristicas-infraestructura'),
    espacios_disponibles: valorTexto('espacios-disponibles'), recursos_existentes: valorTexto('recursos-existentes'),
    danos_detectados: valorTexto('danos-detectados'), necesidades_prioritarias: valorTexto('necesidades-prioritarias'),
    observaciones: valorTexto('observaciones'), raciones: raciones === '' ? null : Number(raciones),
    periodo_raciones: periodo === '' ? null : periodo as 'diaria' | 'semanal' | 'mensual',
  };
}

function validar(datos: CamposDiagnostico): boolean {
  limpiarErrores();
  const resultado = camposDiagnosticoSchema.safeParse(datos);
  if (resultado.success) return true;
  resultado.error.issues.forEach(issue => {
    const clave = issue.path[0];
    if (typeof clave !== 'string') return;
    const id = IDS_CAMPOS[clave] ?? clave.replaceAll('_', '-');
    if (id) establecerError(id, issue.message);
  });
  Object.values(IDS_CAMPOS).map(id => el<HTMLElement>(id)).find(campo => campo.getAttribute('aria-invalid') === 'true')?.focus();
  return false;
}

function asignarResumen(diagnostico: Diagnostico) {
  const valores: [string, string][] = [
    ['resumen-mision', diagnostico.mision], ['resumen-vision', diagnostico.vision],
    ['resumen-espacio-fisico', diagnostico.tiene_espacio_fisico === true ? 'Sí' : diagnostico.tiene_espacio_fisico === false ? 'No' : 'No informado'],
    ['resumen-caracteristicas-infraestructura', diagnostico.caracteristicas_infraestructura],
    ['resumen-espacios-disponibles', diagnostico.espacios_disponibles], ['resumen-recursos-existentes', diagnostico.recursos_existentes],
    ['resumen-danos-detectados', diagnostico.danos_detectados], ['resumen-necesidades-prioritarias', diagnostico.necesidades_prioritarias],
    ['resumen-observaciones', diagnostico.observaciones], ['resumen-raciones', diagnostico.raciones === null ? 'No informado' : String(diagnostico.raciones)],
    ['resumen-periodo-raciones', diagnostico.periodo_raciones ? PERIODOS[diagnostico.periodo_raciones] : 'No informado'],
    ['fecha-actualizacion-diagnostico', formatearFecha(diagnostico.updated_at)],
  ];
  valores.forEach(([id, valor]) => { el<HTMLElement>(id).textContent = valor || 'Sin información'; });
}

function formatearFecha(valor: string) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function cargarDiagnostico() {
  if (ocupado) return;
  if (!el<HTMLFormElement>('form-diagnostico').hidden && !window.confirm('Al recargar se descartarán los cambios del formulario. ¿Continuar?')) return;
  ocupar(true);
  ocultarVistas();
  el<HTMLButtonElement>('btn-registrar-diagnostico').hidden = true;
  el<HTMLElement>('diagnostico-recuperacion').hidden = true;
  mensaje('diagnostico-confirmacion', null);
  mostrarCarga(true);
  mensaje('diagnostico-error', null);
  try {
    const diagnostico = await servicio.obtener(organizacionId());
    conflicto = false;
    diagnostico ? mostrarRegistrado(diagnostico) : mostrarEstadoVacio();
  } catch (fallo) {
    el<HTMLElement>('diagnostico-recuperacion').hidden = false;
    mensaje('diagnostico-error', fallo instanceof Error ? fallo.message : 'No fue posible cargar el diagnóstico.');
  } finally {
    mostrarCarga(false);
    ocupar(false);
  }
}

async function guardarDiagnostico() {
  if (ocupado || conflicto) return;
  const datos = datosFormulario();
  if (!validar(datos)) return;
  const boton = el<HTMLButtonElement>('btn-guardar-diagnostico');
  const textoOriginal = boton.textContent ?? 'Guardar diagnóstico';
  ocupar(true);
  boton.textContent = editando ? 'Actualizando…' : 'Guardando…';
  mensaje('diagnostico-error', null);
  mensaje('diagnostico-confirmacion', null);
  const eraEdicion = editando;
  try {
    const org = organizacionId();
    const resultado = editando && diagnosticoActual
      ? await servicio.actualizar(org, diagnosticoActual.id_diagnostico, diagnosticoActual.version, { campos: datos })
      : await servicio.crear(org, { campos: datos });
    mostrarRegistrado(resultado);
    mensaje('diagnostico-confirmacion', eraEdicion ? 'El diagnóstico se ha actualizado correctamente.' : 'El diagnóstico se ha guardado correctamente.');
  } catch (fallo) {
    conflicto = fallo instanceof ApiError && ['CONFLICTO_CONCURRENCIA', 'DIAGNOSTICO_EXISTENTE', 'NO_ENCONTRADO', 'NO_ENCONTRADA'].includes(fallo.code);
    el<HTMLElement>('diagnostico-recuperacion').hidden = !conflicto;
    mensaje('diagnostico-error', fallo instanceof Error ? fallo.message : 'No fue posible guardar el diagnóstico.');
  } finally {
    ocupar(false);
    boton.textContent = textoOriginal;
  }
}

function cancelarFormulario() {
  if (ocupado) return;
  mensaje('diagnostico-error', null);
  mensaje('diagnostico-confirmacion', null);
  diagnosticoActual ? mostrarRegistrado(diagnosticoActual) : mostrarEstadoVacio();
}

function configurarEventos() {
  el<HTMLButtonElement>('btn-recargar-diagnostico').addEventListener('click', () => void cargarDiagnostico());
  el<HTMLButtonElement>('btn-registrar-diagnostico').addEventListener('click', () => abrirFormulario(diagnosticoActual));
  el<HTMLButtonElement>('btn-cancelar-diagnostico').addEventListener('click', cancelarFormulario);
  el<HTMLFormElement>('form-diagnostico').addEventListener('submit', async evento => {
    evento.preventDefault();
    await guardarDiagnostico();
  });
}

export async function iniciarDiagnostico() {
  const raiz = document.querySelector<HTMLElement>('#diagnostico-organizacion');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  configurarEventos();
  await cargarDiagnostico();
}
