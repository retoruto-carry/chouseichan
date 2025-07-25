/**
 * ドメイン層エラー型定義
 *
 * ドメイン層のエラー定義
 * Clean Architectureでは、ドメイン層が最も重要な層なので、
 * ドメインエラーは他の層に影響を与えない独立したエラーとして定義
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// スケジュールドメインエラー
export class ScheduleNotFoundError extends DomainError {
  readonly code = 'SCHEDULE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(scheduleId: string) {
    super(`スケジュールが見つかりません: ${scheduleId}`, { scheduleId });
  }
}

export class ScheduleValidationError extends DomainError {
  readonly code = 'SCHEDULE_VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, field?: string) {
    super(message, { field });
  }
}

export class ScheduleAlreadyClosedError extends DomainError {
  readonly code = 'SCHEDULE_ALREADY_CLOSED';
  readonly statusCode = 409;

  constructor(scheduleId: string) {
    super(`Schedule is already closed: ${scheduleId}`, { scheduleId });
  }
}

export class SchedulePermissionError extends DomainError {
  readonly code = 'SCHEDULE_PERMISSION_ERROR';
  readonly statusCode = 403;

  constructor(action: string, userId: string) {
    super(`Permission denied for action: ${action}`, { action, userId });
  }
}

// Response Domain Errors
export class ResponseNotFoundError extends DomainError {
  readonly code = 'RESPONSE_NOT_FOUND';
  readonly statusCode = 404;

  constructor(scheduleId: string, userId: string) {
    super(`Response not found for schedule ${scheduleId} by user ${userId}`, {
      scheduleId,
      userId,
    });
  }
}

export class ResponseValidationError extends DomainError {
  readonly code = 'RESPONSE_VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, field?: string) {
    super(message, { field });
  }
}

export class InvalidResponseStatusError extends DomainError {
  readonly code = 'INVALID_RESPONSE_STATUS';
  readonly statusCode = 400;

  constructor(status: string) {
    super(`Invalid response status: ${status}`, { status });
  }
}

// User Domain Errors
export class UserValidationError extends DomainError {
  readonly code = 'USER_VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, field?: string) {
    super(message, { field });
  }
}

// Date Domain Errors
export class DateValidationError extends DomainError {
  readonly code = 'DATE_VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, datetime?: string) {
    super(message, { datetime });
  }
}

// General Domain Errors
export class DomainRuleViolationError extends DomainError {
  readonly code = 'DOMAIN_RULE_VIOLATION';
  readonly statusCode = 422;

  constructor(rule: string, details?: Record<string, unknown>) {
    super(`Domain rule violation: ${rule}`, details);
  }
}

export class BusinessLogicError extends DomainError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 422;
}

// Error Factory Functions
export function createScheduleNotFoundError(scheduleId: string): ScheduleNotFoundError {
  return new ScheduleNotFoundError(scheduleId);
}

export function createScheduleValidationError(
  message: string,
  field?: string
): ScheduleValidationError {
  return new ScheduleValidationError(message, field);
}

export function createScheduleAlreadyClosedError(scheduleId: string): ScheduleAlreadyClosedError {
  return new ScheduleAlreadyClosedError(scheduleId);
}

export function createSchedulePermissionError(
  action: string,
  userId: string
): SchedulePermissionError {
  return new SchedulePermissionError(action, userId);
}

export function createResponseNotFoundError(
  scheduleId: string,
  userId: string
): ResponseNotFoundError {
  return new ResponseNotFoundError(scheduleId, userId);
}

export function createResponseValidationError(
  message: string,
  field?: string
): ResponseValidationError {
  return new ResponseValidationError(message, field);
}

export function createInvalidResponseStatusError(status: string): InvalidResponseStatusError {
  return new InvalidResponseStatusError(status);
}

export function createUserValidationError(message: string, field?: string): UserValidationError {
  return new UserValidationError(message, field);
}

export function createDateValidationError(message: string, datetime?: string): DateValidationError {
  return new DateValidationError(message, datetime);
}

export function createDomainRuleViolationError(
  rule: string,
  details?: Record<string, unknown>
): DomainRuleViolationError {
  return new DomainRuleViolationError(rule, details);
}

export function createBusinessLogicError(
  message: string,
  details?: Record<string, unknown>
): BusinessLogicError {
  return new BusinessLogicError(message, details);
}

// Type Guards
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function isScheduleError(
  error: unknown
): error is
  | ScheduleNotFoundError
  | ScheduleValidationError
  | ScheduleAlreadyClosedError
  | SchedulePermissionError {
  return (
    error instanceof ScheduleNotFoundError ||
    error instanceof ScheduleValidationError ||
    error instanceof ScheduleAlreadyClosedError ||
    error instanceof SchedulePermissionError
  );
}

export function isResponseError(
  error: unknown
): error is ResponseNotFoundError | ResponseValidationError | InvalidResponseStatusError {
  return (
    error instanceof ResponseNotFoundError ||
    error instanceof ResponseValidationError ||
    error instanceof InvalidResponseStatusError
  );
}

export function isValidationError(
  error: unknown
): error is
  | ScheduleValidationError
  | ResponseValidationError
  | UserValidationError
  | DateValidationError {
  return (
    error instanceof ScheduleValidationError ||
    error instanceof ResponseValidationError ||
    error instanceof UserValidationError ||
    error instanceof DateValidationError
  );
}
