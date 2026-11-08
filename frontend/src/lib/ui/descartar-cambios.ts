import { confirmar } from './confirmar';

const formulariosConCambios = new WeakSet<HTMLFormElement>();
let omitirAviso = false;
let iniciado = false;

export function confirmarDescarte(mensaje = 'Los cambios que hiciste en este formulario no se guardarán.'): Promise<boolean> {
  return confirmar({
    titulo: '¿Descartar los cambios?',
    subtitulo: 'Tienes cambios sin guardar.',
    mensaje,
    confirmar: 'Descartar cambios',
    cancelar: 'Seguir editando',
    tono: 'peligro',
  });
}

/** Indica si el formulario tiene cambios hechos por la persona desde que se abrió o guardó. */
export function tieneCambios(formulario: HTMLFormElement | null): boolean {
  return Boolean(formulario && formulariosConCambios.has(formulario));
}

/** Olvida los cambios registrados (por ejemplo, después de guardar o de cerrar el formulario). */
export function olvidarCambios(formulario: HTMLFormElement | null) {
  if (formulario) formulariosConCambios.delete(formulario);
}

function marcarCambio(evento: Event) {
  if (!evento.isTrusted) return;
  const formulario = (evento.target as Element | null)?.closest?.('form');
  if (formulario) formulariosConCambios.add(formulario);
}

export function iniciarAvisoDescarte() {
  if (iniciado) return;
  iniciado = true;

  document.addEventListener('input', marcarCambio, true);
  document.addEventListener('change', marcarCambio, true);
  document.addEventListener('submit', evento => olvidarCambios(evento.target as HTMLFormElement), true);

  document.addEventListener('click', async evento => {
    if (omitirAviso) return;
    const boton = (evento.target as Element | null)?.closest?.<HTMLElement>('[data-descartar]');
    const formulario = boton?.closest('form') ?? null;
    if (!boton || !tieneCambios(formulario)) return;

    evento.preventDefault();
    evento.stopImmediatePropagation();
    if (!(await confirmarDescarte())) return;

    olvidarCambios(formulario);
    if (boton instanceof HTMLAnchorElement && boton.href) {
      window.location.assign(boton.href);
      return;
    }
    omitirAviso = true;
    try {
      boton.click();
    } finally {
      omitirAviso = false;
    }
  }, true);
}
