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
