import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders a human-readable label for PUBLISHED', () => {
    render(<StatusBadge status="PUBLISHED" />);
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
  });

  it('replaces underscores with spaces for multi-word statuses', () => {
    render(<StatusBadge status="UNDER_REVIEW" />);
    expect(screen.getByText('UNDER REVIEW')).toBeInTheDocument();
  });
});
