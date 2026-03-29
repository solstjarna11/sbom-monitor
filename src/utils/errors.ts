export interface AppErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
  exitCode?: number;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;
  public readonly exitCode: number;
  public override readonly cause: unknown;

  public constructor(
    code: string,
    message: string,
    options: AppErrorOptions = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = options.details;
    this.exitCode = options.exitCode ?? 1;
    this.cause = options.cause;
  }
}

export class StorageError extends AppError {
  public constructor(message: string, options: AppErrorOptions = {}) {
    super("STORAGE_ERROR", message, options);
  }
}

export class RepositoryNotFoundError extends AppError {
  public constructor(message: string, options: AppErrorOptions = {}) {
    super("REPOSITORY_NOT_FOUND", message, { ...options, exitCode: 2 });
  }
}

export class ValidationError extends AppError {
  public constructor(message: string, options: AppErrorOptions = {}) {
    super("VALIDATION_ERROR", message, { ...options, exitCode: 2 });
  }
}

export class UnknownCliError extends AppError {
  public constructor(message: string, options: AppErrorOptions = {}) {
    super("UNKNOWN_CLI_ERROR", message, options);
  }
}