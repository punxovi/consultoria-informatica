import { parse } from 'devalue';
import type { RespuestaActionPrograma } from '../../actions/programas/programas.handler';

export interface ErrorCampo { campo: string; mensaje: string }

export class ErrorSolicitudPrograma extends Error {
  readonly codigo: string;
  readonly campos: ErrorCampo[];

  constructor(codigo: string, mensaje: string, campos: ErrorCampo[] = []) {
    super(mensaje);
    this.name = 'ErrorSolicitudPrograma';
    this.codigo = codigo;
    this.campos = campos;
  }
}

/** Conserva los códigos de dominio y los errores Zod, incluidos los de cada línea. */
export async function solicitarPrograma<T>(
  ruta: string,
  entrada: unknown,
  token: string,
  enviar: typeof fetch = fetch,
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await enviar(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(entrada),
    });
  } catch {
    throw new ErrorSolicitudPrograma('CONEXION', 'No se pudo confirmar la operación. Revisa tu conexión y consulta el catálogo antes de volver a guardar.');
  }
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    if (Array.isArray(error?.issues)) {
      throw new ErrorSolicitudPrograma('VALIDACION', 'Revisa los campos indicados antes de guardar.',
        error.issues.map((issue: { path: Array<string | number>; message: string }) => ({
          campo: issue.path.join('.').replace(/^cambios\./, ''), mensaje: issue.message,
        })));
    }
    throw new ErrorSolicitudPrograma(respuesta.status === 401 ? 'SESION' : 'HTTP',
      respuesta.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : 'No se pudo completar la solicitud. Vuelve a intentarlo.');
  }
  let resultado: RespuestaActionPrograma<T>;
  try {
    resultado = parse(await respuesta.text());
    if (!resultado || typeof resultado.ok !== 'boolean') throw new Error();
  } catch {
    throw new ErrorSolicitudPrograma('RESPUESTA_INVALIDA', 'No se pudo confirmar la respuesta. Consulta el catálogo antes de volver a guardar.');
  }
  if (!resultado.ok) throw new ErrorSolicitudPrograma(resultado.codigo, resultado.mensaje);
  return resultado.datos;
}
