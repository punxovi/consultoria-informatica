import { clienteCoberturasNavegador, mensajeErrorCoberturas } from './cliente.ts';

type Seleccion = {
  id: string;
  version: number;
  fechaFin: string;
  coordinador: string;
};

export function iniciarDialogosCobertura(): void {
  const lista = document.querySelector<HTMLElement>('#coberturas-lista');
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

  lista.addEventListener('click', (event) => {
    const objetivo = event.target;
    if (!(objetivo instanceof Element)) return;
    const boton = objetivo.closest<HTMLButtonElement>('[data-cobertura-accion]');
    if (!boton) return;
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
      else dialogRevocar?.close();
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
