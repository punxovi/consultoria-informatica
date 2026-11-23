import { getSupabaseClient, getUserRoles } from '../supabase';
import { ApiError } from '../api/transporte.ts';
import { crearClienteAuditoria, mensajeError } from './cliente.ts';
import { filtrosSchema, vacios, type Filtros, type Evento } from './modelo.ts';
import { describirEvento, opcionesAccion, opcionesSeccion, type Tono } from './presentacion.ts';
import { clientePaisesNavegador } from '../paises/cliente.ts';

const tonos: Record<Tono, { insignia: string; acento: string }> = {
  crear: { insignia: 'verde', acento: 'verde' },
  modificar: { insignia: 'morado', acento: 'celeste' },
  eliminar: { insignia: 'rosado', acento: 'rosado' },
  restaurar: { insignia: 'morado', acento: 'morado' },
  sesion: { insignia: 'morado', acento: 'morado' },
  alerta: { insignia: 'amarillo', acento: 'amarillo' },
  consulta: { insignia: 'neutro', acento: 'neutro' },
};
const textoOpcion = new Map<string, string>([...opcionesAccion, ...opcionesSeccion]);

export async function iniciarAuditoria() {
  const raiz = document.querySelector<HTMLElement>('#auditoria');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#audit-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const campos = Object.keys(vacios) as (keyof Filtros)[];
  const etiquetas: Record<keyof Filtros, string> = { usuario: 'Persona', pais: 'País', desde: 'Desde', hasta: 'Hasta', operacion: 'Qué hizo', entidad: 'Sección' };
  let filtros = { ...vacios };
  let curso = false;
  let numero = 0;
  let cursores: (string | undefined)[] = [undefined];
  let siguiente: string | null = null;
  let objetivo = 0;
  let autorizado = false;
  let revision = 0;
  let repetir = false;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const cliente = crearClienteAuditoria(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Sesión requerida.', 401);
    return data.session.access_token;
  });
  function controles() {
    q<HTMLButtonElement>('limpiar').disabled = !autorizado || campos.every(c => !q<HTMLInputElement | HTMLSelectElement>(c).value);
    q<HTMLButtonElement>('anterior').disabled = curso || numero === 0;
    q<HTMLButtonElement>('siguiente').disabled = curso || !siguiente;
    q<HTMLButtonElement>('reintentar').disabled = curso || !autorizado;
    for (const campo of campos) q<HTMLInputElement | HTMLSelectElement>(campo).disabled = !autorizado;
    q('resultados').setAttribute('aria-busy', String(curso));
  }
  function errores() {
    for (const campo of campos) {
      q(`error-${campo}`).hidden = true;
      q(campo).removeAttribute('aria-invalid');
    }
  }
  const leer = () => Object.fromEntries(campos.map(campo => [campo, q<HTMLInputElement | HTMLSelectElement>(campo).value])) as Filtros;
  const crear = (tag: string, texto = '', clase = '') => { const n = document.createElement(tag); n.textContent = texto; n.className = clase; return n; };
  function dato(etiqueta: string, valor: string, extra?: string) {
    const grupo = crear('div', '', 'min-w-0');
    const dd = crear('dd', valor);
    if (extra) dd.append(crear('span', extra, 'block text-xs font-normal text-neutral-500'));
    grupo.append(crear('dt', etiqueta), dd);
    return grupo;
  }
  function paisEvento(evento: Evento): string {
    if (evento.pais) return evento.pais;
    if (evento.rol?.toUpperCase() === 'ADMIN') return 'Regional';
    return 'Sin país asociado';
  }
  function pintar(eventos: Evento[]) {
    const tarjetas = eventos.map(evento => {
      const legible = describirEvento(evento);
      const tono = tonos[legible.tono];
      const tarjeta = crear('article', '', `registro tarjeta-acento acento-${tono.acento}`);
      const cabecera = crear('div', '', 'registro-cabecera');
      const textos = crear('div', '', 'min-w-0');
      const fecha = legible.fecha.charAt(0).toUpperCase() + legible.fecha.slice(1);
      textos.append(crear('p', `${fecha} · ${legible.hora} h`, 'registro-contexto'), crear('h3', legible.descripcion, 'registro-titulo'));
      const insignias = crear('div', '', 'registro-insignias');
      insignias.append(crear('span', legible.accion, `registro-insignia registro-insignia--${tono.insignia}`));
      cabecera.append(textos, insignias);
      const datos = crear('dl', '', 'registro-datos');
      datos.append(dato('Persona', legible.persona, legible.detallePersona || undefined), dato('País', paisEvento(evento)));
      tarjeta.append(cabecera, datos);
      return tarjeta;
    });
    q('resultados').replaceChildren(...tarjetas);
  }
  async function cargar(pagina = 0) {
    if (curso || !autorizado) return;
    const revisionConsulta = revision;
    curso = true; objetivo = pagina; controles();
    q('error').hidden = true; q('reintento').hidden = true;
    q('estado').textContent = 'Consultando historial…';
    q('resultados').replaceChildren(); q('pagina').textContent = '';
    q('criterios').textContent = `Filtros aplicados: ${campos.filter(c => filtros[c]).map(c => `${etiquetas[c]}: ${textoOpcion.get(filtros[c]) ?? filtros[c]}`).join(' · ') || 'Todos los eventos'}`;
    try {
      const respuesta = await cliente.consultar(filtros, cursores[pagina]);
      if (!autorizado || revisionConsulta !== revision) return;
      numero = pagina; siguiente = respuesta.nextCursor;
      pintar(respuesta.events);
      q('estado').textContent = respuesta.events.length ? `${respuesta.events.length} ${respuesta.events.length === 1 ? 'cambio' : 'cambios'} en esta página.` : 'No hay eventos para los criterios aplicados.';
      q('pagina').textContent = `Página ${numero + 1}`;
    } catch (error) {
      if (!autorizado || revisionConsulta !== revision) return;
      siguiente = null;
      q('estado').textContent = '';
      q('error').textContent = mensajeError(error); q('error').hidden = false; q('reintento').hidden = false;
      if (error instanceof ApiError && error.fields) {
        for (const campo of campos) {
          const mensajes = error.fields[campo];
          if (!mensajes?.length) continue;
          q(`error-${campo}`).textContent = mensajes.join(' '); q(`error-${campo}`).hidden = false;
          q(campo).setAttribute('aria-invalid', 'true');
        }
      }
    } finally {
      curso = false; controles();
      if (repetir && autorizado) { repetir = false; void cargar(0); }
    }
  }
  function aplicar() {
    if (!autorizado) return;
    errores();
    const resultado = filtrosSchema.safeParse(leer());
    const cambioValido = resultado.success && campos.some(c => resultado.data[c] !== filtros[c]);
    if (!resultado.success || cambioValido) {
      revision++;
      q('resultados').replaceChildren(); q('pagina').textContent = '';
      q('estado').textContent = ''; q('criterios').textContent = '';
      siguiente = null; numero = 0; cursores = [undefined];
    }
    if (!resultado.success) {
      repetir = false;
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0]);
        q(`error-${campo}`).textContent = issue.message; q(`error-${campo}`).hidden = false;
        q(campo).setAttribute('aria-invalid', 'true');
      }
      return;
    }
    if (!cambioValido) return;
    filtros = resultado.data; cursores = [undefined]; numero = 0; siguiente = null;
    if (curso) { repetir = true; return; }
    repetir = false;
    void cargar();
  }
  form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(espera); aplicar(); });
  form.addEventListener('change', () => { clearTimeout(espera); controles(); aplicar(); });
  q('usuario').addEventListener('input', () => { controles(); clearTimeout(espera); espera = setTimeout(aplicar, 500); });
  q('limpiar').addEventListener('click', () => {
    if (!autorizado) return;
    clearTimeout(espera); form.reset(); controles(); aplicar();
  });
  q('siguiente').addEventListener('click', () => {
    if (!siguiente || curso) return;
    cursores[numero + 1] = siguiente; void cargar(numero + 1);
  });
  q('anterior').addEventListener('click', () => { if (numero > 0) void cargar(numero - 1); });
  q('reintentar').addEventListener('click', () => void cargar(objetivo));
  function retirarHistorialPorSesionPerdida() {
    autorizado = false; revision++; repetir = false; siguiente = null;
    q('resultados').replaceChildren(); q('pagina').textContent = '';
    q('criterios').textContent = ''; q('estado').textContent = 'Tu sesión expiró. Vuelve a iniciar sesión.';
    q('error').hidden = true; q('reintento').hidden = true; controles();
  }
  window.addEventListener('fge:sesion-perdida', retirarHistorialPorSesionPerdida);
  async function cargarPaises() {
    try {
      const paises = await clientePaisesNavegador().listar();
      const selector = q<HTMLSelectElement>('pais');
      for (const pais of [...paises].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) selector.add(new Option(pais.nombre, pais.nombre));
    } catch {}
  }
  controles();
  getSupabaseClient().auth.onAuthStateChange((evento, sesion) => {
    if (sesion || evento !== 'SIGNED_OUT') return;
    retirarHistorialPorSesionPerdida();
  });
  try {
    autorizado = (await getUserRoles()).some(rol => rol.codigo === 'ADMIN');
    if (!autorizado) return;
    await Promise.all([cargarPaises(), cargar()]);
  } catch {
    q('error').textContent = 'No se pudo verificar el acceso. Recarga la página para volver a intentarlo.';
    q('error').hidden = false;
  }
}
