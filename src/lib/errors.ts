export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'DATA_ERROR'
  | 'PROVIDER_ERROR'
  | 'INTELLIGENCE_ERROR'
  | 'RISK_ERROR'
  | 'EXECUTION_ERROR'
  | 'INFRASTRUCTURE_ERROR';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly correlationId?: string;
  readonly details: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    correlationId?: string,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}