export type AcentoRegistro = 'morado' | 'verde' | 'celeste' | 'rosado' | 'amarillo' | 'neutro';
export type TonoInsignia = 'morado' | 'verde' | 'amarillo' | 'rosado' | 'neutro';

export interface OpcionesRegistro {
  acento?: AcentoRegistro;
  contexto?: string;
  titulo: string;
  insignias?: { texto: string; tono: TonoInsignia; etiqueta?: string }[];
  datos?: [etiqueta: string, valor: string | null | undefined][];
  /** Enlace discreto «Ver detalle →». */
  accion?: { texto: string; etiquetaAccesible?: string; atributos?: Record<string, string>; alPulsar: () => void };
  /** Botones de decisión (por ejemplo Aprobar / Rechazar). */
  botones?: { texto: string; variante?: 'primario' | 'secundario' | 'peligro'; deshabilitado?: boolean; alPulsar: () => void }[];
}

function nodo<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string) {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

export function crearTarjetaRegistro(opciones: OpcionesRegistro): HTMLElement {
  const tarjeta = nodo('article', `registro tarjeta-acento acento-${opciones.acento ?? 'morado'}`);

  const cabecera = nodo('div', 'registro-cabecera');
  const textos = nodo('div', 'min-w-0');
  if (opciones.contexto) textos.append(nodo('p', 'registro-contexto', opciones.contexto));
  textos.append(nodo('h4', 'registro-titulo', opciones.titulo));
  cabecera.append(textos);

  if (opciones.insignias?.length) {
    const grupo = nodo('div', 'registro-insignias');
    for (const insignia of opciones.insignias) {
      const chip = nodo('span', `registro-insignia registro-insignia--${insignia.tono}`, insignia.texto);
      if (insignia.etiqueta) chip.setAttribute('aria-label', insignia.etiqueta);
      grupo.append(chip);
    }
    cabecera.append(grupo);
  }
  tarjeta.append(cabecera);

  if (opciones.datos?.length) {
    const lista = nodo('dl', 'registro-datos');
    for (const [etiqueta, valor] of opciones.datos.slice(0, 3)) {
      const grupo = nodo('div', 'min-w-0');
      grupo.append(nodo('dt', '', etiqueta), nodo('dd', '', (valor ?? '').trim() || 'Sin información'));
      lista.append(grupo);
    }
    tarjeta.append(lista);
  }

  if (opciones.accion || opciones.botones?.length) {
    const pie = nodo('div', 'registro-pie');
    for (const datos of opciones.botones ?? []) {
      const boton = nodo('button', `registro-boton registro-boton--${datos.variante ?? 'secundario'}`, datos.texto);
      boton.type = 'button';
      boton.disabled = !!datos.deshabilitado;
      boton.addEventListener('click', datos.alPulsar);
      pie.append(boton);
    }
    if (opciones.accion) {
      const boton = nodo('button', 'registro-enlace');
      boton.type = 'button';
      boton.innerHTML = '<span></span><span aria-hidden="true">→</span>';
      boton.firstElementChild!.textContent = opciones.accion.texto;
      if (opciones.accion.etiquetaAccesible) boton.setAttribute('aria-label', opciones.accion.etiquetaAccesible);
      for (const [clave, valor] of Object.entries(opciones.accion.atributos ?? {})) boton.setAttribute(clave, valor);
      boton.addEventListener('click', opciones.accion.alPulsar);
      pie.append(boton);
    }
    tarjeta.append(pie);
  }

  return tarjeta;
}
