import { ApiError } from '../api/transporte.ts';
import { getSupabaseClient, getUserRoles } from '../supabase';
import { crearTarjetaRegistro, type AcentoRegistro, type OpcionesRegistro, type TonoInsignia } from '../ui/registro.ts';
import { crearClienteInvitados, type AccionInvitado, type SolicitudInvitado } from './cliente.ts';

const estados = { pendiente: 'Pendiente', aprobado: 'Aprobada', rechazado: 'Rechazada', revocado: 'Revocada' } as const;
const tonos: Record<SolicitudInvitado['estado'], TonoInsignia> = { pendiente: 'amarillo', aprobado: 'verde', rechazado: 'rosado', revocado: 'neutro' };
const acentos: Record<SolicitudInvitado['estado'], AcentoRegistro> = { pendiente: 'amarillo', aprobado: 'verde', rechazado: 'rosado', revocado: 'neutro' };

const confirmaciones: Record<AccionInvitado | 'resend', { titulo: string; texto: (s: SolicitudInvitado) => string }> = {
  approve: { titulo: '¿Aprobar solicitud?', texto: (s) => `Se enviará un enlace de acceso a ${s.nombre} (${s.correo}).` },
  resend: { titulo: '¿Reenviar enlace de acceso?', texto: (s) => `Se enviará un nuevo enlace a ${s.nombre} (${s.correo}).` },
  reject: { titulo: '¿Rechazar solicitud?', texto: (s) => `${s.nombre} (${s.correo}) no podrá ingresar como invitado.` },
  revoke: { titulo: '¿Revocar acceso?', texto: (s) => `${s.nombre} (${s.correo}) dejará de tener acceso como invitado.` },
};
const exitos: Record<AccionInvitado | 'resend', string> = {
  approve: 'Solicitud aprobada correctamente. Se envió el enlace de acceso.',
  resend: 'Enlace de acceso reenviado correctamente.',
  reject: 'Solicitud rechazada correctamente.',
  revoke: 'Acceso revocado correctamente.',
};

function fecha(valor?: string | null) {
  if (!valor) return '';
  const parsed = new Date(valor);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(parsed);
}

interface GrupoInvitado {
  /** Solicitud que representa a la persona: la pendiente más reciente o, si no hay, la última. */
  actual: SolicitudInvitado;
  /** Todas las solicitudes del mismo correo, de la más reciente a la más antigua. */
  todas: SolicitudInvitado[];
}

/** Agrupa las solicitudes por correo para mostrar una sola tarjeta por persona. */
export function agruparPorCorreo(solicitudes: SolicitudInvitado[]): GrupoInvitado[] {
  const grupos = new Map<string, SolicitudInvitado[]>();
  for (const solicitud of solicitudes) {
    const clave = solicitud.correo.trim().toLocaleLowerCase('es');
    grupos.set(clave, [...(grupos.get(clave) ?? []), solicitud]);
  }
  return [...grupos.values()]
    .map((todas) => {
      todas.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { todas, actual: todas.find((s) => s.estado === 'pendiente') ?? todas[0] };
    })
    .sort((a, b) => b.actual.created_at.localeCompare(a.actual.created_at));
}

