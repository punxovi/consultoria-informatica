import { randomUUID } from 'node:crypto';

export function getRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate?.trim() || randomUUID();
}

export function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context }));
}
