import { getSupabaseClient, getUserRoles } from '../supabase';
import { ApiError } from '../api/transporte.ts';
import { crearClienteAuditoria, mensajeError } from './cliente.ts';
import { filtrosSchema, vacios, type Filtros, type Evento } from './modelo.ts';
import { describirEvento, opcionesAccion, opcionesSeccion, type Tono } from './presentacion.ts';

const tonos: Record<Tono, { insignia: string; borde: string }> = {
  crear: { insignia: 'bg-[#E7F6EF] text-[#137A53]', borde: 'border-l-brand-green' },
  modificar: { insignia: 'bg-[#E7F7FA] text-[#12798A]', borde: 'border-l-brand-cyan' },
  eliminar: { insignia: 'bg-[#FCE8F0] text-[#AD174F]', borde: 'border-l-brand-pink' },
  restaurar: { insignia: 'bg-[#F0EDF8] text-[#4C4688]', borde: 'border-l-primary' },
  sesion: { insignia: 'bg-[#F0EDF8] text-[#4C4688]', borde: 'border-l-primary' },
  alerta: { insignia: 'bg-[#FFF4DB] text-[#8A5A00]', borde: 'border-l-brand-yellow' },
  consulta: { insignia: 'bg-neutral-100 text-neutral-700', borde: 'border-l-neutral-300' },
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
    for (const campo of campos) q<HTMLInputElement | HTMLSelectElement>(campo).disabled = curso || !autorizado;
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
  // Detalle técnico (para soporte): operación, tabla, registro e IP tal como los guarda el sistema.
  function detalles(evento: Evento) {
    const caja = document.createElement('details'); caja.className = 'mt-2 text-xs text-neutral-500';
    const resumen = crear('summary', 'Ver detalles técnicos', 'inline-flex min-h-8 cursor-pointer items-center font-medium text-primary hover:underline');
    const dl = crear('dl', '', 'mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2');
    const pares: [string, string | null][] = [['Operación', evento.operacion], ['Tabla', evento.entidad], ['Registro afectado', evento.referencia], ['IP', evento.ip], ['Usuario', evento.usuario], ['Rol', evento.rol]];
    for (const [etiqueta, valor] of pares) {
      const grupo = crear('div', '', 'min-w-0');
      grupo.append(crear('dt', etiqueta, 'font-medium text-neutral-600'), crear('dd', valor ?? 'No disponible', '[overflow-wrap:anywhere]'));
      dl.append(grupo);
    }
    caja.append(resumen, dl);
    return caja;
  }
  type Legible = ReturnType<typeof describirEvento>;
  function accion(evento: Evento, legible: Legible) {
    const bloque = crear('div', '', 'min-w-0');
    bloque.append(
      crear('span', legible.accion, `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tonos[legible.tono].insignia}`),
      crear('p', legible.descripcion, 'mt-1.5 text-sm leading-relaxed text-neutral-800 [overflow-wrap:anywhere]'),
      detalles(evento),
    );
    return bloque;
  }
  function quien(legible: Legible) {
    const bloque = crear('div', '', 'min-w-0');
    bloque.append(crear('p', legible.persona, 'font-medium text-neutral-900 [overflow-wrap:anywhere]'));
    if (legible.detallePersona) bloque.append(crear('p', legible.detallePersona, 'mt-0.5 text-xs text-neutral-500 [overflow-wrap:anywhere]'));
    return bloque;
  }
  function cuando(legible: Legible) {
    const bloque = crear('div', '', 'min-w-0');
    bloque.append(crear('p', legible.fecha, 'text-sm font-medium text-neutral-800 first-letter:uppercase'), crear('p', `${legible.hora} h`, 'mt-0.5 text-xs text-neutral-500'));
    return bloque;
  }
  function pintar(eventos: Evento[]) {
    const tabla = document.createElement('table');
    tabla.className = 'hidden xl:table w-full table-fixed text-left text-sm';
    const caption = tabla.createCaption(); caption.textContent = 'Historial de cambios'; caption.className = 'sr-only';
    const columnas: [string, string][] = [['Cuándo', 'w-52'], ['Quién', 'w-64'], ['Qué hizo', ''], ['País', 'w-32']];
    const head = tabla.createTHead().insertRow();
    for (const [titulo, ancho] of columnas) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = titulo;
      th.className = `p-3 bg-primary/5 border-b border-[#DCD8EA] font-semibold ${ancho}`; head.append(th);
    }
    const body = tabla.createTBody();
    const tarjetas = crear('div', '', 'grid gap-3 xl:hidden');
    for (const evento of eventos) {
      const legible = describirEvento(evento);
      const fila = body.insertRow();
      for (const contenido of [cuando(legible), quien(legible), accion(evento, legible), crear('span', evento.pais ?? 'No disponible')]) {
        const celda = fila.insertCell(); celda.className = 'p-3 align-top border-b border-[#EEEAF5]'; celda.append(contenido);
      }
      const tarjeta = crear('article', '', `min-w-0 rounded-xl border border-[#DCD8EA] border-l-4 ${tonos[legible.tono].borde} bg-white p-4`);
      const pie = crear('div', '', 'mt-3 grid gap-3 border-t border-[#EEEAF5] pt-3 sm:grid-cols-2');
      const pais = crear('div', '', 'min-w-0');
      pais.append(crear('p', 'País', 'text-xs text-neutral-500'), crear('p', evento.pais ?? 'No disponible', 'text-sm font-medium'));
      pie.append(quien(legible), pais);
      const cuerpo = crear('div', '', 'mt-3');
      cuerpo.append(accion(evento, legible));
      tarjeta.append(cuando(legible), cuerpo, pie);
      tarjetas.append(tarjeta);
    }
    q('resultados').replaceChildren(tabla, tarjetas);
  }
  async function cargar(pagina = 0) {
    if (curso || !autorizado) return;
    curso = true; objetivo = pagina; controles();
    q('error').hidden = true; q('reintento').hidden = true;
    q('referencia').hidden = true;
    q('codigo').textContent = '';
    q('copia-estado').textContent = '';
    q('estado').textContent = 'Consultando historial…';
    q('resultados').replaceChildren(); q('pagina').textContent = '';
    q('criterios').textContent = `Filtros aplicados: ${campos.filter(c => filtros[c]).map(c => `${etiquetas[c]}: ${textoOpcion.get(filtros[c]) ?? filtros[c]}`).join(' · ') || 'Todos los eventos'}`;
    try {
      const respuesta = await cliente.consultar(filtros, cursores[pagina]);
      numero = pagina; siguiente = respuesta.nextCursor;
      pintar(respuesta.events);
      q('estado').textContent = respuesta.events.length ? `${respuesta.events.length} ${respuesta.events.length === 1 ? 'cambio' : 'cambios'} en esta página.` : 'No hay eventos para los criterios aplicados.';
      q('pagina').textContent = `Página ${numero + 1}`;
    } catch (error) {
      siguiente = null;
      q('estado').textContent = '';
      q('error').textContent = mensajeError(error); q('error').hidden = false; q('reintento').hidden = false;
      if (error instanceof ApiError && error.requestId) {
        q('codigo').textContent = error.requestId;
        q('referencia').hidden = false;
      }
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
  q('copiar').addEventListener('click', async () => {
    const codigo = q('codigo').textContent;
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      q('copia-estado').textContent = 'Referencia copiada.';
    } catch {
      q('copia-estado').textContent = 'Selecciona la referencia para copiarla manualmente.';
    }
  });
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
