import { camposCompromisoSchema, type CamposCompromiso } from './modelo';

// Extensión del formulario de Actas existente; sus borradores se envían juntos al guardar.
export function iniciarCompromisosEnActas(raiz: HTMLElement) {
  const bloque = raiz.querySelector<HTMLElement>('#actas-compromisos');
  if (!bloque) return null;
  const lista = bloque.querySelector<HTMLElement>('[data-borradores]')!;
  let secuencia = 0;
  bloque.querySelector('button')!.addEventListener('click', () => {
    const grupo = document.createElement('fieldset'); grupo.className = 'rounded-lg border border-neutral-300 p-4 space-y-3';
    const leyenda = document.createElement('legend'); leyenda.textContent = `Compromiso ${++secuencia}`; grupo.append(leyenda);
    for (const [nombre, etiqueta] of Object.entries({ descripcion: 'Acuerdo', responsable_nombre: 'Responsable', responsable_contacto: 'Contacto del responsable', fecha_limite: 'Fecha límite', observaciones: 'Observaciones (opcional)' })) {
      const label = document.createElement('label'); label.className = 'block text-sm font-medium'; label.textContent = `${etiqueta}${nombre !== 'observaciones' ? ' *' : ''}`;
      const input = document.createElement('input'); input.type = nombre === 'fecha_limite' ? 'date' : 'text';
      input.dataset.campo = nombre; input.required = nombre !== 'observaciones';
      input.maxLength = nombre === 'responsable_nombre' ? 150 : nombre === 'responsable_contacto' ? 300 : 2000;
      input.className = 'mt-1 min-h-[48px] w-full rounded-lg border border-neutral-300 bg-white p-2';
      label.append(input); grupo.append(label);
    }
    const quitar = document.createElement('button'); quitar.type = 'button'; quitar.textContent = 'Quitar compromiso'; quitar.className = 'min-h-[48px] text-danger underline';
    quitar.addEventListener('click', () => grupo.remove()); grupo.append(quitar); lista.append(grupo); grupo.querySelector('input')!.focus();
  });
  return {
    reiniciar(editando: boolean) { lista.replaceChildren(); secuencia = 0; bloque.hidden = editando; },
    obtener(): CamposCompromiso[] | null {
      lista.querySelectorAll('[data-error-borrador]').forEach(n => n.remove());
      lista.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
      const entradas: CamposCompromiso[] = []; let valido = true;
      for (const grupo of lista.querySelectorAll('fieldset')) {
        const campos = Object.fromEntries([...grupo.querySelectorAll<HTMLInputElement>('input')].map(n => [n.dataset.campo!, n.value]));
        const resultado = camposCompromisoSchema.safeParse(campos);
        if (resultado.success) entradas.push(resultado.data);
        else {
          valido = false;
          for (const issue of resultado.error.issues) {
            const input = grupo.querySelector<HTMLInputElement>(`[data-campo="${String(issue.path[0])}"]`)!;
            input.setAttribute('aria-invalid', 'true');
            const error = document.createElement('p'); error.dataset.errorBorrador = ''; error.className = 'text-danger text-sm'; error.textContent = issue.message; input.after(error);
          }
        }
      }
      if (!valido) lista.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return valido ? entradas : null;
    },
    detalle(compromisos: Array<CamposCompromiso & { estado: 'pendiente' | 'cumplido' }>) {
      const destino = raiz.querySelector<HTMLElement>('#actas-compromisos-detalle')!;
      destino.replaceChildren();
      if (!compromisos.length) { destino.textContent = 'Sin compromisos asociados.'; return; }
      for (const c of compromisos) {
        const p = document.createElement('p'); p.className = 'my-2 rounded-lg border p-3 whitespace-pre-wrap break-words';
        p.textContent = `${c.descripcion}\nResponsable: ${c.responsable_nombre} · ${c.responsable_contacto}\nFecha límite: ${c.fecha_limite} · ${c.estado === 'cumplido' ? 'Cumplido' : 'Pendiente'}`;
        destino.append(p);
      }
    },
  };
}
