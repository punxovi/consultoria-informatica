import { obtenerAlcanceGestion, puedeGestionarPais } from './permisos';

export async function actualizarAvisoConsulta(
  aviso: HTMLElement,
  idPais: string,
  nombrePais: string,
  registros: 'organizaciones' | 'planes',
) {
  const articulo = registros === 'planes' ? 'los' : 'las';
  const alcance = await obtenerAlcanceGestion();

  if (alcance.todos || alcance.paises.size === 0) {
    aviso.hidden = true;
    return;
  }
  if (!idPais) {
    aviso.textContent = `Estás viendo ${registros} de todos los países. Solo puedes modificar ${articulo} de tu país principal o de países con cobertura temporal vigente.`;
    aviso.hidden = false;
    return;
  }
  if (puedeGestionarPais(alcance, idPais)) {
    aviso.hidden = true;
    return;
  }
  aviso.textContent = `Estás consultando ${registros} de ${nombrePais || 'otro país'}. Puedes ver${articulo}, pero no modificar${articulo}.`;
  aviso.hidden = false;
}
