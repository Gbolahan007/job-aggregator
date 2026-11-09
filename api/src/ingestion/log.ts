import { redact } from "./redact.js";

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, event: string, fields?: Record<string, unknown>) => void;

/**
 * Logs one JSON object per line: readable in the terminal, searchable later.
 * The finished line is redacted, so no field can leak a secret.
 * `write` defaults to the console; tests pass their own to capture lines.
 */
export function createLogger(
  secrets: readonly string[],
  write: (line: string) => void = (line) => console.log(line),
): Logger {
  return (level, event, fields = {}) => {
    const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
    write(redact(line, secrets));
  };
}
