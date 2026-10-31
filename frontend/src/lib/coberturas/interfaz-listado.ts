import { clienteCoberturasNavegador, mensajeErrorCoberturas, type ClienteCoberturas } from './cliente.ts';
import {
  mostrarCargandoCoberturas,
  mostrarConfirmacionCobertura,
  mostrarErrorCoberturas,
  renderizarListadoCoberturas,
} from './renderizado.ts';

const mensajesResultado: Record<string, string> = {
  creada: 'La cobertura fue creada correctamente.',
};

export function iniciarListadoCoberturas(cliente: ClienteCoberturas = clienteCoberturasNavegador()): void {
  const raiz = document.querySelector<HTMLElement>('#coberturas');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';

  let cargando = false;

  async function cargar(): Promise<void> {
    if (cargando) return;
    cargando = true;
    mostrarCargandoCoberturas();
    try {
      renderizarListadoCoberturas(await cliente.listar());
    } catch (error) {
      mostrarErrorCoberturas(mensajeErrorCoberturas(error, 'consultar las coberturas'));
    } finally {
      cargando = false;
    }
  }

  const resultado = new URLSearchParams(window.location.search).get('resultado');
  if (resultado && mensajesResultado[resultado]) {
    mostrarConfirmacionCobertura(mensajesResultado[resultado]);
    const url = new URL(window.location.href);
    url.searchParams.delete('resultado');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  window.addEventListener('fge:cobertura-actualizada', ((event: CustomEvent<{ mensaje?: string }>) => {
    if (event.detail?.mensaje) mostrarConfirmacionCobertura(event.detail.mensaje);
    void cargar();
  }) as EventListener);

  void cargar();
}