export async function iniciarSolicitudesInvitado() {
  const raiz = document.querySelector<HTMLElement>('#solicitudes-invitado');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#${id}`)!;
  const dialogo = q<HTMLDialogElement>('invitados-dialogo');
  const dialogoHistorial = q<HTMLDialogElement>('invitados-historial');
  const buscar = q<HTMLInputElement>('buscar-solicitud');
  const filtro = q<HTMLSelectElement>('filtro-estado-solicitud');
  const cliente = crearClienteInvitados(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return data.session.access_token;
  });
  let solicitudes: SolicitudInvitado[] = [];
  let ocupado = false;
  let seleccion: { solicitud: SolicitudInvitado; accion: AccionInvitado; reenvio: boolean } | null = null;

  function mensaje(id: string, texto = '') {
    q(id).textContent = texto; q(id).hidden = !texto;
    if (id === 'invitados-error') q('invitados-error-caja').hidden = !texto;
  }
  function bloquear(valor: boolean) {
    ocupado = valor;
    raiz!.setAttribute('aria-busy', String(valor));
    raiz!.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(e => e.disabled = valor);
  }

  function pedirConfirmacion(solicitud: SolicitudInvitado, accion: AccionInvitado) {
    if (ocupado) return;
    const reenvio = accion === 'approve' && solicitud.estado === 'aprobado';
    const textos = confirmaciones[reenvio ? 'resend' : accion];
    seleccion = { solicitud, accion, reenvio };
    mensaje('invitados-exito'); mensaje('invitados-dialogo-error');
    q('invitados-dialogo-titulo').textContent = textos.titulo;
    q('invitados-dialogo-texto').textContent = textos.texto(solicitud);
    q<HTMLButtonElement>('invitados-confirmar').disabled = false;
    dialogo.showModal();
  }

  function botones(solicitud: SolicitudInvitado): OpcionesRegistro['botones'] {
    const boton = (texto: string, accion: AccionInvitado, variante: 'primario' | 'secundario' | 'peligro') =>
      ({ texto, variante, deshabilitado: ocupado, alPulsar: () => pedirConfirmacion(solicitud, accion) });
    if (solicitud.estado === 'pendiente') return [boton('Rechazar', 'reject', 'secundario'), boton('Aprobar', 'approve', 'primario')];
    if (solicitud.estado === 'aprobado' && !solicitud.utilizado_en) return [boton('Revocar', 'revoke', 'peligro'), boton('Reenviar enlace', 'approve', 'secundario')];
    if (solicitud.estado === 'aprobado') return [boton('Revocar acceso', 'revoke', 'peligro')];
    return [];
  }

  function abrirHistorial(grupo: GrupoInvitado) {
    q('invitados-historial-subtitulo').textContent = `${grupo.actual.nombre} · ${grupo.actual.correo}`;
    const lista = q('invitados-historial-lista'); lista.replaceChildren();
    for (const solicitud of grupo.todas) {
      const item = document.createElement('li');
      item.className = `registro tarjeta-acento acento-${acentos[solicitud.estado]}`;
      const cabecera = document.createElement('div'); cabecera.className = 'registro-cabecera';
      const textos = document.createElement('div'); textos.className = 'min-w-0';
      const cuando = document.createElement('p'); cuando.className = 'registro-contexto'; cuando.textContent = `Recibida el ${fecha(solicitud.created_at)}`;
      const nombre = document.createElement('p'); nombre.className = 'text-sm font-semibold text-neutral-900'; nombre.textContent = solicitud.institucion || 'Institución no informada';
      textos.append(cuando, nombre);
      const estado = document.createElement('span');
      estado.className = `registro-insignia registro-insignia--${tonos[solicitud.estado]}`;
      estado.textContent = estados[solicitud.estado];
      cabecera.append(textos, estado);
      const motivo = document.createElement('p'); motivo.className = 'text-sm text-neutral-600 break-words'; motivo.textContent = solicitud.motivo || 'Motivo no informado';
      item.append(cabecera, motivo);
      lista.append(item);
    }
    dialogoHistorial.showModal();
  }

  function renderizar() {
    const grupos = agruparPorCorreo(solicitudes);
    [grupos.length, grupos.filter(g => g.actual.estado === 'pendiente').length, grupos.filter(g => g.actual.estado === 'aprobado').length]
      .forEach((n, i) => q(`invitados-metrica-${i}`).textContent = String(n));
    const termino = buscar.value.trim().toLocaleLowerCase('es');
    const filas = grupos.filter(g => (!filtro.value || g.actual.estado === filtro.value)
      && g.todas.some(s => [s.nombre, s.correo, s.institucion ?? ''].some(v => v.toLocaleLowerCase('es').includes(termino))));
    q('invitados-conteo').textContent = `${filas.length} de ${grupos.length} solicitantes.`;
    q<HTMLButtonElement>('invitados-limpiar').disabled = ocupado || (!buscar.value && !filtro.value);
    const lista = q('invitados-lista'); lista.replaceChildren();
    mensaje('invitados-vacio', filas.length ? '' : grupos.length ? 'No hay solicitudes que coincidan con los filtros.' : 'Todavía no hay solicitudes recibidas.');
    for (const grupo of filas) {
      const solicitud = grupo.actual;
      const vigencia = solicitud.estado === 'aprobado' && solicitud.expira_en ? `Vigente hasta el ${fecha(solicitud.expira_en)}` : '';
      const veces = grupo.todas.length > 1 ? `${grupo.todas.length} solicitudes` : '';
      lista.append(crearTarjetaRegistro({
        acento: acentos[solicitud.estado],
        contexto: [`Recibida el ${fecha(solicitud.created_at)}`, vigencia, veces].filter(Boolean).join(' · '),
        titulo: solicitud.nombre,
        insignias: [{ texto: estados[solicitud.estado], tono: tonos[solicitud.estado], etiqueta: `Estado: ${estados[solicitud.estado]}` }],
        datos: [['Correo', solicitud.correo], ['Institución', solicitud.institucion || 'No informada'], ['Motivo', solicitud.motivo || 'No informado']],
        botones: botones(solicitud),
        accion: grupo.todas.length > 1
          ? { texto: `Ver historial (${grupo.todas.length})`, etiquetaAccesible: `Ver historial de solicitudes de ${solicitud.nombre}`, alPulsar: () => abrirHistorial(grupo) }
          : undefined,
      }));
    }
  }

  async function cargar() {
    if (ocupado) return;
    bloquear(true); mensaje('invitados-error'); mensaje('invitados-vacio');
    q('invitados-carga').hidden = false;
    q('invitados-lista').replaceChildren();
    try { solicitudes = await cliente.listar(); }
    catch (error) { solicitudes = []; mensaje('invitados-error', error instanceof Error ? error.message : 'No fue posible cargar las solicitudes.'); }
    finally { q('invitados-carga').hidden = true; bloquear(false); }
    if (!q('invitados-error-caja').hidden) { q('invitados-conteo').textContent = ''; return; }
    renderizar();
  }

  q('invitados-confirmar').addEventListener('click', async () => {
    if (ocupado || !seleccion) return;
    const actual = seleccion; bloquear(true); mensaje('invitados-dialogo-error');
    try {
      const resultado = await cliente.resolver(actual.solicitud, actual.accion);
      solicitudes = solicitudes.map(s => s.id_invitado === resultado.id_invitado ? resultado : s);
      dialogo.close(); seleccion = null;
      mensaje('invitados-exito', exitos[actual.reenvio ? 'resend' : actual.accion]);
    } catch (error) {
      mensaje('invitados-dialogo-error', error instanceof Error ? error.message : 'No se pudo confirmar la operación.');
      // Una respuesta incierta o un conflicto exige recargar; no repetir una aprobación.
      if (error instanceof ApiError && (error.status === 409 || error.status >= 500 || error.status === 0)) seleccion = null;
    } finally {
      bloquear(false);
      if (!seleccion) q<HTMLButtonElement>('invitados-confirmar').disabled = true;
      renderizar();
    }
  });
  q('invitados-historial-cerrar').addEventListener('click', () => dialogoHistorial.close());
  q('invitados-cancelar').addEventListener('click', () => { if (!ocupado) { seleccion = null; dialogo.close(); } });
  dialogo.addEventListener('cancel', e => { if (ocupado) e.preventDefault(); else seleccion = null; });
  buscar.addEventListener('input', renderizar);
  filtro.addEventListener('change', renderizar);
  q('invitados-reintentar').addEventListener('click', () => void cargar());
  q('invitados-limpiar').addEventListener('click', () => { buscar.value = ''; filtro.value = ''; renderizar(); });

  bloquear(true);
  try {
    if (!(await getUserRoles()).some(r => r.codigo === 'ADMIN')) throw new Error('Solo el Administrador puede gestionar solicitudes.');
  } catch (error) {
    q('invitados-carga').hidden = true;
    mensaje('invitados-error', error instanceof Error ? error.message : 'No fue posible verificar tus permisos.');
    q('invitados-reintentar').hidden = true;
    return;
  }
  bloquear(false);
  await cargar();
}
