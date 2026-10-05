import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailCell } from '../components/EmailCell';

describe('EmailCell Component', () => {
  it('renders valid email as a mailto link', () => {
    render(<EmailCell email="alice@example.com" />);
    const link = screen.getByRole('link', { name: 'alice@example.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'mailto:alice@example.com');
  });

  it('renders malformed email as plain text without link', () => {
    render(<EmailCell email="invalid-email-address" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('invalid-email-address')).toBeInTheDocument();
  });

  it('renders dash when email is null or undefined', () => {
    render(<EmailCell email={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('prevents XSS or javascript: links', () => {
    render(<EmailCell email="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });
});
