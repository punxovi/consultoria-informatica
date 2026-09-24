import { crearProgramaSchema } from '../../actions/programas/programas.schema';
import { getUserRoles } from '../supabase';
import { actualizarPrograma, crearPrograma, obtenerPrograma } from './cliente';
import { guardarImagen, obtenerImagen, optimizarImagen } from './imagen';

const form = document.querySelector<HTMLFormElement>('#programa-form');
if (form) iniciar(form);

function iniciar(form: HTMLFormElement) {
  const campos = document.querySelector<HTMLFieldSetElement>('#programa-campos')!;
  const estado = document.querySelector<HTMLElement>('#programa-estado')!;
  const errores = document.querySelector<HTMLElement>('#programa-errores')!;
  const lineas = document.querySelector<HTMLElement>('#programa-lineas')!;
  const agregar = document.querySelector<HTMLButtonElement>('#agregar-linea')!;
  const guardar = document.querySelector<HTMLButtonElement>('#guardar-programa')!;
  const imagen = document.querySelector<HTMLInputElement>('#imagen')!;
  const preview = document.querySelector<HTMLImageElement>('#imagen-preview')!;
  let id = form.dataset.id || '';
  let version: number | undefined;
  let modificado = false;
  let ocupado = false;
  let imagenPendiente: Blob | null = null;
  let previewUrl = '';
  let secuenciaImagen = 0;
  let imagenInvalida = false;
  const nombres = ['nombre', 'objetivo_general', 'objetivos_especificos', 'descripcion', 'referencias_ods', 'referencias_esg'] as const;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement | HTMLTextAreaElement;

  function mostrarError(mensaje: string) {
    errores.textContent = mensaje;
    errores.classList.remove('hidden');
    errores.focus();
  }
  function limpiarErrores() {
    errores.classList.add('hidden');
    errores.replaceChildren();
    form.querySelectorAll('[aria-invalid="true"]').forEach(el => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    form.querySelectorAll('[data-error-campo]').forEach(el => el.remove());
  }
  function numerar() {
    [...lineas.children].forEach((fila, i) => {
      fila.querySelector('legend')!.textContent = `Línea ${i + 1}`;
      ['linea_accion', 'resultado_esperado'].forEach(nombre => {
        const input = fila.querySelector<HTMLTextAreaElement>(`[data-campo="${nombre}"]`)!;
        input.name = `lineas_accion.${i}.${nombre}`;
        input.id = `lineas_accion-${i}-${nombre}`;
        fila.querySelector<HTMLLabelElement>(`[data-label="${nombre}"]`)!.htmlFor = input.id;
      });
      const quitar = fila.querySelector<HTMLButtonElement>('[data-quitar]')!;
      quitar.disabled = lineas.children.length === 1;
      quitar.setAttribute('aria-label', `Quitar línea ${i + 1}`);
    });
    agregar.disabled = lineas.children.length >= 50;
  }
  function nuevaLinea(datos = { linea_accion: '', resultado_esperado: '' }) {
    if (lineas.children.length >= 50) return;
    const plantilla = document.querySelector<HTMLTemplateElement>('#plantilla-linea')!;
    const contenido = plantilla.content.cloneNode(true) as DocumentFragment;
    contenido.querySelector<HTMLTextAreaElement>('[data-campo="linea_accion"]')!.value = datos.linea_accion;
    contenido.querySelector<HTMLTextAreaElement>('[data-campo="resultado_esperado"]')!.value = datos.resultado_esperado;
    contenido.querySelector('[data-quitar]')!.addEventListener('click', (evento) => {
      if (lineas.children.length === 1) return;
      (evento.currentTarget as HTMLElement).closest('fieldset')!.remove();
      limpiarErrores(); numerar(); modificado = true; agregar.focus();
    });
    lineas.append(contenido); numerar();
  }
  agregar.addEventListener('click', () => {
    nuevaLinea(); modificado = true;
    lineas.lastElementChild?.querySelector('textarea')?.focus();
  });
  form.addEventListener('input', evento => {
    modificado = true;
    const input = evento.target as HTMLElement;
    if (input.getAttribute('aria-invalid') === 'true') {
      const errorId = input.getAttribute('aria-describedby');
      if (errorId) document.getElementById(errorId)?.remove();
      input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
    }
  });
  document.querySelector('#cancelar-programa')!.addEventListener('click', () => {
    if (!modificado || confirm('¿Descartar los cambios sin guardar?')) {
      modificado = false; window.location.assign('/programas');
    }
  });
  window.addEventListener('beforeunload', evento => {
    if (modificado || ocupado) { evento.preventDefault(); evento.returnValue = ''; }
  });
  imagen.addEventListener('change', async () => {
    const solicitud = ++secuenciaImagen;
    imagenPendiente = null;
    imagenInvalida = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    preview.hidden = true;
    const archivo = imagen.files?.[0];
    if (!archivo) { guardar.disabled = false; estado.textContent = ''; return; }
    guardar.disabled = true;
    estado.textContent = 'Optimizando imagen…';
    try {
      const blob = await optimizarImagen(archivo);
      if (solicitud !== secuenciaImagen) return;
      imagenPendiente = blob;
      previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl; preview.hidden = false;
      estado.textContent = `Imagen lista (${Math.ceil(blob.size / 1000)} KB).`;
    } catch (error) {
      if (solicitud !== secuenciaImagen) return;
      imagenInvalida = true;
      mostrarError(error instanceof Error ? error.message : 'No se pudo procesar la imagen.');
      estado.textContent = '';
    } finally { if (solicitud === secuenciaImagen) guardar.disabled = false; }
  });

  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || campos.disabled || guardar.disabled) return;
    limpiarErrores();
    if (imagenInvalida) { mostrarError('Selecciona una imagen válida o quita el archivo seleccionado.'); return; }
    const entrada = {
      ...Object.fromEntries(nombres.map(nombre => [nombre, campo(nombre).value])),
      lineas_accion: [...lineas.children].map(fila => ({
        linea_accion: fila.querySelector<HTMLTextAreaElement>('[data-campo="linea_accion"]')!.value,
        resultado_esperado: fila.querySelector<HTMLTextAreaElement>('[data-campo="resultado_esperado"]')!.value,
      })),
    };
    const validacion = crearProgramaSchema.safeParse(entrada);
    if (!validacion.success) {
      mostrarError('Revisa los campos indicados antes de guardar.');
      for (const issue of validacion.error.issues) {
        const input = campo(issue.path.join('.'));
        const mensaje = document.createElement('p');
        mensaje.textContent = issue.message;
        mensaje.className = 'mt-1 text-sm text-red-800';
        mensaje.dataset.errorCampo = '';
        if (input) {
          mensaje.id = `${input.id}-validacion`;
          input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', mensaje.id);
          input.after(mensaje);
        } else errores.append(mensaje);
      }
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    ocupado = true; campos.disabled = true; form.setAttribute('aria-busy', 'true');
    estado.textContent = 'Guardando programa…'; guardar.textContent = 'Guardando…';
    try {
      const programa = id
        ? await actualizarPrograma({ id_programa: id, version_esperada: version, cambios: validacion.data })
        : await crearPrograma(validacion.data);
      // Una falla posterior de Storage no debe volver a crear el programa.
      id = programa.id_programa; version = programa.version;
      form.dataset.id = id;
      history.replaceState(null, '', `/programas/${id}/editar`);
      if (imagenPendiente) {
        estado.textContent = 'Programa guardado. Subiendo imagen…';
        await guardarImagen(id, imagenPendiente, imagen.files?.[0]?.name || 'imagen.webp');
        imagenPendiente = null; imagen.value = '';
      }
      modificado = false;
      estado.textContent = 'Programa guardado correctamente.';
    } catch (error) {
      estado.textContent = '';
      mostrarError(error instanceof Error ? error.message : 'No se pudo guardar el programa.');
    } finally {
      ocupado = false; campos.disabled = false; form.setAttribute('aria-busy', 'false'); guardar.textContent = 'Guardar programa';
    }
  });

  async function cargar() {
    try {
      const roles = await getUserRoles();
      if (!roles.some(rol => rol.codigo === 'ADMIN')) throw new Error('Solo el Administrador puede crear o editar programas.');
      if (id) {
        const programa = await obtenerPrograma(id);
        version = programa.version;
        nombres.forEach(nombre => { campo(nombre).value = programa[nombre] || ''; });
        programa.lineas_accion.forEach(nuevaLinea);
        try {
          const url = await obtenerImagen(id);
          if (url) { preview.src = url; preview.hidden = false; }
        } catch (error) { mostrarError((error as Error).message); }
      }
      if (!lineas.children.length) nuevaLinea();
      campos.disabled = false; estado.textContent = ''; form.setAttribute('aria-busy', 'false');
    } catch (error) {
      estado.textContent = 'No se pudo cargar el formulario.';
      mostrarError(error instanceof Error ? error.message : 'Vuelve a intentarlo más tarde.');
      form.setAttribute('aria-busy', 'false');
    }
  }
  void cargar();
}
