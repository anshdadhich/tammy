const EMAIL_RE = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/g;

export function redactPii(s: string): string {
  return s.replace(EMAIL_RE, "[redacted-email]");
}
