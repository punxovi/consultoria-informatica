import { ApiError, createApiTransport } from '../api/transporte.ts';
import { evidenciaSchema, type Evidencia, type Reserva, type Cambios } from './modelo.ts';

export function crearClienteEvidencias(baseUrl: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(baseUrl, fetchImpl);
  const base = '/api/v1/evidences';
  function comprobar(valor: unknown, accion: string, id?: string): Evidencia {
    const r = evidenciaSchema.safeParse(valor);
    if (!r.success || r.data.id_accion !== accion || (id && r.data.id_evidencia !== id)) throw new ApiError('RESPUESTA_INVALIDA', 'La evidencia recibida no corresponde al registro solicitado.', 502);
    return r.data;
  }
  async function binario(path: string, options: RequestInit) {
    const accessToken = await token();
    let response: Response;
    try { response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, { ...options, headers: { ...options.headers, authorization: `Bearer ${accessToken}` }, cache: 'no-store' }); }
    catch { throw new ApiError('SERVICIO_NO_DISPONIBLE', 'No fue posible conectar con el servicio de archivos. Puedes reintentar.', 0); }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(payload?.error?.code ?? 'ERROR_ARCHIVO', payload?.error?.message ?? 'No fue posible completar la operación del archivo.', response.status);
    }
    return response;
  }
  return {
    enlacePublico(item: Evidencia) {
      return `${baseUrl.replace(/\/$/, '')}/api/v1/public/evidences/${encodeURIComponent(item.id_evidencia)}/file`;
    },
    async listar(accion: string) {
      const r = await http.request<{ evidences: unknown[] }>(`${base}?id_accion=${encodeURIComponent(accion)}`, { accessToken: await token() });
      if (!Array.isArray(r.data?.evidences)) throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el listado de evidencias.', 502);
      return r.data.evidences.map(e => comprobar(e, accion));
    },
    async obtener(accion: string, id: string) {
      const r = await http.request<{ evidence: unknown }>(`${base}/${encodeURIComponent(id)}`, { accessToken: await token() });
      return comprobar(r.data?.evidence, accion, id);
    },
    async reservar(entrada: Reserva) {
      const r = await http.request<{ evidence: unknown }>(base, { method: 'POST', body: entrada, accessToken: await token() });
      return comprobar(r.data?.evidence, entrada.id_accion);
    },
    async subir(item: Evidencia, file: File) {
      const response = await binario(`${base}/${encodeURIComponent(item.id_evidencia)}/file?version_esperada=${item.version}`, {
        method: 'PUT', headers: { 'content-type': item.mime_type }, body: file,
      });
      const r = await response.json().catch(() => null);
      if (!r?.ok) throw new ApiError('RESPUESTA_INVALIDA', 'No se pudo confirmar la carga. Recarga para comprobar su estado.', 502);
      const guardado = comprobar(r.data?.evidence, item.id_accion, item.id_evidencia);
      if (guardado.estado_carga !== 'disponible') throw new ApiError('CARGA_PENDIENTE', 'El archivo aún no está confirmado. Reintenta la carga.', 502);
      return guardado;
    },
    async actualizar(item: Evidencia, cambios: Cambios) {
      const r = await http.request<{ evidence: unknown }>(`${base}/${encodeURIComponent(item.id_evidencia)}`, {
        method: 'PATCH', body: { version_esperada: item.version, cambios }, accessToken: await token(),
      });
      return comprobar(r.data?.evidence, item.id_accion, item.id_evidencia);
    },
    async descargar(item: Evidencia) {
      const r = await binario(`${base}/${encodeURIComponent(item.id_evidencia)}/file`, { method: 'GET' });
      return r.blob();
    },
  };
}
