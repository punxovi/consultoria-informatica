import { iconoSvg } from '../ui/iconos.ts';
import { listarPaisesOrganizaciones } from '../organizaciones/cliente.ts';
import { clienteCoordinadoresNavegador, mensajeErrorCoordinadores, type ClienteCoordinadores } from './cliente.ts';
import {
  filtrarCoordinadores,
  ordenarCoordinadores,
  type Coordinador,
  type FiltroEstado,
  type FiltrosCoordinadores,
} from './modelo.ts';

const mensajesResultado: Record<string, string> = {
  creado: 'Cuenta de Coordinador creada correctamente.',
  actualizado: 'Cuenta de Coordinador actualizada correctamente.',
};

export function iniciarListadoCoordinadores(cliente: ClienteCoordinadores = clienteCoordinadoresNavegador()) {
  const raiz = document.querySelector<HTMLElement>('#coordinadores');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';

  const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`#coord-${id}`)!;
  const lista = q<HTMLUListElement>('lista');
  const dialogo = q<HTMLDialogElement>('dialogo');
  const buscar = q<HTMLInputElement>('buscar');
  const filtroEstado = q<HTMLSelectElement>('filtro-estado');
  const filtroPais = q<HTMLSelectElement>('filtro-pais');

  let coordinadores: Coordinador[] = [];
  let nombresPais = new Map<string, string>();
  let cargado = false;
  let cargando = false;
  let enCurso: string | null = null;
  let pendienteDesactivar: Coordinador | null = null;

  const filtros = (): FiltrosCoordinadores => ({
    texto: buscar.value,
    estado: filtroEstado.value as FiltroEstado,
    idPais: filtroPais.value,
  });
  const hayFiltros = () => {
    const f = filtros();
    return Boolean(f.texto.trim()) || f.estado !== 'todas' || Boolean(f.idPais);
  };
  const nombrePais = (c: Coordinador) => c.pais?.nombre ?? nombresPais.get(c.id_pais) ?? 'País no disponible';

  function confirmar(mensaje: string) {
    const nodo = q('confirmacion');
    nodo.textContent = mensaje;
    nodo.hidden = false;
    nodo.focus();
  }

  function mostrarError(mensaje: string | null) {
    q('error').hidden = !mensaje;
    q('error-texto').textContent = mensaje ?? '';
  }

  function pintarMetricas() {
    const activas = coordinadores.filter((c) => c.activo).length;
    q('total').textContent = cargado ? String(coordinadores.length) : '—';
    q('activas').textContent = cargado ? String(activas) : '—';
    q('inactivas').textContent = cargado ? String(coordinadores.length - activas) : '—';
  }

  function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase = '', texto?: string) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
  }

  function tarjeta(c: Coordinador) {
    const li = crear('li', 'coord-tarjeta flex flex-col gap-4 rounded-2xl border border-[#E8E5EF] tarjeta-acento bg-white p-4 shadow-[0_2px_10px_rgba(47,39,83,0.06)] md:p-5');
    li.classList.add(c.activo ? 'acento-verde' : 'acento-amarillo');
    li.dataset.id = c.id_usuario;

    const cabecera = crear('div', 'flex items-start gap-3');
    const iniciales = c.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
    const avatar = crear('span', 'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F0EDF8] text-sm font-semibold text-[#4C4688]', iniciales || '·');
    avatar.setAttribute('aria-hidden', 'true');
    const textos = crear('div', 'min-w-0 flex-1');
    textos.append(
      crear('h3', 'break-words text-base font-semibold text-neutral-900', c.nombre),
      crear('p', 'mt-0.5 break-all text-sm text-neutral-500', c.correo),
    );
    const estado = crear('span', `coord-estado-badge inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${c.activo ? 'bg-[#E5F6ED] text-[#14784D]' : 'bg-[#FFF3DC] text-[#925500]'}`);
    estado.innerHTML = c.activo
      ? '<svg aria-hidden="true" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4L19 6"/></svg>'
      : '<svg aria-hidden="true" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    estado.append(document.createTextNode(c.activo ? 'Activa' : 'Inactiva'));
    cabecera.append(avatar, textos, estado);

    const datos = crear('dl', 'grid grid-cols-1 gap-3 sm:grid-cols-2');
    for (const [titulo, valor] of [['País principal', nombrePais(c)], ['Estado de acceso', c.activo ? 'Puede iniciar sesión' : 'Acceso bloqueado']]) {
      const caja = crear('div', 'min-w-0 rounded-xl border border-[#E5E0EF] bg-[#F7F5FB] p-3');
      caja.append(crear('dt', 'text-[11px] font-semibold uppercase tracking-wide text-[#77718F]', titulo), crear('dd', 'mt-1 break-words text-sm font-medium text-[#282435]', valor));
      datos.append(caja);
    }

    const acciones = crear('div', 'flex flex-col gap-2 border-t border-[#F0EDF6] pt-3 sm:flex-row sm:justify-end');
    const editar = crear('a', 'inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl border border-[#4C4688] bg-white px-4 text-sm font-semibold text-[#4C4688] transition-colors hover:bg-[#F0EEF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C4688] focus-visible:ring-offset-2', 'Editar');
    editar.href = `/administracion/coordinadores/${encodeURIComponent(c.id_usuario)}/editar`;
    editar.setAttribute('aria-label', `Editar la cuenta de ${c.nombre}`);
    editar.insertAdjacentHTML('afterbegin', iconoSvg('editar'));
    const cambiar = crear('button', `inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${c.activo ? 'border border-[#C81E5B] bg-white text-[#AD174F] hover:bg-[#FCE8F0] focus-visible:ring-[#C81E5B]' : 'border border-[#14784D] bg-white text-[#14784D] hover:bg-[#E5F6ED] focus-visible:ring-[#14784D]'}`) as HTMLButtonElement;
    cambiar.type = 'button';
    cambiar.dataset.accion = c.activo ? 'desactivar' : 'activar';
    cambiar.textContent = enCurso === c.id_usuario ? (c.activo ? 'Desactivando…' : 'Activando…') : (c.activo ? 'Desactivar' : 'Activar');
    cambiar.setAttribute('aria-label', `${c.activo ? 'Desactivar' : 'Activar'} la cuenta de ${c.nombre}`);
    cambiar.disabled = cargando || enCurso !== null;
    cambiar.addEventListener('click', () => (c.activo ? abrirDialogo(c) : void cambiarEstado(c, true)));
    acciones.append(editar, cambiar);

    if (c.cambio_pais_pendiente) {
      const pendiente = crear('p', 'rounded-xl border border-[#E8D8AA] bg-[#FFF9E9] px-3 py-2 text-sm text-[#7A5A00]', 'El país principal cambiará los permisos en el próximo inicio de sesión.');
      pendiente.setAttribute('role', 'status');
      datos.append(pendiente);
    }
    li.append(cabecera, datos, acciones);
    return li;
  }

  function pintar() {
    q<HTMLButtonElement>('reintentar').disabled = cargando || enCurso !== null;
    pintarMetricas();
    q('limpiar').toggleAttribute('disabled', !hayFiltros());
    if (!cargado) return;
    const visibles = ordenarCoordinadores(filtrarCoordinadores(coordinadores, filtros()));
    lista.replaceChildren(...visibles.map(tarjeta));
    q('vacio').hidden = coordinadores.length > 0;
    q('sin-resultados').hidden = coordinadores.length === 0 || visibles.length > 0;
    q('estado').textContent = coordinadores.length === 0
      ? 'No hay cuentas de Coordinadores registradas.'
      : `${visibles.length} de ${coordinadores.length} ${coordinadores.length === 1 ? 'cuenta' : 'cuentas'}.`;
  }

  async function cargarPaises() {
    try {
      const paises = await listarPaisesOrganizaciones();
      nombresPais = new Map(paises.map((p) => [p.id_pais, p.nombre]));
      const seleccionado = filtroPais.value;
      filtroPais.replaceChildren(filtroPais.options[0]);
      for (const p of paises) filtroPais.append(new Option(p.nombre, p.id_pais));
      filtroPais.value = seleccionado;
      filtroPais.disabled = false;
    } catch {
      // Sin catálogo se puede seguir consultando; el país se muestra si viene en la cuenta.
      filtroPais.disabled = true;
    }
    pintar();
  }

  async function cargar() {
    if (cargando || enCurso) return;
    cargando = true;
    mostrarError(null);
    q('carga').hidden = false;
    lista.setAttribute('aria-busy', 'true');
    q<HTMLButtonElement>('reintentar').disabled = true;
    q('estado').textContent = 'Cargando cuentas…';
    pintar();
    try {
      const [cuentas] = await Promise.all([cliente.listar(), cargarPaises()]);
      coordinadores = cuentas;
      cargado = true;
    } catch (error) {
      cargado = false;
      coordinadores = [];
      lista.replaceChildren();
      q('vacio').hidden = true;
      q('sin-resultados').hidden = true;
      q('estado').textContent = 'No fue posible cargar las cuentas.';
      mostrarError(mensajeErrorCoordinadores(error, 'cargar las cuentas de Coordinadores'));
    } finally {
      cargando = false;
      q('carga').hidden = true;
      lista.setAttribute('aria-busy', 'false');
      q<HTMLButtonElement>('reintentar').disabled = false;
      pintar();
    }
  }

  async function cambiarEstado(c: Coordinador, activo: boolean): Promise<boolean> {
    if (enCurso || cargando) return false;
    enCurso = c.id_usuario;
    mostrarError(null);
    pintar();
    try {
      const actualizado = await cliente.cambiarEstado(c.id_usuario, c.version, activo);
      coordinadores = coordinadores.map((item) => (item.id_usuario === actualizado.id_usuario ? actualizado : item));
      enCurso = null;
      pintar();
      confirmar(activo
        ? `La cuenta de ${actualizado.nombre} fue activada y puede volver a iniciar sesión.`
        : `La cuenta de ${actualizado.nombre} fue desactivada. Sus registros se conservan con su autoría.`);
      return true;
    } catch (error) {
      enCurso = null;
      pintar();
      const mensaje = mensajeErrorCoordinadores(error, activo ? 'activar la cuenta' : 'desactivar la cuenta');
      if (dialogo.open) {
        q('dialogo-error').textContent = mensaje;
        q('dialogo-error').hidden = false;
      } else {
        mostrarError(mensaje);
      }
      return false;
    }
  }

  function abrirDialogo(c: Coordinador) {
    if (cargando || enCurso) return;
    pendienteDesactivar = c;
    q('dialogo-descripcion').textContent = `${c.nombre} (${c.correo}) dejará de tener acceso al sistema.`;
    q('dialogo-error').hidden = true;
    q<HTMLButtonElement>('dialogo-confirmar').disabled = false;
    q('dialogo-confirmar').textContent = 'Desactivar cuenta';
    dialogo.showModal();
    q('dialogo-cancelar').focus();
  }

  function cerrarDialogo() {
    pendienteDesactivar = null;
    if (dialogo.open) dialogo.close();
  }

  q('dialogo-cancelar').addEventListener('click', cerrarDialogo);
  dialogo.addEventListener('cancel', () => { pendienteDesactivar = null; });
  q('dialogo-confirmar').addEventListener('click', async () => {
    if (!pendienteDesactivar) return;
    const boton = q<HTMLButtonElement>('dialogo-confirmar');
    boton.disabled = true;
    boton.textContent = 'Desactivando…';
    q<HTMLButtonElement>('dialogo-cancelar').disabled = true;
    const ok = await cambiarEstado(pendienteDesactivar, false);
    q<HTMLButtonElement>('dialogo-cancelar').disabled = false;
    if (ok) {
      cerrarDialogo();
    } else {
      boton.disabled = false;
      boton.textContent = 'Desactivar cuenta';
    }
  });

  for (const control of [buscar, filtroEstado, filtroPais]) control.addEventListener('input', pintar);
  q('limpiar').addEventListener('click', () => {
    buscar.value = '';
    filtroEstado.value = 'todas';
    filtroPais.value = '';
    pintar();
    buscar.focus();
  });
  q('reintentar').addEventListener('click', () => void cargar());

  const resultado = new URLSearchParams(window.location.search).get('resultado');
  if (resultado && mensajesResultado[resultado]) {
    confirmar(mensajesResultado[resultado]);
    const url = new URL(window.location.href);
    url.searchParams.delete('resultado');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  void cargar();
}
