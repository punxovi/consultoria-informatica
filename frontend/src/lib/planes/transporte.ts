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
