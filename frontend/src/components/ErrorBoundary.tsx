import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console in development; in production a real app would send to an error tracker
    console.error('ErrorBoundary caught:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            maxWidth: '480px',
            margin: '80px auto',
            padding: '24px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-surface)',
          }}
        >
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              marginBottom: '8px',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-muted)',
              marginBottom: '20px',
            }}
          >
            An unexpected error occurred. Reload the page to try again. If the
            problem persists, reset the demo state using the Reset button in the
            navigation.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
