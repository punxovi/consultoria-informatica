import type { IncomingMessage } from 'node:http';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const MAX_BODY_BYTES = 64 * 1024;
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new ServiceError('CUERPO_DEMASIADO_GRANDE', 'La solicitud supera el tamaño permitido.', 413);
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new ServiceError('JSON_INVALIDO', 'La solicitud debe contener JSON válido.', 400); }
}
