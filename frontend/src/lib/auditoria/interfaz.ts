import { getSupabaseClient, getUserRoles } from '../supabase';
import { ApiError } from '../api/transporte.ts';
import { crearClienteAuditoria, mensajeError } from './cliente.ts';
import { filtrosSchema, vacios, type Filtros, type Evento } from './modelo.ts';

export async function iniciarAuditoria() {
  const raiz = document.querySelector<HTMLElement>('#auditoria');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#audit-${id}`)!;
  const form = q<HTMLFormElement>('form');
  const campos = Object.keys(vacios) as (keyof Filtros)[];
  const etiquetas: Record<keyof Filtros, string> = { usuario: 'Usuario', pais: 'País', desde: 'Desde', hasta: 'Hasta', operacion: 'Operación', entidad: 'Entidad' };
  let filtros = { ...vacios };
  let curso = false;
  let numero = 0;
  let cursores: (string | undefined)[] = [undefined];
  let siguiente: string | null = null;
  let objetivo = 0;
  let autorizado = false;
  const cliente = crearClienteAuditoria(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Sesión requerida.', 401);
    return data.session.access_token;
  });
  function controles() {
    q<HTMLButtonElement>('aplicar').disabled = curso || !autorizado;
    q<HTMLButtonElement>('limpiar').disabled = curso || !autorizado;
    q<HTMLButtonElement>('anterior').disabled = curso || numero === 0;
    q<HTMLButtonElement>('siguiente').disabled = curso || !siguiente;
    q<HTMLButtonElement>('reintentar').disabled = curso || !autorizado;
    for (const campo of campos) q<HTMLInputElement>(campo).disabled = curso || !autorizado;
    q('resultados').setAttribute('aria-busy', String(curso));
  }
  function errores() {
    for (const campo of campos) {
      q(`error-${campo}`).hidden = true;
      q(campo).removeAttribute('aria-invalid');
    }
  }
  const leer = () => Object.fromEntries(campos.map(campo => [campo, q<HTMLInputElement>(campo).value])) as Filtros;
  function pintar(eventos: Evento[]) {
    const tabla = document.createElement('table');
    tabla.className = 'hidden xl:table w-full table-fixed text-left text-sm';
    const caption = tabla.createCaption(); caption.textContent = 'Historial de eventos de auditoría'; caption.className = 'sr-only';
    const columnas: [keyof Evento, string][] = [['usuario','Usuario'], ['rol','Rol'], ['fecha_hora','Fecha y hora (UTC)'], ['pais','País'], ['ip','IP'], ['operacion','Operación'], ['entidad','Entidad'], ['referencia','Registro afectado']];
    const head = tabla.createTHead().insertRow();
    for (const [, titulo] of columnas) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = titulo;
      th.className = 'p-3 bg-primary/5 border-b border-[#DCD8EA] break-words'; head.append(th);
    }
    const body = tabla.createTBody();
    const tarjetas = document.createElement('div'); tarjetas.className = 'grid gap-3 xl:hidden';
    for (const evento of eventos) {
      const fila = body.insertRow();
      const tarjeta = document.createElement('article'); tarjeta.className = 'rounded-xl border border-[#DCD8EA] border-l-4 border-l-primary p-4';
      const titulo = document.createElement('h3'); titulo.className = 'font-semibold text-primary break-words'; titulo.textContent = `${evento.operacion} · ${evento.entidad}`;
      tarjeta.append(titulo);
      const dl = document.createElement('dl'); dl.className = 'mt-3 grid gap-3 sm:grid-cols-2';
      for (const [campo, etiqueta] of columnas) {
        const valor = evento[campo] === null ? 'No disponible' : campo === 'fecha_hora' ? new Date(evento.fecha_hora).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : evento[campo];
        const celda = fila.insertCell(); celda.textContent = valor; celda.className = 'p-3 align-top border-b border-[#EEEAF5] [overflow-wrap:anywhere]';
        const grupo = document.createElement('div'); grupo.className = 'min-w-0';
        const dt = document.createElement('dt'); dt.textContent = etiqueta; dt.className = 'text-xs text-neutral-500';
        const dd = document.createElement('dd'); dd.textContent = valor; dd.className = 'mt-1 text-sm [overflow-wrap:anywhere]';
        grupo.append(dt, dd); dl.append(grupo);
      }
      tarjeta.append(dl); tarjetas.append(tarjeta);
    }
    q('resultados').replaceChildren(tabla, tarjetas);
  }
  async function cargar(pagina = 0) {
    if (curso || !autorizado) return;
    curso = true; objetivo = pagina; controles();
    q('error').hidden = true; q('reintento').hidden = true;
    q('estado').textContent = 'Consultando historial…';
    q('resultados').replaceChildren(); q('pagina').textContent = '';
    q('criterios').textContent = `Filtros aplicados: ${campos.filter(c => filtros[c]).map(c => `${etiquetas[c]}: ${filtros[c]}`).join(' · ') || 'Todos los eventos'}`;
    try {
      const respuesta = await cliente.consultar(filtros, cursores[pagina]);
      numero = pagina; siguiente = respuesta.nextCursor;
      pintar(respuesta.events);
      q('estado').textContent = respuesta.events.length ? `${respuesta.events.length} eventos en esta página.` : 'No hay eventos para los criterios aplicados.';
      q('pagina').textContent = `Página ${numero + 1}`;
    } catch (error) {
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
    } finally { curso = false; controles(); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); if (curso || !autorizado) return;
    errores();
    const resultado = filtrosSchema.safeParse(leer());
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0]);
        q(`error-${campo}`).textContent = issue.message; q(`error-${campo}`).hidden = false;
        q(campo).setAttribute('aria-invalid', 'true');
      }
      q(String(resultado.error.issues[0].path[0])).focus(); return;
    }
    filtros = resultado.data; cursores = [undefined]; numero = 0; siguiente = null;
    q('pendientes').hidden = true; void cargar();
  });
  form.addEventListener('input', () => {
    q('pendientes').hidden = campos.every(c => leer()[c].trim() === filtros[c]);
  });
  q('limpiar').addEventListener('click', () => {
    if (curso || !autorizado) return;
    form.reset(); errores(); filtros = { ...vacios }; cursores = [undefined]; numero = 0; siguiente = null;
    q('pendientes').hidden = true; void cargar();
  });
  q('siguiente').addEventListener('click', () => {
    if (!siguiente || curso) return;
    cursores[numero + 1] = siguiente; void cargar(numero + 1);
  });
  q('anterior').addEventListener('click', () => { if (numero > 0) void cargar(numero - 1); });
  q('reintentar').addEventListener('click', () => void cargar(objetivo));
  controles();
  try {
    autorizado = (await getUserRoles()).some(rol => rol.codigo === 'ADMIN');
    if (!autorizado) return;
    await cargar();
  } catch {
    q('error').textContent = 'No se pudo verificar el acceso. Recarga la página para volver a intentarlo.';
    q('error').hidden = false;
  }
}
