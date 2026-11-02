/**
 * Capitaliza únicamente la primera letra de los campos de texto editables.
 * Se usa en formularios de creación y edición de la aplicación.
 */
function capitalizarPrimeraLetra(valor: string): string {
  const indice = valor.search(/[a-záéíóúüñ]/i);
  if (indice < 0) return valor;

  const letra = valor.charAt(indice);
  const mayuscula = letra.toLocaleUpperCase('es-CL');
  return valor.slice(0, indice) + mayuscula + valor.slice(indice + 1);
}

function esCampoTextoEditable(
  elemento: EventTarget | null,
): elemento is HTMLInputElement | HTMLTextAreaElement {
  if (!(elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement)) {
    return false;
  }

  if (elemento.disabled || elemento.readOnly || elemento.hasAttribute('data-no-capitalize')) {
    return false;
  }

  // Solo se procesan campos de texto y áreas de texto; nunca email, contraseña,
  // búsqueda, URL, fechas, números, archivos ni controles similares.
  if (elemento instanceof HTMLInputElement && elemento.type !== 'text') {
    return false;
  }

  // No intervenir en campos sueltos como búsquedas o filtros: deben pertenecer a un formulario.
  const formulario = elemento.closest('form');
  if (!formulario) return false;

  const identificador = `${elemento.id} ${elemento.getAttribute('name') ?? ''} ${elemento.getAttribute('autocomplete') ?? ''}`;
  if (/(^|[\s_-])(email|correo|password|contrasena|contraseña|url|website|sitio|slug|username|usuario|token|codigo|código|busqueda|búsqueda|buscar|search)([\s_-]|$)/i.test(identificador)) {
    return false;
  }

  return true;
}

function aplicarCapitalizacion(elemento: HTMLInputElement | HTMLTextAreaElement): void {
  const valor = elemento.value;
  const capitalizado = capitalizarPrimeraLetra(valor);
  if (capitalizado !== valor) elemento.value = capitalizado;
}

/** Inicializa listeners delegados para campos presentes y creados dinámicamente. */
export function iniciarCapitalizacionCampos(): void {
  document.addEventListener('input', (evento) => {
    if (esCampoTextoEditable(evento.target)) {
      aplicarCapitalizacion(evento.target);
    }
  });

  // Se ejecuta en fase de captura para que la capitalización ocurra antes de
  // las validaciones y del guardado gestionado por cada formulario.
  document.addEventListener('submit', (evento) => {
    const formulario = evento.target;
    if (!(formulario instanceof HTMLFormElement)) return;

    formulario.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], textarea',
    ).forEach((elemento) => {
      if (esCampoTextoEditable(elemento)) aplicarCapitalizacion(elemento);
    });
  }, true);
}
