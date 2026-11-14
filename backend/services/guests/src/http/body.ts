import type { IncomingMessage } from 'node:http';

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
    });
    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('CUERPO_JSON_INVALIDO'));
      }
    });
    request.on('error', (err) => {
      reject(err);
    });
  });
}