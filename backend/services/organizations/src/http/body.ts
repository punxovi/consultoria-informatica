import type { IncomingMessage } from 'node:http';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MULTIPART_BYTES = 31 * 1024 * 1024;

async function readBody(request: IncomingMessage, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximum) {
      throw new ServiceError('CUERPO_DEMASIADO_GRANDE', 'La solicitud supera el tamaño permitido.', 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, MAX_BODY_BYTES);
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    throw new ServiceError('JSON_INVALIDO', 'La solicitud debe contener JSON válido.', 400);
  }
}

export async function readMultipartBody(request: IncomingMessage): Promise<FormData> {
  const contentType = Array.isArray(request.headers['content-type'])
    ? request.headers['content-type'][0]
    : request.headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new ServiceError('FORMATO_INVALIDO', 'La solicitud debe usar multipart/form-data.', 415);
  }
  const body = await readBody(request, MAX_MULTIPART_BYTES);
  try {
    return await new Request('http://organizations.local', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    }).formData();
  } catch {
    throw new ServiceError('MULTIPART_INVALIDO', 'No fue posible interpretar el formulario.', 400);
  }
}

export async function readBinaryFile(request: IncomingMessage, expectedSize: number): Promise<Buffer> {
  if (Number(request.headers['content-length']) > expectedSize) {
    throw new ServiceError('ARCHIVO_INVALIDO', 'El tamaño del archivo no coincide con el registro.', 400);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > expectedSize) throw new ServiceError('ARCHIVO_INVALIDO', 'El tamaño del archivo no coincide con el registro.', 400);
    chunks.push(buffer);
  }
  if (size !== expectedSize) throw new ServiceError('ARCHIVO_INVALIDO', 'El tamaño del archivo no coincide con el registro.', 400);
  return Buffer.concat(chunks, size);
}
