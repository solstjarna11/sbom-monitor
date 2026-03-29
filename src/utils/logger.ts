export type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  public debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {})
    };

    const line = JSON.stringify(payload);

    if (level === "error" || level === "warn") {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }
}

export const logger = new Logger();