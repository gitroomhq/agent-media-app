// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Structured JSON logging utility for Supabase Edge Functions (Deno runtime).
 *
 * Emits newline-delimited JSON (NDJSON) to stdout/stderr so that logs are
 * machine-parseable in Supabase Dashboard, Logflare, or any log aggregator.
 *
 * Usage:
 *   import { createLogger } from "../_shared/logger.ts";
 *   const log = createLogger("generate");
 *   log.info("Job submitted", { jobId, userId });
 *   const elapsed = log.startTimer();
 *   // ... work ...
 *   log.info("Provider responded", { durationMs: elapsed() });
 */

// ── Types ──────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  function: string;
  message: string;
  [key: string]: unknown;
}

// ── Severity ordering (for future filtering) ────────────────────────────────

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

// ── Logger Class ────────────────────────────────────────────────────────────

/**
 * Structured logger that emits JSON to console.log (debug/info/warn) or
 * console.error (error/fatal).  Each log line contains the function name,
 * timestamp, severity level, message, and any additional context fields.
 */
export class Logger {
  private readonly functionName: string;
  private readonly context: Record<string, unknown>;

  constructor(functionName: string, context: Record<string, unknown> = {}) {
    this.functionName = functionName;
    this.context = context;
  }

  /**
   * Return a new Logger instance with additional context fields merged in.
   * The original logger is unmodified (immutable pattern).
   *
   * @param ctx - Key-value pairs to include in every subsequent log entry.
   * @returns A new Logger with the merged context.
   *
   * @example
   *   const reqLog = log.withContext({ requestId: crypto.randomUUID() });
   *   reqLog.info("Processing request"); // includes requestId automatically
   */
  withContext(ctx: Record<string, unknown>): Logger {
    return new Logger(this.functionName, { ...this.context, ...ctx });
  }

  // ── Log-level methods ─────────────────────────────────────────────────

  debug(message: string, data?: Record<string, unknown>): void {
    this.emit("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.emit("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.emit("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.emit("error", message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.emit("fatal", message, data);
  }

  // ── Timer utility ─────────────────────────────────────────────────────

  /**
   * Start a high-resolution timer.
   *
   * @returns A function that, when called, returns the elapsed time in
   *          milliseconds since `startTimer()` was invoked.
   *
   * @example
   *   const elapsed = log.startTimer();
   *   await someAsyncWork();
   *   log.info("Work done", { durationMs: elapsed() });
   */
  startTimer(): () => number {
    const start = performance.now();
    return () => Math.round(performance.now() - start);
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private emit(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      function: this.functionName,
      message,
      ...this.context,
      ...data,
    };

    // Enrich error/fatal entries with stack traces when an Error is in data
    if (
      LEVEL_SEVERITY[level] >= LEVEL_SEVERITY.error &&
      data
    ) {
      const errValue = data.error ?? data.err;
      if (errValue instanceof Error) {
        entry.errorName = errValue.name;
        entry.errorMessage = errValue.message;
        if (errValue.stack) {
          entry.errorStack = errValue.stack;
        }
      }
    }

    const line = JSON.stringify(entry);

    // Route error/fatal to stderr, everything else to stdout.
    if (LEVEL_SEVERITY[level] >= LEVEL_SEVERITY.error) {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a structured Logger bound to a specific Edge Function name.
 *
 * @param functionName - The Edge Function identifier (e.g., "generate",
 *   "webhook-provider", "poll-provider").
 * @returns A new Logger instance.
 *
 * @example
 *   const log = createLogger("generate");
 *   log.info("Request received", { model: "seedance2" });
 */
export function createLogger(functionName: string): Logger {
  return new Logger(functionName);
}
