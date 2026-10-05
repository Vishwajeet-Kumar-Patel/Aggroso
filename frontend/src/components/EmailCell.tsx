import React from 'react';
import { isValidEmail, buildMailtoHref } from '../utils/email';

interface EmailCellProps {
  email: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders an email address safely:
 * - Valid emails → <a href="mailto:..."> link
 * - Malformed, empty, or hostile strings → plain <span> (no link, no injection)
 */
export const EmailCell: React.FC<EmailCellProps> = ({ email, className = '', style }) => {
  if (!email) {
    return <span className={className} style={style} aria-label="No email">—</span>;
  }

  if (isValidEmail(email)) {
    return (
      <a
        href={buildMailtoHref(email)}
        className={`text-accent underline hover:text-accent-hover ${className}`}
        style={style}
      >
        {email}
      </a>
    );
  }

  // Malformed or hostile — plain text only, explicitly not a link
  return (
    <span
      className={`text-warning ${className}`}
      style={style}
      title="Malformed email — not linked"
      aria-label={`Malformed email: ${email}`}
    >
      {email}
    </span>
  );
};
