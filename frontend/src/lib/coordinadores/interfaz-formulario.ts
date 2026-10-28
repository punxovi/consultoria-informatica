import { ApiError } from '../api/transporte.ts';
import { listarPaisesOrganizaciones } from '../organizaciones/cliente.ts';
import { clienteCoordinadoresNavegador, mensajeErrorCoordinadores, type ClienteCoordinadores } from './cliente.ts';
import {
  crearCoordinadorSchema,
  editarCoordinadorSchema,
  erroresDeValidacion,
  type Coordinador,
  type ErroresFormulario,
} from './modelo.ts';

type Campo = keyof ErroresFormulario;
const campos: Campo[] = ['nombre', 'correo', 'id_pais'];

export function iniciarFormularioCoordinador(cliente: ClienteCoordinadores = clienteCoordinadoresNavegador()) {
  const contenedor = document.querySelector<HTMLElement>('#coordinador-form');
  if (!contenedor || contenedor.dataset.iniciado) return;
  contenedor.dataset.iniciado = 'true';
  const raiz: HTMLElement = contenedor;

  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#cf-${id}`)!;
  const editar = raiz.dataset.modo === 'editar';
  const idUsuario = raiz.dataset.id ?? '';
  const form = q<HTMLFormElement>('form');
  const nombre = q<HTMLInputElement>('nombre');
  const correo = q<HTMLInputElement>('correo');
  const pais = q<HTMLSelectElement>('pais');
  const guardar = q<HTMLButtonElement>('guardar');
  const textoGuardar = guardar.textContent?.trim() ?? 'Guardar';
  const controles: Record<Campo, HTMLInputElement | HTMLSelectElement> = { nombre, correo, id_pais: pais };

  let original: Coordinador | null = null;
  let enviando = false;
  let paisesListos = false;

  function estadoCarga(texto: string | null) {
    q('carga').hidden = !texto;
    q('carga-texto').textContent = texto ?? '';
  }

  function errorCarga(mensaje: string | null) {
    q('error-carga').hidden = !mensaje;
    q('error-carga-texto').textContent = mensaje ?? '';
  }

  function limpiarError(campo: Campo) {
    const control = controles[campo];
    control.setAttribute('aria-invalid', 'false');
    raiz.querySelector(`#cf-${campo}-error`)?.remove();
    const ayuda = raiz.querySelector(`[data-campo="${campo}"] p:not([data-error])`)?.id;
    if (ayuda) control.setAttribute('aria-describedby', ayuda);
    else control.removeAttribute('aria-describedby');
  }

  function mostrarErrores(errores: ErroresFormulario) {
    let primero: HTMLElement | null = null;
    for (const campo of campos) {
      limpiarError(campo);
      const mensaje = errores[campo];
      if (!mensaje || (editar && campo === 'correo')) continue;
      const control = controles[campo];
      const p = document.createElement('p');
      p.id = `cf-${campo}-error`;
      p.dataset.error = '';
      p.className = 'mt-1 text-sm text-[#AD174F]';
      p.setAttribute('role', 'alert');
      p.textContent = mensaje;
      raiz.querySelector(`[data-campo="${campo}"]`)?.append(p);
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), p.id].filter(Boolean).join(' '));
      primero ??= control;
    }
    return primero;
  }

  function errorGeneral(mensaje: string | null) {
    const nodo = q('error-general');
    nodo.hidden = !mensaje;
    nodo.textContent = mensaje ?? '';
    if (mensaje) nodo.focus();
  }

  function bloquear(estado: boolean) {
    enviando = estado;
    q<HTMLFieldSetElement>('campos').disabled = estado;
    guardar.disabled = estado || !paisesListos;
    guardar.textContent = estado ? 'Guardando…' : textoGuardar;
    guardar.setAttribute('aria-busy', String(estado));
  }

  function pintarEstadoCuenta(c: Coordinador) {
    const nodo = raiz.querySelector('#cf-estado-cuenta');
    if (!nodo) return;
    nodo.textContent = '';
    const badge = document.createElement('span');
    badge.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${c.activo ? 'bg-[#E5F6ED] text-[#14784D]' : 'bg-[#FFF3DC] text-[#925500]'}`;
    badge.textContent = c.activo ? 'Cuenta activa' : 'Cuenta inactiva';
    nodo.append(badge, document.createTextNode(c.activo
      ? 'El Coordinador puede iniciar sesión. Para desactivarla usa el listado de cuentas.'
      : 'El Coordinador no puede iniciar sesión. Para activarla usa el listado de cuentas.'));
    if (c.cambio_pais_pendiente) {
      const pendiente = document.createElement('span');
      pendiente.className = 'basis-full rounded-lg border border-[#E8D8AA] bg-[#FFF9E9] px-3 py-2 text-sm text-[#7A5A00]';
      pendiente.textContent = 'El nuevo país y sus permisos se aplicarán en el próximo inicio de sesión.';
      pendiente.setAttribute('role', 'status');
      nodo.append(pendiente);
    }
  }

  async function cargar() {
    errorCarga(null);
    form.hidden = true;
    estadoCarga(editar ? 'Cargando la cuenta y los países…' : 'Cargando países…');
    q<HTMLButtonElement>('reintentar').disabled = true;
    try {
      const [paises, cuenta] = await Promise.all([
        listarPaisesOrganizaciones().catch((error) => { throw Object.assign(error ?? {}, { origen: 'paises' }); }),
        editar ? cliente.obtener(idUsuario) : Promise.resolve(null),
      ]);
      pais.replaceChildren(pais.options[0]);
      for (const p of paises) pais.append(new Option(p.nombre, p.id_pais));
      paisesListos = paises.length > 0;
      if (cuenta) {
        original = cuenta;
        nombre.value = cuenta.nombre;
        correo.value = cuenta.correo;
        // Un país que ya no está en el catálogo se conserva como opción para no perderlo.
        if (!paises.some((p) => p.id_pais === cuenta.id_pais)) pais.append(new Option(cuenta.pais?.nombre ?? 'País actual', cuenta.id_pais));
        pais.value = cuenta.id_pais;
        pintarEstadoCuenta(cuenta);
      }
      form.hidden = false;
      bloquear(false);
      if (!paisesListos) {
        errorGeneral('No hay países disponibles para asignar. Registra un país antes de crear o editar Coordinadores.');
      }
    } catch (error) {
      const deCatalogo = (error as { origen?: string })?.origen === 'paises';
      errorCarga(deCatalogo
        ? 'No fue posible cargar el catálogo de países. Inténtalo nuevamente.'
        : mensajeErrorCoordinadores(error, 'cargar la cuenta'));
    } finally {
      estadoCarga(null);
      q<HTMLButtonElement>('reintentar').disabled = false;
    }
  }

  for (const campo of campos) {
    controles[campo].addEventListener('input', () => limpiarError(campo));
    controles[campo].addEventListener('change', () => limpiarError(campo));
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviando || !paisesListos) return;
    errorGeneral(null);
    const datos = { nombre: nombre.value, correo: correo.value, id_pais: pais.value };
    const resultado = editar ? editarCoordinadorSchema.safeParse(datos) : crearCoordinadorSchema.safeParse(datos);
    if (!resultado.success) {
      const primero = mostrarErrores(erroresDeValidacion(resultado.error));
      errorGeneral('Corrige los campos marcados antes de continuar.');
      primero?.focus();
      return;
    }
    mostrarErrores({});

    let cambios: { nombre?: string; id_pais?: string } = {};
    if (editar && original) {
      if (resultado.data.nombre !== original.nombre) cambios.nombre = resultado.data.nombre;
      if (resultado.data.id_pais !== original.id_pais) cambios.id_pais = resultado.data.id_pais;
      if (Object.keys(cambios).length === 0) {
        errorGeneral('No hay cambios para guardar.');
        return;
      }
    }

    bloquear(true);
    try {
      if (editar && original) {
        await cliente.actualizar(idUsuario, original.version, cambios);
      } else {
        await cliente.crear(resultado.data as Parameters<ClienteCoordinadores['crear']>[0]);
      }
      window.location.assign(`/administracion/coordinadores?resultado=${editar ? 'actualizado' : 'creado'}`);
    } catch (error) {
      bloquear(false);
      const porCampo: ErroresFormulario = {};
      if (error instanceof ApiError && error.fields) {
        for (const campo of campos) {
          const mensaje = error.fields[campo]?.[0];
          if (typeof mensaje === 'string') porCampo[campo] = mensaje;
        }
      }
      const primero = mostrarErrores(porCampo);
      errorGeneral(Object.keys(porCampo).length > 0
        ? 'Revisa los campos marcados.'
        : mensajeErrorCoordinadores(error, editar ? 'guardar los cambios' : 'crear la cuenta'));
      primero?.focus();
    }
  });

  q('reintentar').addEventListener('click', () => void cargar());
  void cargar();
}
