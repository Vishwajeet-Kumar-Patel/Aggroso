import React from 'react';
import { usePageTitle } from '../hooks/usePageTitle';

export const NotFoundPage: React.FC = () => {
  usePageTitle('Page Not Found');

  return (
    <>
      <meta name="robots" content="noindex" />
      <div
        style={{
          maxWidth: '480px',
          margin: '80px auto',
          padding: '0 16px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: '12px',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--color-muted)',
            marginBottom: '24px',
            lineHeight: '1.6',
          }}
        >
          The address you entered does not match any page in this workbench.
        </p>
        <a
          href="/"
          className="btn btn-primary"
          style={{ display: 'inline-flex' }}
        >
          Go to dashboard
        </a>
      </div>
    </>
  );
};
