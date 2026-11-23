type EmailJob = {
  id_notificacion: string;
  tipo: 'coordinador' | 'solicitante';
  destinatario: string;
  datos: {
    coordinador?: string; nombre: string; correo?: string; telefono?: string | null;
    mensaje?: string | null; id_solicitud: string; pais?: string | null;
    items: Array<{ producto: string; cantidad: number; unidad: string; organizacion: string; pais: string }>;
  };
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function render(job: EmailJob) {
  const data = job.datos;
  const products = data.items.map(item => `<li><strong>${escapeHtml(item.producto)}</strong>: ${escapeHtml(item.cantidad)} ${escapeHtml(item.unidad)} — ${escapeHtml(item.organizacion)} (${escapeHtml(item.pais)})</li>`).join('');
  if (job.tipo === 'coordinador') {
    const subject = `Nueva solicitud de cotización · ${data.nombre}`;
    const text = [
      `Hola${data.coordinador ? ` ${data.coordinador}` : ''},`, '',
      `Recibiste una nueva solicitud para ${data.pais ?? 'tu país'}.`, `Referencia: ${data.id_solicitud}`,
      `Solicitante: ${data.nombre}`, `Correo: ${data.correo}`,
      ...(data.telefono ? [`Teléfono: ${data.telefono}`] : []),
      ...(data.mensaje ? [`Mensaje: ${data.mensaje}`] : []), '', 'Productos:',
      ...data.items.map(i => `- ${i.producto}: ${i.cantidad} ${i.unidad} — ${i.organizacion} (${i.pais})`),
    ].join('\n');
    const html = `<p>Hola${data.coordinador ? ` ${escapeHtml(data.coordinador)}` : ''},</p><p>Recibiste una nueva solicitud de cotización para <strong>${escapeHtml(data.pais ?? 'tu país')}</strong>.</p><p><strong>Referencia:</strong> ${escapeHtml(data.id_solicitud)}<br><strong>Solicitante:</strong> ${escapeHtml(data.nombre)}<br><strong>Correo:</strong> ${escapeHtml(data.correo)}${data.telefono ? `<br><strong>Teléfono:</strong> ${escapeHtml(data.telefono)}` : ''}${data.mensaje ? `<br><strong>Mensaje:</strong> ${escapeHtml(data.mensaje)}` : ''}</p><p>Productos solicitados:</p><ul>${products}</ul>`;
    return { subject, text, html };
  }
  const subject = 'Recibimos tu solicitud de cotización';
  const text = [`Hola ${data.nombre},`, '', 'Confirmamos que recibimos tu solicitud de cotización. El equipo revisará los productos y se pondrá en contacto contigo.', `Referencia: ${data.id_solicitud}`, `País: ${data.pais ?? 'No especificado'}`, '', 'Productos:', ...data.items.map(i => `- ${i.producto}: ${i.cantidad} ${i.unidad} — ${i.organizacion} (${i.pais})`), '', 'Este correo confirma la recepción; no representa una cotización ni reserva de productos.'].join('\n');
  const html = `<p>Hola ${escapeHtml(data.nombre)},</p><p>Confirmamos que recibimos tu solicitud de cotización. El equipo revisará los productos y se pondrá en contacto contigo.</p><p><strong>Referencia:</strong> ${escapeHtml(data.id_solicitud)}<br><strong>País:</strong> ${escapeHtml(data.pais ?? 'No especificado')}</p><p>Productos:</p><ul>${products}</ul><p>Este correo confirma la recepción; no representa una cotización ni reserva de productos.</p>`;
  return { subject, text, html };
}

export function createQuoteEmailWorker(options: {
  supabaseUrl: string; serviceKey: string; apiKey: string; from: string; fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  let running = false;

  async function rpc(name: string, body: unknown) {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: {
        apikey: options.serviceKey,
        ...(!options.serviceKey.startsWith('sb_secret_') ? { authorization: `Bearer ${options.serviceKey}` } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Supabase RPC ${name} respondió ${response.status}`);
    if (name === 'cerrar_notificacion_email_cotizacion') return;
    return response.json();
  }

  async function send(job: EmailJob) {
    const message = render(job);
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json', 'idempotency-key': job.id_notificacion },
      body: JSON.stringify({ from: options.from, to: [job.destinatario], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error(`Proveedor de correo respondió ${response.status}.`);
    }
  }

  return {
    async drain() {
      if (running) return;
      running = true;
      try {
        const jobs: unknown = await rpc('tomar_notificaciones_email_cotizacion', { p_limite: 5 });
        if (!Array.isArray(jobs)) throw new Error('El servicio devolvió una cola de correos inválida.');
        for (const job of jobs as EmailJob[]) {
          let detail: string | null = null;
          try {
            await send(job);
          } catch (error) {
            detail = error instanceof Error ? error.message : 'Error de envío desconocido.';
            console.error(JSON.stringify({ level: 'error', event: 'quote.email.failed', id: job.id_notificacion, error: detail }));
          }
          try {
            await rpc('cerrar_notificacion_email_cotizacion', { p_id: job.id_notificacion, p_error: detail });
          } catch {
            console.error(JSON.stringify({ level: 'error', event: 'quote.email.ack_failed', id: job.id_notificacion }));
          }
        }
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', event: 'quote.email.queue_unavailable', error: error instanceof Error ? error.message : 'unknown' }));
      } finally { running = false; }
    },
  };
}
