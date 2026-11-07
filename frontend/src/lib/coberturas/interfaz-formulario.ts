import { clienteCoberturasNavegador, mensajeErrorCoberturas } from './cliente.ts';
import type { CrearCoberturaFormulario } from './modelo.ts';
import { clienteCoordinadoresNavegador } from '../coordinadores/cliente.ts';
import { clientePaisesNavegador } from '../paises/cliente.ts';

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function iniciarFormularioCobertura(): void {
  const form = document.querySelector<HTMLFormElement>('#cobertura-form');
  const feedback = document.querySelector<HTMLElement>('#cobertura-feedback');
  const guardar = document.querySelector<HTMLButtonElement>('#cobertura-guardar');
  if (!form || !feedback || !guardar || form.dataset.integrado) return;
  form.dataset.integrado = 'true';

  const coordinador = document.querySelector<HTMLSelectElement>('#cobertura-coordinador');
  const pais = document.querySelector<HTMLSelectElement>('#cobertura-pais');
  const motivo = document.querySelector<HTMLTextAreaElement>('#cobertura-motivo');
  const inicio = document.querySelector<HTMLInputElement>('#cobertura-inicio');
  const termino = document.querySelector<HTMLInputElement>('#cobertura-termino');
  if (!coordinador || !pais || !motivo || !inicio || !termino) return;

  const campos: Campo[] = [coordinador, pais, motivo, inicio, termino];
  let enviando = false;
  let listo = false;

  function mostrarFeedback(mensaje: string, tipo: 'error' | 'info'): void {
    feedback.hidden = false;
    feedback.className = tipo === 'error'
      ? 'mt-6 rounded-xl border border-[#F3B6CC] bg-[#FCE8F0] p-4 text-sm leading-6 text-[#AD174F]'
      : 'mt-6 rounded-xl border border-[#DCD8E8] bg-[#F0EEF8] p-4 text-sm leading-6 text-[#383165]';
    feedback.textContent = mensaje;
  }

  function mostrarError(campo: Campo, mensaje: string): void {
    const nodo = form.querySelector<HTMLElement>(`[data-field-error="${campo.id}"]`);
    if (nodo) {
      nodo.textContent = mensaje;
      nodo.classList.toggle('hidden', !mensaje);
    }
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  }

  function validar(campo: Campo): string {
    const valor = campo.value.trim();
    if (!valor) return 'Este campo es obligatorio.';
    if (campo === motivo && valor.length < 5) return 'Describe el motivo con al menos 5 caracteres.';
    return '';
  }

  function validarFechas(): boolean {
    const mensaje = inicio.value && termino.value && termino.value <= inicio.value
      ? 'La fecha de término debe ser posterior a la fecha de inicio.'
      : '';
    mostrarError(inicio, mensaje ? 'La fecha de inicio debe ser anterior al término.' : '');
    mostrarError(termino, mensaje || validar(termino));
    return !mensaje;
  }

  function limpiarErrores(): void {
    for (const campo of campos) mostrarError(campo, '');
    feedback.hidden = true;
  }

  function poblarSelect(select: HTMLSelectElement, opciones: Array<{ id: string; nombre: string }>, etiqueta: string): void {
    const placeholder = select.options[0]?.cloneNode(true) as HTMLOptionElement;
    select.replaceChildren(placeholder);
    for (const opcion of opciones) select.add(new Option(opcion.nombre, opcion.id));
    select.disabled = opciones.length === 0;
    if (opciones.length === 0 && select.options[0]) select.options[0].textContent = `No hay ${etiqueta} disponibles`;
  }

  async function cargarOpciones(): Promise<void> {
    guardar.disabled = true;
    coordinador.disabled = true;
    pais.disabled = true;
    mostrarFeedback('Cargando Coordinadores y países disponibles…', 'info');
    try {
      const [coordinadores, paises] = await Promise.all([
        clienteCoordinadoresNavegador().listar(),
        clientePaisesNavegador().listar(),
      ]);
      poblarSelect(
        coordinador,
        coordinadores.filter((item) => item.activo).map((item) => ({ id: item.id_usuario, nombre: item.nombre })),
        'Coordinadores activos',
      );
      poblarSelect(pais, paises.map((item) => ({ id: item.id_pais, nombre: item.nombre })), 'países');
      listo = !coordinador.disabled && !pais.disabled;
      guardar.disabled = !listo;
      feedback.hidden = true;
      if (!listo) mostrarFeedback('Debes contar con al menos un Coordinador activo y un país disponible para crear una cobertura.', 'info');
    } catch (error) {
      listo = false;
      mostrarFeedback(mensajeErrorCoberturas(error, 'cargar los datos del formulario'), 'error');
    }
  }

  for (const campo of campos) {
    campo.addEventListener('input', () => {
      mostrarError(campo, validar(campo));
      if (campo === inicio || campo === termino) validarFechas();
      feedback.hidden = true;
    });
    campo.addEventListener('change', () => {
      if (campo === inicio && inicio.value) termino.min = inicio.value;
      mostrarError(campo, validar(campo));
      validarFechas();
      feedback.hidden = true;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enviando || !listo) return;
    limpiarErrores();
    let valido = true;
    for (const campo of campos) {
      const error = validar(campo);
      mostrarError(campo, error);
      if (error) valido = false;
    }
    if (!validarFechas()) valido = false;
    if (!valido) {
      mostrarFeedback('Revisa los campos indicados antes de continuar.', 'error');
      campos.find((campo) => campo.getAttribute('aria-invalid') === 'true')?.focus();
      return;
    }

    const datos: CrearCoberturaFormulario = {
      id_usuario_beneficiario: coordinador.value,
      id_pais: pais.value,
      motivo: motivo.value.trim(),
      fecha_inicio: inicio.value,
      fecha_termino: termino.value,
    };
    enviando = true;
    guardar.disabled = true;
    mostrarFeedback('Guardando cobertura…', 'info');
    try {
      await clienteCoberturasNavegador().crear(datos);
      window.location.assign('/administracion/coberturas?resultado=creada');
    } catch (error) {
      const camposServidor = error instanceof Error && 'fields' in error
        ? (error as { fields?: Record<string, string[]> }).fields
        : undefined;
      const mapa: Record<string, Campo> = {
        id_usuario_beneficiario: coordinador,
        id_pais: pais,
        inicio_at: inicio,
        fin_at: termino,
        motivo,
      };
      for (const [nombre, mensajes] of Object.entries(camposServidor ?? {})) {
        if (mapa[nombre] && mensajes[0]) mostrarError(mapa[nombre], mensajes[0]);
      }
      mostrarFeedback(mensajeErrorCoberturas(error, 'guardar la cobertura'), 'error');
      enviando = false;
      guardar.disabled = false;
    }
  });

  void cargarOpciones();
}
