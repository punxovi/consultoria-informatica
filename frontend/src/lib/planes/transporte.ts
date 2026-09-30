import { parse } from 'devalue';

export interface ErrorCampoPlan {
  campo: string;
  mensaje: string;
}

export class ErrorSolicitudPlan extends Error {
  readonly codigo: string;
  readonly campos: ErrorCampoPlan[];

  constructor(codigo: string, mensaje: string, campos: ErrorCampoPlan[] = []) {
    super(mensaje);
    this.name = 'ErrorSolicitudPlan';
    this.codigo = codigo;
    this.campos = campos;
  }
}

interface RespuestaAction<T> {
  ok: boolean;
  codigo: string;
  mensaje: string;
  datos: T | null;
}

/** Ejecuta una Astro Action conservando errores de dominio y validación. */
export async function solicitarPlan<T>(
  ruta: string,
  entrada: unknown,
  token: string,
  enviar: typeof fetch = fetch,
): Promise<T> {
  let respuesta: Response;

  try {
    respuesta = await enviar(ruta, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entrada),
    });
  } catch {
    throw new ErrorSolicitudPlan(
      'CONEXION',
      'No se pudo confirmar la operación. Revisa tu conexión antes de volver a intentarlo.',
    );
  }

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    if (Array.isArray(error?.issues)) {
      throw new ErrorSolicitudPlan(
        'VALIDACION',
        'Revisa los campos indicados antes de guardar.',
        error.issues.map((issue: { path: Array<string | number>; message: string }) => ({
          campo: issue.path.join('.').replace(/^cambios\./, ''),
          mensaje: issue.message,
        })),
      );
    }

    throw new ErrorSolicitudPlan(
      respuesta.status === 401 ? 'SESION' : 'HTTP',
      respuesta.status === 401
        ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
        : 'No se pudo completar la solicitud. Vuelve a intentarlo.',
    );
  }

  let resultado: RespuestaAction<T>;
  try {
    resultado = parse(await respuesta.text()) as RespuestaAction<T>;
    if (!resultado || typeof resultado.ok !== 'boolean') throw new Error();
  } catch {
    throw new ErrorSolicitudPlan(
      'RESPUESTA_INVALIDA',
      'No se pudo interpretar la respuesta del servidor.',
    );
  }

  if (!resultado.ok || resultado.datos === null) {
    throw new ErrorSolicitudPlan(resultado.codigo, resultado.mensaje);
  }

  return resultado.datos;
}
