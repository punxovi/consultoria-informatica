import { clienteCoberturasNavegador, mensajeErrorCoberturas } from './cliente.ts';
import type { EventoHistorialCobertura } from './modelo.ts';

type Seleccion = {
  id: string;
  version: number;
  fechaFin: string;
  coordinador: string;
};

export function iniciarDialogosCobertura(): void {
  const lista = document.querySelector<HTMLElement>('#coberturas-lista');
  const dialogHistorial = document.querySelector<HTMLDialogElement>('#cobertura-historial-dialog');
  const historialSubtitulo = document.querySelector<HTMLElement>('#cobertura-historial-subtitulo');
  const historialCarga = document.querySelector<HTMLElement>('#cobertura-historial-carga');
  const historialError = document.querySelector<HTMLElement>('#cobertura-historial-error');
  const historialLista = document.querySelector<HTMLOListElement>('#cobertura-historial-lista');
  const dialogExtender = document.querySelector<HTMLDialogElement>('#cobertura-extender-dialog');
  const formExtender = document.querySelector<HTMLFormElement>('#cobertura-extender-form');
  const fechaExtension = document.querySelector<HTMLInputElement>('#cobertura-extender-fecha');
  const errorExtension = document.querySelector<HTMLElement>('#cobertura-extender-error');
  const feedbackExtension = document.querySelector<HTMLElement>('#cobertura-extender-feedback');
  const nombreExtension = document.querySelector<HTMLElement>('#cobertura-extender-coordinador');
  const dialogRevocar = document.querySelector<HTMLDialogElement>('#cobertura-revocar-dialog');
  const nombreRevocar = document.querySelector<HTMLElement>('#cobertura-revocar-coordinador');
  const motivoRevocacion = document.querySelector<HTMLTextAreaElement>('#cobertura-revocar-motivo');
  const errorRevocacion = document.querySelector<HTMLElement>('#cobertura-revocar-error');
  const feedbackRevocacion = document.querySelector<HTMLElement>('#cobertura-revocar-feedback');
  const confirmarRevocacion = document.querySelector<HTMLButtonElement>('#cobertura-revocar-confirmar');
  if (!lista || lista.dataset.dialogosIniciados) return;
  lista.dataset.dialogosIniciados = 'true';

  const cliente = clienteCoberturasNavegador();
  let seleccion: Seleccion | null = null;

  function sumarDia(fecha: string): string {
    const dia = new Date(`${fecha}T00:00:00Z`);
    dia.setUTCDate(dia.getUTCDate() + 1);
    return dia.toISOString().slice(0, 10);
  }

  function textoError(nodo: HTMLElement | null, mensaje: string): void {
    if (!nodo) return;
    nodo.textContent = mensaje;
    nodo.hidden = !mensaje;
  }

  function notificar(mensaje: string): void {
    window.dispatchEvent(new CustomEvent('fge:cobertura-actualizada', { detail: { mensaje } }));
  }

  function fecha(valor: string | null): string {
    if (!valor) return '—';
    const parsed = new Date(valor);
    return Number.isNaN(parsed.getTime())
      ? 'No disponible'
      : new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(parsed);
  }

  function renderizarHistorial(eventos: EventoHistorialCobertura[]): void {
    if (!historialLista) return;
    historialLista.replaceChildren();
    for (const evento of eventos) {
      const item = document.createElement('li');
      item.className = 'rounded-xl border border-[#EEEAF5] bg-[#F8F7FB] p-4 text-sm';
      const titulo = evento.tipo_evento === 'OTORGAR'
        ? 'Cobertura otorgada'
        : evento.tipo_evento === 'EXTENDER' ? 'Cobertura extendida' : 'Cobertura revocada';
      const encabezado = document.createElement('p');
      encabezado.className = 'font-semibold text-neutral-900';
      encabezado.textContent = titulo;
      const actor = document.createElement('p');
      actor.className = 'mt-1 text-neutral-600';
      actor.textContent = `${fecha(evento.accion_at)} · ${evento.accion_por_nombre}`;
      const motivo = document.createElement('p');
      motivo.className = 'mt-2 text-neutral-700';
      motivo.textContent = evento.motivo;
      const vigencia = document.createElement('p');
      vigencia.className = 'mt-1 text-xs text-neutral-500';
      vigencia.textContent = `Vigencia: ${fecha(evento.fin_at_anterior)} → ${fecha(evento.fin_at_nuevo)}`;
      item.append(encabezado, actor, motivo, vigencia);
      historialLista.append(item);
    }
    if (!eventos.length) {
      const item = document.createElement('li');
      item.className = 'text-sm text-neutral-500';
      item.textContent = 'No hay eventos registrados para esta cobertura.';
      historialLista.append(item);
    }
  }

  lista.addEventListener('click', async (event) => {
    const objetivo = event.target;
    if (!(objetivo instanceof Element)) return;
    const boton = objetivo.closest<HTMLButtonElement>('[data-cobertura-accion]');
    if (!boton) return;
    if (boton.dataset.coberturaAccion === 'historial') {
      const idHistorial = boton.dataset.coberturaId;
      if (!idHistorial || !dialogHistorial) return;
      if (historialSubtitulo) historialSubtitulo.textContent = `${boton.dataset.coordinadorNombre ?? 'Coordinador'} · ${boton.dataset.paisNombre ?? 'País'}`;
      if (historialCarga) historialCarga.hidden = false;
      if (historialError) historialError.hidden = true;
      historialLista?.replaceChildren();
      dialogHistorial.showModal();
      try {
        renderizarHistorial(await cliente.historial(idHistorial));
      } catch (error) {
        if (historialError) {
          historialError.textContent = mensajeErrorCoberturas(error, 'consultar el historial');
          historialError.hidden = false;
        }
      } finally {
        if (historialCarga) historialCarga.hidden = true;
      }
      return;
    }
    const version = Number(boton.dataset.coberturaVersion);
    const id = boton.dataset.coberturaId;
    if (!id || !Number.isSafeInteger(version) || version < 1) return;
    seleccion = {
      id,
      version,
      fechaFin: (boton.dataset.coberturaFin ?? '').slice(0, 10),
      coordinador: boton.dataset.coordinadorNombre || 'Cobertura seleccionada',
    };

    if (boton.dataset.coberturaAccion === 'extender' && dialogExtender && fechaExtension) {
      formExtender?.reset();
      textoError(errorExtension, '');
      textoError(feedbackExtension, '');
      if (nombreExtension) nombreExtension.textContent = `Coordinador: ${seleccion.coordinador}`;
      fechaExtension.min = seleccion.fechaFin ? sumarDia(seleccion.fechaFin) : '';
      dialogExtender.showModal();
      fechaExtension.focus();
      return;
    }

    if (boton.dataset.coberturaAccion === 'revocar' && dialogRevocar) {
      if (nombreRevocar) nombreRevocar.textContent = `Coordinador: ${seleccion.coordinador}`;
      if (motivoRevocacion) motivoRevocacion.value = '';
      textoError(errorRevocacion, '');
      textoError(feedbackRevocacion, '');
      dialogRevocar.showModal();
      motivoRevocacion?.focus();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-cobertura-cerrar]').forEach((boton) => {
    boton.addEventListener('click', () => {
      if (boton.dataset.coberturaCerrar === 'extender') dialogExtender?.close();
      else if (boton.dataset.coberturaCerrar === 'revocar') dialogRevocar?.close();
      else dialogHistorial?.close();
    });
  });

  formExtender?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!seleccion || !fechaExtension) return;
    textoError(errorExtension, '');
    textoError(feedbackExtension, '');
    if (!fechaExtension.value) {
      textoError(errorExtension, 'Selecciona la nueva fecha de término.');
      fechaExtension.focus();
      return;
    }
    if (seleccion.fechaFin && fechaExtension.value <= seleccion.fechaFin) {
      textoError(errorExtension, 'La nueva fecha debe ser posterior al término actual.');
      fechaExtension.focus();
      return;
    }
    const submit = formExtender.querySelector<HTMLButtonElement>('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await cliente.extender(seleccion.id, seleccion.version, fechaExtension.value);
      dialogExtender?.close();
      notificar(`La cobertura de ${seleccion.coordinador} fue extendida correctamente.`);
    } catch (error) {
      textoError(feedbackExtension, mensajeErrorCoberturas(error, 'extender la cobertura'));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  confirmarRevocacion?.addEventListener('click', async () => {
    if (!seleccion || !motivoRevocacion) return;
    const motivo = motivoRevocacion.value.trim();
    textoError(errorRevocacion, '');
    textoError(feedbackRevocacion, '');
    if (motivo.length < 5) {
      textoError(errorRevocacion, 'Describe el motivo con al menos 5 caracteres.');
      motivoRevocacion.focus();
      return;
    }
    confirmarRevocacion.disabled = true;
    try {
      await cliente.revocar(seleccion.id, seleccion.version, motivo);
      dialogRevocar?.close();
      notificar(`La cobertura de ${seleccion.coordinador} fue revocada correctamente.`);
    } catch (error) {
      textoError(feedbackRevocacion, mensajeErrorCoberturas(error, 'revocar la cobertura'));
    } finally {
      confirmarRevocacion.disabled = false;
    }
  });
}
