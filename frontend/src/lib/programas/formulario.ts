import { actualizarProgramaSchema, crearProgramaSchema, obtenerProgramaPorIdSchema } from '../validaciones/programas';
import { confirmarDescarte } from '../ui/descartar-cambios';
import { getUserRoles } from '../supabase';
import { actualizarPrograma, crearPrograma, obtenerPrograma } from './cliente';
import { guardarImagen, obtenerImagen, optimizarImagen, quitarImagen } from './imagen';
import { ErrorSolicitudPrograma, type ErrorCampo } from './transporte';

const form = document.querySelector<HTMLFormElement>('#programa-form');
if (form) iniciar(form);

function iniciar(form: HTMLFormElement) {
  const campos = form.querySelector<HTMLFieldSetElement>('#programa-campos')!;
  const estado = document.querySelector<HTMLElement>('#programa-estado')!;
  const errores = document.querySelector<HTMLElement>('#programa-errores')!;
  const recuperacion = document.querySelector<HTMLElement>('#programa-recuperacion');
  const recargar = document.querySelector<HTMLButtonElement>('#recargar-programa');
  const lineas = form.querySelector<HTMLElement>('#programa-lineas')!;
  const agregar = form.querySelector<HTMLButtonElement>('#agregar-linea')!;
  const guardar = form.querySelector<HTMLButtonElement>('#guardar-programa')!;
  const imagen = document.querySelector<HTMLInputElement>('#imagen');
  const preview = document.querySelector<HTMLImageElement>('#imagen-preview');
  const quitarContenedor = document.querySelector<HTMLElement>('#quitar-imagen-contenedor');
  const imagenCambio = document.querySelector<HTMLElement>('#imagen-cambio');
  
  let id = form.dataset.id || '';
  const esCreacion = !id;
  let version: number | undefined;
  let ultimoContenidoGuardado: string | null = null;
  let permiteSinLineas = false;
  let modificado = false;
  let ocupado = false;
  let imagenGuardadaUrl: string | null = null;
  let quitarImagenPendiente = false;
  let imagenPendiente: Blob | null = null;
  let previewUrl = '';
  let secuenciaImagen = 0;
  let imagenInvalida = false;
  
  const nombres = ['nombre', 'objetivo_general', 'objetivos_especificos', 'descripcion', 'referencias_ods', 'referencias_esg'] as const;
  const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement | HTMLTextAreaElement | null;

  function restablecerImagen() {
    ++secuenciaImagen;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    imagenPendiente = null;
    imagenGuardadaUrl = null;
    quitarImagenPendiente = false;
    imagenInvalida = false;
    if (imagen) imagen.value = '';
    if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
    if (quitarContenedor) quitarContenedor.hidden = true;
    if (imagenCambio) imagenCambio.textContent = '';
    guardar.disabled = false;
  }

  function limpiarErrores() {
    errores.classList.add('hidden');
    errores.replaceChildren();
    if (recuperacion) recuperacion.hidden = true;
    form.querySelectorAll('[aria-invalid="true"]').forEach(el => {
      el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby');
    });
    form.querySelectorAll('[data-error-campo]').forEach(el => el.remove());
  }

  function mostrarError(mensaje: string, detalles: ErrorCampo[] = []) {
    errores.textContent = mensaje;
    errores.classList.remove('hidden');
    if (detalles.length === 0) {
      errores.focus();
      return;
    }
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
      ['linea_accion', 'resultado_esperado'].forEach(nombre => {
        const input = fila.querySelector<HTMLTextAreaElement>(`[data-campo="${nombre}"]`)!;
        input.name = `lineas_accion.${i}.${nombre}`;
        input.id = `lineas_accion-${i}-${nombre}`;
        fila.querySelector<HTMLLabelElement>(`[data-label="${nombre}"]`)!.htmlFor = input.id;
      });
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
    modificado = false;
    window.location.assign(id ? `/programas/${id}` : '/programas');
  });

  window.addEventListener('beforeunload', evento => {
    if (modificado || ocupado) { evento.preventDefault(); evento.returnValue = ''; }
  });

  if (recargar) {
    recargar.addEventListener('click', async () => {
      if (!modificado || await confirmarDescarte('Se cargará la versión guardada y perderás tus cambios.')) void cargar();
    });
  }

  if (imagen && preview && quitarContenedor && imagenCambio) {
    document.querySelector('#quitar-imagen')!.addEventListener('click', () => {
      ++secuenciaImagen;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      imagenPendiente = null;
      imagenInvalida = false;
      imagen.value = '';
      preview.hidden = true;
      preview.removeAttribute('src');
      quitarImagenPendiente = Boolean(imagenGuardadaUrl);
      quitarContenedor.hidden = true;
      guardar.disabled = false;
      modificado = true;
      estado.textContent = '';
      imagenCambio.textContent = quitarImagenPendiente ? 'La imagen se quitará al guardar el programa.' : 'Imagen seleccionada retirada.';
      imagen.focus();
    });

    imagen.addEventListener('change', async () => {
      limpiarErrores();
      const solicitud = ++secuenciaImagen;
      imagenPendiente = null;
      imagenInvalida = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = '';
      preview.hidden = true;
      const archivo = imagen.files?.[0];
      if (!archivo) {
        if (imagenGuardadaUrl && !quitarImagenPendiente) { preview.src = imagenGuardadaUrl; preview.hidden = false; }
        quitarContenedor.hidden = preview.hidden;
        guardar.disabled = false; estado.textContent = ''; return;
      }
      quitarContenedor.hidden = false;
      guardar.disabled = true;
      estado.textContent = 'Optimizando imagen…';
      try {
        const blob = await optimizarImagen(archivo);
        if (solicitud !== secuenciaImagen) return;
        imagenPendiente = blob;
        quitarImagenPendiente = false;
        imagenCambio.textContent = '';
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
  }

  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || campos.disabled || guardar.disabled) return;
    limpiarErrores();
    if (imagenInvalida) { mostrarError('Selecciona una imagen válida o quita el archivo seleccionado.'); return; }
    
    const entrada = {
      ...Object.fromEntries(nombres.map(nombre => [nombre, campo(nombre)!.value])),
      ...(permiteSinLineas && !lineas.children.length ? {} : {
        lineas_accion: [...lineas.children].map(fila => ({
          linea_accion: fila.querySelector<HTMLTextAreaElement>('[data-campo="linea_accion"]')!.value,
          resultado_esperado: fila.querySelector<HTMLTextAreaElement>('[data-campo="resultado_esperado"]')!.value,
        })),
      }),
    };

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
      const contenido = JSON.stringify('id_programa' in datos ? datos.cambios : datos);
      if (contenido !== ultimoContenidoGuardado) {
        const programa = 'id_programa' in datos ? await actualizarPrograma(datos) : await crearPrograma(datos);
        id = programa.id_programa;
        version = programa.version;
        permiteSinLineas = programa.lineas_accion.length === 0;
        numerar();
        form.dataset.id = id;
        ultimoContenidoGuardado = contenido;
        history.replaceState(null, '', `/programas/${id}/editar`);
        document.querySelector('#programa-form-titulo')!.textContent = 'Editar programa';
      }
      
      if (imagenPendiente) {
        estado.textContent = 'Programa guardado. Subiendo imagen…';
        await guardarImagen(id, imagenPendiente, imagen?.files?.[0]?.name || 'imagen.webp');
      } else if (quitarImagenPendiente) {
        estado.textContent = 'Programa guardado. Quitando imagen…';
        await quitarImagen(id);
      }
      
      modificado = false; ocupado = false; guardado = true;
      estado.textContent = esCreacion ? 'Programa creado correctamente.' : 'Programa modificado correctamente.';
      window.location.replace(`/programas/${id}?resultado=${esCreacion ? 'creado' : 'guardado'}`);
    } catch (error) {
      estado.textContent = '';
      campos.disabled = false;
      mostrarError(error instanceof Error ? error.message : 'No se pudo guardar el programa.',
        error instanceof ErrorSolicitudPrograma ? error.campos : []);
      if (recuperacion) {
        recuperacion.hidden = !(
          error instanceof ErrorSolicitudPrograma &&
          ['SESION', 'CONEXION', 'HTTP', 'CONFLICTO_CONCURRENCIA'].includes(error.codigo)
        );
      }
    } finally {
      ocupado = false;
      if (!guardado) campos.disabled = false;
      form.setAttribute('aria-busy', 'false'); guardar.textContent = 'Guardar programa';
    }
  });

  async function cargar() {
    if (ocupado) return;
    ocupado = true; campos.disabled = true; if (recargar) recargar.disabled = true;
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
        ultimoContenidoGuardado = null;
        restablecerImagen();
        nombres.forEach(nombre => { const c = campo(nombre); if(c) c.value = programa[nombre] || ''; });
        permiteSinLineas = programa.lineas_accion.length === 0;
        lineas.replaceChildren(); programa.lineas_accion.forEach(nuevaLinea);
        const legado = document.querySelector<HTMLElement>('#programa-legado');
        if (legado) {
          legado.hidden = !permiteSinLineas;
          document.querySelector('#legado-componentes')!.textContent = programa.componentes_linea_accion || '';
          document.querySelector('#legado-resultados')!.textContent = programa.resultados_esperados || '';
        }
        try {
          const url = await obtenerImagen(id);
          imagenGuardadaUrl = url;
          if (url && preview && quitarContenedor) { preview.src = url; preview.hidden = false; quitarContenedor.hidden = false; }
        } catch (error) { mostrarError((error as Error).message); }
      } else if (!lineas.children.length) {
        nuevaLinea();
      }
      numerar();
      modificado = false; campos.disabled = false; estado.textContent = '';
    } catch (error) {
      const inexistente = error instanceof ErrorSolicitudPrograma && error.codigo === 'NO_ENCONTRADO';
      estado.textContent = inexistente ? 'Programa no encontrado' : 'No se pudo cargar el formulario.';
      mostrarError(error instanceof Error ? error.message : 'Vuelve a intentarlo más tarde.');
      if (recuperacion) recuperacion.hidden = inexistente;
    } finally {
      ocupado = false; if (recargar) recargar.disabled = false; form.setAttribute('aria-busy', 'false');
    }
  }
  
  void cargar();
}
