export type OpcionesConfirmacion = {
  titulo: string;
  mensaje: string;
  subtitulo?: string;
  aviso?: string;
  confirmar?: string;
  cancelar?: string;
  tono?: 'peligro' | 'normal';
};

const ICONO_ALERTA = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01" /><path d="M10.3 4.8 2.9 17.5A1.8 1.8 0 0 0 4.5 20h15a1.8 1.8 0 0 0 1.6-2.5L13.7 4.8a2 2 0 0 0-3.4 0Z" /></svg>';
const ICONO_INFO = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>';

const BOTON = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

let contador = 0;

export function confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
  const id = `confirmacion-${++contador}`;
  const peligro = opciones.tono === 'peligro';
  const dialogo = document.createElement('dialog');
  dialogo.setAttribute('aria-labelledby', `${id}-titulo`);
  dialogo.setAttribute('aria-describedby', `${id}-mensaje`);
  dialogo.className = 'm-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-[#E8E5EF] bg-white p-0 text-[#1A1A1A] shadow-[0_20px_60px_rgba(26,26,26,0.2)] backdrop:bg-[#1A1A1A]/50';

  const cabecera = document.createElement('div'); cabecera.className = 'border-b border-[#EEEAF5] px-6 py-5';
  const fila = document.createElement('div'); fila.className = 'flex items-start gap-4';
  const icono = document.createElement('div'); icono.setAttribute('aria-hidden', 'true');
  icono.className = `flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${peligro ? 'bg-[#FCE8F0] text-[#AD174F]' : 'bg-[#EDEBFA] text-[#4C4688]'}`;
  icono.innerHTML = peligro ? ICONO_ALERTA : ICONO_INFO;
  const textos = document.createElement('div'); textos.className = 'min-w-0 flex-1';
  const titulo = document.createElement('h2'); titulo.id = `${id}-titulo`; titulo.className = 'text-lg font-bold tracking-tight text-[#383165] md:text-xl'; titulo.textContent = opciones.titulo;
  const subtitulo = document.createElement('p'); subtitulo.className = 'mt-1 text-sm text-[#706E78]'; subtitulo.textContent = opciones.subtitulo ?? 'Confirma que deseas continuar con esta operación.';
  textos.append(titulo, subtitulo); fila.append(icono, textos); cabecera.append(fila);

  const cuerpo = document.createElement('div'); cuerpo.className = 'px-6 py-5';
  const mensaje = document.createElement('p'); mensaje.id = `${id}-mensaje`; mensaje.className = 'whitespace-pre-line text-sm leading-6 text-[#4A4850]'; mensaje.textContent = opciones.mensaje;
  cuerpo.append(mensaje);
  if (opciones.aviso) {
    const aviso = document.createElement('div'); aviso.className = 'mt-4 rounded-xl border border-[#F5D989] bg-[#FFF8E5] px-4 py-3';
    const textoAviso = document.createElement('p'); textoAviso.className = 'text-sm leading-5 text-[#805600]'; textoAviso.textContent = opciones.aviso;
    aviso.append(textoAviso); cuerpo.append(aviso);
  }

  const pie = document.createElement('div'); pie.className = 'flex flex-col-reverse gap-3 border-t border-[#EEEAF5] bg-[#FAF9FC] px-6 py-4 sm:flex-row sm:justify-end';
  const cancelar = document.createElement('button'); cancelar.type = 'button';
  cancelar.className = `${BOTON} border-2 border-[#4C4688] bg-white text-[#4C4688] hover:bg-[#4C4688]/5`; cancelar.textContent = opciones.cancelar ?? 'Cancelar';
  const aceptar = document.createElement('button'); aceptar.type = 'button';
  aceptar.className = peligro
    ? `${BOTON} border-2 border-[#D21F5B] bg-white text-[#D21F5B] hover:bg-[#D21F5B]/5`
    : `${BOTON} bg-[#4C4688] text-white hover:bg-[#423C76]`;
  aceptar.textContent = opciones.confirmar ?? 'Confirmar';
  pie.append(cancelar, aceptar);

  dialogo.append(cabecera, cuerpo, pie);
  document.body.append(dialogo);

  return new Promise(resolve => {
    let resultado = false;
    cancelar.addEventListener('click', () => dialogo.close());
    aceptar.addEventListener('click', () => { resultado = true; dialogo.close(); });
    dialogo.addEventListener('close', () => { dialogo.remove(); resolve(resultado); }, { once: true });
    dialogo.showModal();
    cancelar.focus();
  });
}
