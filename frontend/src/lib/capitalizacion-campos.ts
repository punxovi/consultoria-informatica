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

  if (elemento instanceof HTMLInputElement && elemento.type !== 'text') {
    return false;
  }

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

export function iniciarCapitalizacionCampos(): void {
  document.addEventListener('input', (evento) => {
    if (esCampoTextoEditable(evento.target)) {
      aplicarCapitalizacion(evento.target);
    }
  });

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
