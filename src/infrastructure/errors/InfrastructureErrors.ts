/**
 * インフラストラクチャ層エラー型定義
 *
 * インフラストラクチャ層のエラー定義
 * 外部依存関係（データベース、API、ファイルシステムなど）のエラーを管理
 */

export abstract class InfrastructureError extends Error {
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

// データベースエラー
export class DatabaseConnectionError extends InfrastructureError {
  readonly code = 'DATABASE_CONNECTION_ERROR';
  readonly statusCode = 503;

  constructor(database: string, cause?: Error) {
    super(`データベースへの接続に失敗しました: ${database}`, { database, cause: cause?.message });
  }
}

export class DatabaseQueryError extends InfrastructureError {
  readonly code = 'DATABASE_QUERY_ERROR';
  readonly statusCode = 500;

  constructor(query: string, cause?: Error) {
    super(`データベースクエリが失敗しました: ${query}`, { query, cause: cause?.message });
  }
}

export class DatabaseTransactionError extends InfrastructureError {
  readonly code = 'DATABASE_TRANSACTION_ERROR';
  readonly statusCode = 500;

  constructor(operation: string, cause?: Error) {
    super(`データベーストランザクションが失敗しました: ${operation}`, {
      operation,
      cause: cause?.message,
    });
  }
}

export class DatabaseConstraintError extends InfrastructureError {
  readonly code = 'DATABASE_CONSTRAINT_ERROR';
  readonly statusCode = 409;

  constructor(constraint: string, table?: string) {
    super(`データベース制約違反: ${constraint}`, { constraint, table });
  }
}

// HTTP/APIエラー
export class HttpRequestError extends InfrastructureError {
  readonly code = 'HTTP_REQUEST_ERROR';
  readonly statusCode: number;

  constructor(url: string, status: number, statusText?: string) {
    super(`HTTPリクエストが失敗しました: ${status} ${statusText || ''} for ${url}`, {
      url,
      status,
      statusText,
    });
    this.statusCode = status;
  }
}

export class ApiResponseError extends InfrastructureError {
  readonly code = 'API_RESPONSE_ERROR';
  readonly statusCode = 502;

  constructor(api: string, message: string, status?: number) {
    super(`${api} からのAPIレスポンスエラー: ${message}`, { api, status });
  }
}

export class AuthenticationError extends InfrastructureError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(service: string, reason?: string) {
    super(`${service} の認証に失敗しました`, { service, reason });
  }
}

export class AuthorizationError extends InfrastructureError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;

  constructor(service: string, action: string) {
    super(`${service} での ${action} 操作の認可に失敗しました`, { service, action });
  }
}

// ストレージエラー
export class FileNotFoundError extends InfrastructureError {
  readonly code = 'FILE_NOT_FOUND_ERROR';
  readonly statusCode = 404;

  constructor(path: string) {
    super(`ファイルが見つかりません: ${path}`, { path });
  }
}

export class FileAccessError extends InfrastructureError {
  readonly code = 'FILE_ACCESS_ERROR';
  readonly statusCode = 403;

  constructor(path: string, operation: string) {
    super(`ファイルアクセスが拒否されました: ${path} での ${operation}`, { path, operation });
  }
}

export class StorageError extends InfrastructureError {
  readonly code = 'STORAGE_ERROR';
  readonly statusCode = 500;

  constructor(operation: string, cause?: Error) {
    super(`ストレージ操作が失敗しました: ${operation}`, { operation, cause: cause?.message });
  }
}

// ネットワークエラー
export class NetworkError extends InfrastructureError {
  readonly code = 'NETWORK_ERROR';
  readonly statusCode = 503;

  constructor(operation: string, cause?: Error) {
    super(`${operation} 中にネットワークエラーが発生しました`, {
      operation,
      cause: cause?.message,
    });
  }
}

export class ConnectivityError extends InfrastructureError {
  readonly code = 'CONNECTIVITY_ERROR';
  readonly statusCode = 503;

  constructor(service: string, endpoint?: string) {
    super(`${service} への接続エラー`, { service, endpoint });
  }
}

// キャッシュエラー
export class CacheError extends InfrastructureError {
  readonly code = 'CACHE_ERROR';
  readonly statusCode = 500;

  constructor(operation: string, key?: string, cause?: Error) {
    super(`キャッシュ操作が失敗しました: ${operation}`, { operation, key, cause: cause?.message });
  }
}

// Discord固有エラー
export class DiscordApiError extends InfrastructureError {
  readonly code = 'DISCORD_API_ERROR';
  readonly statusCode: number;

