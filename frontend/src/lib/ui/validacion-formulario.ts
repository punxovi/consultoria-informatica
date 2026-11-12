type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function esControl(elemento: unknown): elemento is Control {
  return elemento instanceof HTMLInputElement ||
    elemento instanceof HTMLTextAreaElement ||
    elemento instanceof HTMLSelectElement;
}

function mensajeVacio(control: Control): string {
  if (control.dataset.mensajeObligatorio) return control.dataset.mensajeObligatorio;
  if (control instanceof HTMLSelectElement) return 'Selecciona una opción.';
  if (control instanceof HTMLInputElement && control.type === 'date') return 'Ingresa una fecha.';
  return 'Este campo es obligatorio.';
}

export function erroresPorCampo(
  form: HTMLFormElement,
  detalles: { campo: string; mensaje: string }[] = [],
): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const elemento of Array.from(form.elements)) {
    if (!esControl(elemento) || !elemento.required || elemento.disabled || !elemento.name) continue;
    if (!elemento.value.trim()) errores[elemento.name] = mensajeVacio(elemento);
  }
  for (const { campo, mensaje } of detalles) {
    const nombre = campo.replace(/^cambios\./, '');
    if (nombre && !errores[nombre]) errores[nombre] = mensaje;
  }
  return errores;
}

export function marcarCampos(form: HTMLFormElement, errores: Record<string, string>): HTMLElement | null {
  let primero: HTMLElement | null = null;
  for (const [nombre, mensaje] of Object.entries(errores)) {
    const control = form.elements.namedItem(nombre);
    if (!esControl(control) || control.getAttribute('aria-invalid') === 'true') continue;
    const aviso = document.createElement('p');
    aviso.id = `${control.id}-validacion`;
    aviso.dataset.errorCampo = '';
    aviso.className = 'mt-1 text-sm text-red-800';
    aviso.textContent = mensaje;
    const original = control.dataset.describedbyOriginal ?? control.getAttribute('aria-describedby') ?? '';
    control.dataset.describedbyOriginal = original;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [original, aviso.id].filter(Boolean).join(' '));
    control.after(aviso);
    primero ??= control;
  }
  return primero;
}

export function quitarErrorCampo(control: Element) {
  if (control.getAttribute('aria-invalid') !== 'true') return;
  document.getElementById(`${control.id}-validacion`)?.remove();
  control.setAttribute('aria-invalid', 'false');
  const original = (control as HTMLElement).dataset.describedbyOriginal;
  if (original) control.setAttribute('aria-describedby', original);
  else control.removeAttribute('aria-describedby');
}

export function limpiarErroresCampos(form: HTMLFormElement) {
  form.querySelectorAll('[aria-invalid="true"]').forEach(quitarErrorCampo);
  form.querySelectorAll('[data-error-campo]').forEach(nodo => nodo.remove());
}

/** Al corregir un campo, desaparece solo su mensaje. */
export function quitarErroresAlEditar(form: HTMLFormElement) {
  const quitar = (evento: Event) => {
    if (evento.target instanceof Element && evento.target.getAttribute('type') !== 'file') {
      quitarErrorCampo(evento.target);
    }
  };
  form.addEventListener('input', quitar);
  form.addEventListener('change', quitar);
}
