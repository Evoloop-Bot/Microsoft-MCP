/**
 * Structured logger that writes to stderr so it never pollutes the stdio MCP transport.
 * Tokens, message bodies, and file contents must never appear in default log output.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  tool?: string;
  domain?: string;
  requestId?: string;
  latencyMs?: number;
  retryCount?: number;
  mutating?: boolean;
  message: string;
  error?: string;
}

function emit(entry: LogEntry): void {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

export function logToolCall(opts: {
  tool: string;
  domain: string;
  requestId: string;
  latencyMs: number;
  mutating: boolean;
  retryCount?: number;
}): void {
  emit({
    level: "info",
    message: opts.mutating ? "[MUTATING] tool call completed" : "tool call completed",
    ...opts
  });
}

export function logToolError(opts: {
  tool: string;
  domain: string;
  requestId: string;
  error: string;
}): void {
  emit({ level: "error", message: "tool call failed", ...opts });
}

export function logWarn(message: string, extra?: Record<string, unknown>): void {
  emit({ level: "warn", message, ...(extra ?? {}) });
}

export function logInfo(message: string, extra?: Record<string, unknown>): void {
  emit({ level: "info", message, ...(extra ?? {}) });
}