  constructor(endpoint: string, status: number, message?: string) {
    super(`Discord APIエラー: ${endpoint} で ${status}`, {
      endpoint,
      status,
      discordMessage: message,
    });
    this.statusCode = status >= 400 && status < 500 ? status : 502;
  }
}

export class DiscordRateLimitError extends InfrastructureError {
  readonly code = 'DISCORD_RATE_LIMIT_ERROR';
  readonly statusCode = 429;

  constructor(endpoint: string, retryAfter: number) {
    super(`${endpoint} でDiscordレート制限を超過しました`, { endpoint, retryAfter });
  }
}

export class DiscordWebhookError extends InfrastructureError {
  readonly code = 'DISCORD_WEBHOOK_ERROR';
  readonly statusCode = 502;

  constructor(webhookId: string, cause?: Error) {
    super(`Discord Webhookエラー: ${webhookId}`, { webhookId, cause: cause?.message });
  }
}

// 設定/環境エラー
export class EnvironmentError extends InfrastructureError {
  readonly code = 'ENVIRONMENT_ERROR';
  readonly statusCode = 500;

  constructor(variable: string, expected?: string) {
    super(`環境変数エラー: ${variable}`, { variable, expected });
  }
}

export class ServiceUnavailableError extends InfrastructureError {
  readonly code = 'SERVICE_UNAVAILABLE_ERROR';
  readonly statusCode = 503;

  constructor(service: string, reason?: string) {
    super(`サービスが利用できません: ${service}`, { service, reason });
  }
}

// エラーファクトリ関数
export function createDatabaseConnectionError(
  database: string,
  cause?: Error
): DatabaseConnectionError {
  return new DatabaseConnectionError(database, cause);
}

export function createDatabaseQueryError(query: string, cause?: Error): DatabaseQueryError {
  return new DatabaseQueryError(query, cause);
}

export function createDatabaseTransactionError(
  operation: string,
  cause?: Error
): DatabaseTransactionError {
  return new DatabaseTransactionError(operation, cause);
}

export function createDatabaseConstraintError(
  constraint: string,
  table?: string
): DatabaseConstraintError {
  return new DatabaseConstraintError(constraint, table);
}

export function createHttpRequestError(
  url: string,
  status: number,
  statusText?: string
): HttpRequestError {
  return new HttpRequestError(url, status, statusText);
}

export function createApiResponseError(
  api: string,
  message: string,
  status?: number
): ApiResponseError {
  return new ApiResponseError(api, message, status);
}

export function createAuthenticationError(service: string, reason?: string): AuthenticationError {
  return new AuthenticationError(service, reason);
}

export function createAuthorizationError(service: string, action: string): AuthorizationError {
  return new AuthorizationError(service, action);
}

export function createDiscordApiError(
  endpoint: string,
  status: number,
  message?: string
): DiscordApiError {
  return new DiscordApiError(endpoint, status, message);
}

export function createDiscordRateLimitError(
  endpoint: string,
  retryAfter: number
): DiscordRateLimitError {
  return new DiscordRateLimitError(endpoint, retryAfter);
}

export function createEnvironmentError(variable: string, expected?: string): EnvironmentError {
  return new EnvironmentError(variable, expected);
}

export function createServiceUnavailableError(
  service: string,
  reason?: string
): ServiceUnavailableError {
  return new ServiceUnavailableError(service, reason);
}

// 型ガード
export function isInfrastructureError(error: unknown): error is InfrastructureError {
  return error instanceof InfrastructureError;
}

export function isDatabaseError(
  error: unknown
): error is
  | DatabaseConnectionError
  | DatabaseQueryError
  | DatabaseTransactionError
  | DatabaseConstraintError {
  return (
    error instanceof DatabaseConnectionError ||
    error instanceof DatabaseQueryError ||
    error instanceof DatabaseTransactionError ||
    error instanceof DatabaseConstraintError
  );
}

export function isHttpError(error: unknown): error is HttpRequestError | ApiResponseError {
  return error instanceof HttpRequestError || error instanceof ApiResponseError;
}

export function isDiscordError(
  error: unknown
): error is DiscordApiError | DiscordRateLimitError | DiscordWebhookError {
  return (
    error instanceof DiscordApiError ||
    error instanceof DiscordRateLimitError ||
    error instanceof DiscordWebhookError
  );
}

export function isRetryableInfrastructureError(error: unknown): boolean {
  return (
    error instanceof NetworkError ||
    error instanceof ConnectivityError ||
    error instanceof ServiceUnavailableError ||
    error instanceof DiscordRateLimitError ||
    (error instanceof HttpRequestError && error.statusCode >= 500)
  );
}
