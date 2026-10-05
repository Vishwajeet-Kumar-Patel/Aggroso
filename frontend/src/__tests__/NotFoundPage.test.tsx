import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotFoundPage } from '../pages/NotFoundPage';

describe('NotFoundPage Component', () => {
  it('renders 404 page with title, explanation, and return link', () => {
    render(<NotFoundPage />);
    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/The address you entered does not match any page/i)).toBeInTheDocument();
    const homeLink = screen.getByRole('link', { name: /go to dashboard/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });
});
