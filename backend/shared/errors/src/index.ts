export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: string, message: string, status = 500, cause?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}
