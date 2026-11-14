import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuoteEmailWorker } from '../src/infrastructure/quote-email-worker.ts';

test('un fallo al confirmar el envío conserva la reserva y reutiliza la clave al recuperarla', async () => {
  const jobs = ['coordinador', 'solicitante'].map(tipo => ({
    id_notificacion: tipo,
    tipo,
    destinatario: 'qa@example.invalid',
    datos: { nombre: 'QA', id_solicitud: 'referencia', items: [] },
  }));
  const keys: (string | null)[] = [];
  const acknowledgements: unknown[] = [];
  let claims = 0;
  const worker = createQuoteEmailWorker({
    supabaseUrl: 'https://qa.invalid',
    serviceKey: 'sb_secret_qa',
    apiKey: 'qa',
    from: 'qa@example.invalid',
    async fetchImpl(url, init) {
      const path = String(url);
      const headers = new Headers(init?.headers);
      if (path === 'https://api.resend.com/emails') {
        keys.push(headers.get('idempotency-key'));
        return Response.json({ id: 'correo-qa' });
      }
      assert.equal(headers.get('apikey'), 'sb_secret_qa');
      assert.equal(headers.has('authorization'), false);
      const body = JSON.parse(String(init?.body));
      if (path.endsWith('/tomar_notificaciones_email_cotizacion')) {
        assert.equal(body.p_limite, 5);
        return Response.json(++claims === 1 ? jobs : jobs.slice(0, 1));
      }
      assert.ok(path.endsWith('/cerrar_notificacion_email_cotizacion'));
      acknowledgements.push(body);
      return Response.json(null, { status: acknowledgements.length === 1 ? 503 : 200 });
    },
  });

  await worker.drain();
  await worker.drain();

  assert.deepEqual(keys, ['coordinador', 'solicitante', 'coordinador']);
  assert.deepEqual(acknowledgements, keys.map(p_id => ({ p_id, p_error: null })));
});
