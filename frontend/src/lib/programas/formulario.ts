import { actualizarProgramaSchema, crearProgramaSchema, obtenerProgramaPorIdSchema } from '../../actions/programas/programas.schema';
import { getUserRoles } from '../supabase';
import { actualizarPrograma, crearPrograma, obtenerPrograma } from './cliente';
import { ErrorSolicitudPrograma, type ErrorCampo } from './transporte';

const form = document.querySelector<HTMLFormElement>('#programa-form');
if (form) iniciar(form);

function iniciar(form: HTMLFormElement) {
  const campos = form.querySelector<HTMLFieldSetElement>('#programa-campos')!;
  const estado = document.querySelector<HTMLElement>('#programa-estado')!;
  const errores = document.querySelector<HTMLElement>('#programa-errores')!;
  const recuperacion = document.querySelector<HTMLElement>('#programa-recuperacion')!;
  const recargar = document.querySelector<HTMLButtonElement>('#recargar-programa')!;
  const lineas = form.querySelector<HTMLElement>('#programa-lineas')!;
  const agregar = form.querySelector<HTMLButtonElement>('#agregar-linea')!;
  const guardar = form.querySelector<HTMLButtonElement>('#guardar-programa')!;
  const id = form.dataset.id || '';
  let version: number | undefined;
  let permiteSinLineas = false;
  let modificado = false;
  let ocupado = false;
  const nombres = ['nombre', 'objetivo_general', 'objetivos_especificos', 'descripcion'] as const;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement | HTMLTextAreaElement | null;

  function limpiarErrores() {
    errores.classList.add('hidden');
    errores.replaceChildren();
    recuperacion.hidden = true;
    form.querySelectorAll('[aria-invalid="true"]').forEach(el => {
      el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby');
    });
    form.querySelectorAll('[data-error-campo]').forEach(el => el.remove());
  }
  function mostrarError(mensaje: string, detalles: ErrorCampo[] = []) {
    errores.textContent = mensaje;
    errores.classList.remove('hidden');
    for (const { campo: nombre, mensaje: texto } of detalles) {
      const input = campo(nombre);
      const parrafo = document.createElement('p');
      parrafo.textContent = texto;
      parrafo.className = 'mt-1 text-sm text-red-800';
      parrafo.dataset.errorCampo = '';
      if (input) {
        parrafo.id = `${input.id}-validacion`;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', parrafo.id);
        // Varias reglas del mismo campo se muestran en un único mensaje.
        const anterior = document.getElementById(parrafo.id);
        if (anterior) anterior.textContent += ` ${texto}`;
        else input.after(parrafo);
      } else errores.append(parrafo);
    }
    (form.querySelector<HTMLElement>('[aria-invalid="true"]') || errores).focus();
  }
  function numerar() {
    [...lineas.children].forEach((fila, i) => {
      fila.querySelector('legend')!.textContent = `Línea ${i + 1}`;
      for (const nombre of ['linea_accion', 'resultado_esperado']) {
        const input = fila.querySelector<HTMLTextAreaElement>(`[data-campo="${nombre}"]`)!;
        input.name = `lineas_accion.${i}.${nombre}`;
        input.id = `lineas_accion-${i}-${nombre}`;
        fila.querySelector<HTMLLabelElement>(`[data-label="${nombre}"]`)!.htmlFor = input.id;
      }
      const quitar = fila.querySelector<HTMLButtonElement>('[data-quitar]')!;
      quitar.disabled = !permiteSinLineas && lineas.children.length === 1;
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
    contenido.querySelector('[data-quitar]')!.addEventListener('click', evento => {
      if (!permiteSinLineas && lineas.children.length === 1) return;
      (evento.currentTarget as HTMLElement).closest('fieldset')!.remove();
      limpiarErrores(); numerar(); modificado = true; agregar.focus();
    });
    lineas.append(contenido); numerar();
  }
  agregar.addEventListener('click', () => {
    nuevaLinea(); modificado = true;
    lineas.lastElementChild?.querySelector('textarea')?.focus();
  });
  form.addEventListener('input', () => { modificado = true; });
  document.querySelector('#cancelar-programa')!.addEventListener('click', () => {
    if (!modificado || confirm('¿Descartar los cambios sin guardar?')) {
      modificado = false;
      window.location.assign(id ? `/programas/${id}` : '/programas');
    }
  });
  window.addEventListener('beforeunload', evento => {
    if (modificado || ocupado) { evento.preventDefault(); evento.returnValue = ''; }
  });
  recargar.addEventListener('click', () => {
    if (!modificado || confirm('¿Descartar tus cambios y cargar la versión guardada?')) void cargar();
  });

  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || campos.disabled) return;
    limpiarErrores();
    const entrada = {
      ...Object.fromEntries(nombres.map(nombre => [nombre, campo(nombre)!.value])),
      ...(permiteSinLineas && !lineas.children.length ? {} : {
        lineas_accion: [...lineas.children].map(fila => ({
          linea_accion: fila.querySelector<HTMLTextAreaElement>('[data-campo="linea_accion"]')!.value,
          resultado_esperado: fila.querySelector<HTMLTextAreaElement>('[data-campo="resultado_esperado"]')!.value,
        })),
      }),
    };
    // Una edición de un programa legado puede omitir líneas; una creación no.
    const validacion = id
      ? actualizarProgramaSchema.safeParse({ id_programa: id, version_esperada: version, cambios: entrada })
      : crearProgramaSchema.safeParse(entrada);
    if (!validacion.success) {
      mostrarError('Revisa los campos indicados antes de guardar.', validacion.error.issues.map(issue => ({
        campo: issue.path.join('.').replace(/^cambios\./, ''), mensaje: issue.message,
      })));
      return;
    }
    ocupado = true; campos.disabled = true; form.setAttribute('aria-busy', 'true');
    estado.textContent = 'Guardando programa…'; guardar.textContent = 'Guardando…';
    let guardado = false;
    try {
      const datos = validacion.data;
      const programa = 'id_programa' in datos ? await actualizarPrograma(datos) : await crearPrograma(datos);
      modificado = false; ocupado = false; guardado = true;
      estado.textContent = 'Programa guardado correctamente.';
      window.location.replace(`/programas/${programa.id_programa}?resultado=guardado`);
    } catch (error) {
      estado.textContent = '';
      // Reactivar antes de enfocar el campo inválido recibido del servidor.
      campos.disabled = false;
      mostrarError(error instanceof Error ? error.message : 'No se pudo guardar el programa.',
        error instanceof ErrorSolicitudPrograma ? error.campos : []);
      recuperacion.hidden = false;
    } finally {
      ocupado = false;
      if (!guardado) campos.disabled = false;
      form.setAttribute('aria-busy', 'false'); guardar.textContent = 'Guardar programa';
    }
  });

  async function cargar() {
    if (ocupado) return;
    ocupado = true; campos.disabled = true; recargar.disabled = true;
    form.setAttribute('aria-busy', 'true'); estado.textContent = 'Cargando formulario…';
    limpiarErrores();
    try {
      if (id && !obtenerProgramaPorIdSchema.safeParse({ id_programa: id }).success) {
        throw new ErrorSolicitudPrograma('NO_ENCONTRADO', 'Programa no encontrado.');
      }
      const roles = await getUserRoles();
      if (!roles.some(rol => rol.codigo === 'ADMIN')) throw new Error('Solo el Administrador puede crear o editar programas.');
      if (id) {
        const programa = await obtenerPrograma(id);
        version = programa.version;
        nombres.forEach(nombre => { campo(nombre)!.value = programa[nombre]; });
        permiteSinLineas = programa.lineas_accion.length === 0;
        lineas.replaceChildren(); programa.lineas_accion.forEach(nuevaLinea);
        document.querySelector<HTMLElement>('#programa-legado')!.hidden = !permiteSinLineas;
        document.querySelector('#legado-componentes')!.textContent = programa.componentes_linea_accion;
        document.querySelector('#legado-resultados')!.textContent = programa.resultados_esperados;
      } else if (!lineas.children.length) nuevaLinea();
      modificado = false; campos.disabled = false; estado.textContent = '';
    } catch (error) {
      const inexistente = error instanceof ErrorSolicitudPrograma && error.codigo === 'NO_ENCONTRADO';
      estado.textContent = inexistente ? 'Programa no encontrado' : 'No se pudo cargar el formulario.';
      mostrarError(error instanceof Error ? error.message : 'Vuelve a intentarlo más tarde.');
      recuperacion.hidden = inexistente;
    } finally {
      ocupado = false; recargar.disabled = false; form.setAttribute('aria-busy', 'false');
    }
  }
  void cargar();
}
