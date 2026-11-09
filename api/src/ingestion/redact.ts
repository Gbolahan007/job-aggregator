export const REDACTED = "[redacted]";

/**
 * Replaces every occurrence of each secret, raw or URL-encoded, with [redacted].
 * It searches for the secret's value instead of parsing the text, so it works the same
 * on a URL path, a query string, an error message or a whole log line.
 */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret === "") continue; // splitting on "" would split every character
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      out = out.split(form).join(REDACTED);
    }
  }
  return out;
}
