import { z } from 'zod';
import { getSupabaseClient } from '../supabase.ts';
import { ApiError, createApiTransport } from '../api/transporte.ts';

const solicitudSchema = z.object({
  id_solicitud: z.uuid(), nombre_solicitante: z.string(), correo: z.email(), telefono: z.string().nullable(),
  mensaje: z.string().nullable(), estado: z.enum(['solicitada', 'en_gestion', 'cotizada', 'cerrada', 'rechazada']),
  created_at: z.string(), updated_at: z.string(), version: z.number().int().positive(),
  estados_permitidos:z.array(z.enum(['solicitada','en_gestion','cotizada','cerrada','rechazada'])),
  items: z.array(z.object({ id_producto: z.uuid(), nombre: z.string(), unidad_medida: z.string(), cantidad: z.number(),
    organizacion: z.object({ id_organizacion: z.uuid(), nombre: z.string(), pais: z.object({ id_pais: z.uuid(), nombre: z.string() }) }) })),
});
type Solicitud = z.infer<typeof solicitudSchema>;
const estados: Array<[Solicitud['estado'], string]> = [
  ['solicitada', 'Solicitada'], ['en_gestion', 'En gestión'], ['cotizada', 'Cotizada'], ['cerrada', 'Cerrada'], ['rechazada', 'Rechazada'],
];

export async function iniciarBandejaCotizaciones() {
  const raiz = document.querySelector<HTMLElement>('#bandeja-cotizaciones');
  if (!raiz || raiz.dataset.iniciado) return;
  raiz.dataset.iniciado = 'true';
  const q = <T extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<T>(`#cotizaciones-${id}`)!;
  const http = createApiTransport(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000');
  async function token() {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new ApiError('SESION_REQUERIDA', 'Tu sesión expiró. Vuelve a iniciar sesión.', 401);
    return data.session.access_token;
  }
  async function listar(): Promise<Solicitud[]> {
    const result = await http.request<{ requests: unknown }>('/api/v1/quote-requests', { accessToken: await token() });
    const parsed = z.array(solicitudSchema).safeParse(result.data?.requests);
    if (!parsed.success) throw new ApiError('RESPUESTA_INVALIDA', 'La bandeja recibió datos inválidos.', 502);
    return parsed.data;
  }
  function elemento(tag: string, value: string, className = '') {
    const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
  }
  async function cargar() {
    const lista = q('lista'); const mensaje = q('mensaje'); const error = q('error');
    lista.replaceChildren(); error.hidden = true; mensaje.hidden = false; mensaje.textContent = 'Cargando solicitudes…';
    try {
      const solicitudes = await listar();
      lista.replaceChildren();
      if (!solicitudes.length) { mensaje.textContent = 'No hay solicitudes para las organizaciones de tu cobertura.'; return; }
      mensaje.hidden = true;
      for (const solicitud of solicitudes) {
        const item = document.createElement('li');
        const card = document.createElement('article'); card.className = 'space-y-4 rounded-2xl border border-[#E8E5EF] bg-white p-4 shadow-sm md:p-6';
        const header = document.createElement('div'); header.className = 'flex flex-col justify-between gap-3 sm:flex-row sm:items-start';
        const contacto = document.createElement('div');
        contacto.append(elemento('h2', solicitud.nombre_solicitante, 'text-lg font-bold text-neutral-900'), elemento('a', solicitud.correo, 'break-all text-sm text-primary underline'));
        const fecha = new Date(solicitud.created_at);
        contacto.append(elemento('p', `Recibida: ${Number.isNaN(fecha.valueOf()) ? solicitud.created_at : fecha.toLocaleString('es-CL')}`, 'mt-1 text-sm text-neutral-500'));
        header.append(contacto, elemento('span', estados.find(([key]) => key === solicitud.estado)?.[1] ?? solicitud.estado, 'inline-flex min-h-8 items-center rounded-full border border-[#D8D2F0] bg-[#EFEDFA] px-3 py-1 text-sm font-semibold text-[#4C4688]'));
        card.append(header);
        if (solicitud.telefono) card.append(elemento('p', `Teléfono: ${solicitud.telefono}`, 'text-sm text-neutral-700'));
        if (solicitud.mensaje) card.append(elemento('p', solicitud.mensaje, 'whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700'));
        const products = document.createElement('ul'); products.className = 'space-y-2';
        for (const product of solicitud.items) {
          const line = `${product.nombre} · ${product.cantidad} ${product.unidad_medida} · ${product.organizacion.nombre} (${product.organizacion.pais.nombre})`;
          products.append(elemento('li', line, 'break-words rounded-lg border border-neutral-100 p-3 text-sm text-neutral-700'));
        }
        card.append(elemento('h3', 'Productos solicitados', 'font-semibold text-neutral-800'), products);
        if(!solicitud.estados_permitidos.length){
          card.append(elemento('p','Solicitud informativa: el país destinatario no tenía Coordinador al recibirla.','text-sm text-neutral-600'));
          item.append(card);lista.append(item);continue;
        }
        const controls = document.createElement('form'); controls.className = 'flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:items-end';
        const label = elemento('label', 'Estado', 'grid gap-1 text-sm font-semibold text-neutral-700');
        const select = document.createElement('select'); select.className = 'min-h-11 rounded-lg border border-neutral-300 bg-white px-3';
        for (const [value, labelText] of estados) if(value===solicitud.estado||solicitud.estados_permitidos.includes(value))select.add(new Option(labelText, value, false, value === solicitud.estado));
        label.append(select);
        const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Guardar estado';
        save.className = 'min-h-11 rounded-xl bg-[#4C4688] px-4 py-2 font-semibold text-white disabled:opacity-50';
        const feedback = elemento('p', '', 'text-sm'); feedback.setAttribute('aria-live', 'polite');
        controls.append(label, save, feedback);
        controls.addEventListener('submit', async (event) => {
          event.preventDefault(); if (select.value === solicitud.estado) { feedback.textContent = 'El estado no cambió.'; return; }
          save.disabled = true; feedback.textContent = 'Guardando…';
          try {
            await http.request('/api/v1/quote-requests/' + encodeURIComponent(solicitud.id_solicitud) + '/status', {
              method: 'PATCH', body: { version_esperada: solicitud.version, estado: select.value }, accessToken: await token(),
            });
            feedback.textContent = 'Estado actualizado.'; await cargar();
          } catch (cause) {
            feedback.textContent = cause instanceof ApiError ? cause.message : 'No fue posible actualizar el estado.';
            save.disabled = false;
          }
        });
        card.append(controls); item.append(card); lista.append(item);
      }
      mensaje.textContent = `${solicitudes.length} solicitudes.`; mensaje.hidden = false;
    } catch (cause) {
      mensaje.hidden = true; error.textContent = cause instanceof ApiError ? cause.message : 'No fue posible cargar las solicitudes.'; error.hidden = false;
    }
  }
  await cargar();
}
