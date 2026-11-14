import { ApiError } from '../api/transporte.ts';

const LIMITE_BYTES = 8 * 1024 * 1024;

export function crearDescargaPdfCompromisos(baseUrl: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    async descargar(idOrganizacion: string, idActa?: string): Promise<{ blob: Blob; fileName: string }> {
      const query = idActa ? `?${new URLSearchParams({ id_acta: idActa })}` : '';
      const url = `${base}/api/v1/organizations/${encodeURIComponent(idOrganizacion)}/commitments/pdf${query}`;
      const accessToken = await token();
      let response: Response;
      try {
        response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/pdf' }, cache: 'no-store' });
      } catch {
        throw new ApiError('PDF_DESCARGA_FALLIDA', 'No fue posible descargar el PDF. Revisa tu conexión e inténtalo nuevamente.', 0);
      }
      if (!response.ok) {
        const cuerpo = await response.json().catch(() => null);
        throw new ApiError(cuerpo?.error?.code ?? 'PDF_DESCARGA_FALLIDA',
          cuerpo?.error?.message ?? 'No fue posible generar el PDF de compromisos.', response.status, cuerpo?.error?.requestId);
      }
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') {
        throw new ApiError('RESPUESTA_INVALIDA', 'El servicio no entregó un archivo PDF.', 502);
      }
      let bytes: ArrayBuffer;
      try { bytes = await response.arrayBuffer(); }
      catch { throw new ApiError('PDF_DESCARGA_FALLIDA', 'La descarga del PDF se interrumpió.', 0); }
      const datos = new Uint8Array(bytes), decodificador = new TextDecoder();
      if (datos.length > LIMITE_BYTES || decodificador.decode(datos.subarray(0, 5)) !== '%PDF-'
        || !decodificador.decode(datos.subarray(-64)).includes('%%EOF')) {
        throw new ApiError('RESPUESTA_INVALIDA', 'El PDF recibido está incompleto o no es válido.', 502);
      }
      const nombre = /filename="([^"]+\.pdf)"/i.exec(response.headers.get('content-disposition') ?? '')?.[1];
      return { blob: new Blob([bytes], { type: 'application/pdf' }), fileName: nombre ?? 'compromisos.pdf' };
    },
  };
}

export function guardarArchivo(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url; enlace.download = fileName; enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
