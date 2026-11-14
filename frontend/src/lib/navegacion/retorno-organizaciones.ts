const PARES = [
  ['q', 'org_q'],
  ['id_pais', 'org_pais'],
  ['id_programa', 'org_programa'],
] as const;

const LIMITE = 200;

function valorSeguro(valor: string | null): string | null {
  const limpio = valor?.trim();
  return limpio && limpio.length <= LIMITE ? limpio : null;
}

export function retornoHaciaPlanes(busquedaFicha: URLSearchParams): URLSearchParams {
  const salida = new URLSearchParams();
  for (const [original, prefijado] of PARES) {
    const valor = valorSeguro(busquedaFicha.get(original));
    if (valor) salida.set(prefijado, valor);
  }
  return salida;
}

export function retornoPropagado(busqueda: URLSearchParams): URLSearchParams {
  const salida = new URLSearchParams();
  for (const [, prefijado] of PARES) {
    const valor = valorSeguro(busqueda.get(prefijado));
    if (valor) salida.set(prefijado, valor);
  }
  return salida;
}

export function agregarRetorno(destino: URLSearchParams, origen: URLSearchParams): URLSearchParams {
  for (const [clave, valor] of retornoPropagado(origen)) destino.set(clave, valor);
  return destino;
}

export function hrefOrganizacion(idOrganizacion: string, busqueda: URLSearchParams): string {
  const parametros = new URLSearchParams();
  for (const [original, prefijado] of PARES) {
    const valor = valorSeguro(busqueda.get(prefijado));
    if (valor) parametros.set(original, valor);
  }
  const query = parametros.toString();
  return `/organizaciones/${encodeURIComponent(idOrganizacion)}${query ? `?${query}` : ''}`;
}
