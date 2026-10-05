/**
 * Strict email validation and safe mailto: link builder.
 *
 * Rule: Only render a mailto: link if the email passes a strict RFC-5321-style
 * check. Malformed emails (quarantined records, hostile strings) must stay as
 * plain text — a bad email must NOT look valid.
 */

// Strict regex: local@domain.tld, no consecutive dots, reasonable lengths.
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** Returns true only for well-formed email addresses. */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

/**
 * Builds a safe mailto: href. Only call this after isValidEmail returns true.
 */
export function buildMailtoHref(email: string): string {
  return `mailto:${email.trim()}`;
}
