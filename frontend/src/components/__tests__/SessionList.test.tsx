import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SessionList from '../SessionList';
import type { SessionItem } from '../../api';

const sessions: SessionItem[] = [
  { file_id: 'file-1', file_name: 'airbnb.pdf', last_active_at: '2026-04-27T10:00:00+00:00', message_count: 4 },
  { file_id: 'file-2', file_name: 'stripe.pdf', last_active_at: '2026-04-26T08:00:00+00:00', message_count: 2 },
];

describe('SessionList', () => {
  it('renders a list of session file names', () => {
    render(<SessionList sessions={sessions} onSelect={vi.fn()} />);
    expect(screen.getByText('airbnb.pdf')).toBeInTheDocument();
    expect(screen.getByText('stripe.pdf')).toBeInTheDocument();
  });

  it('renders an empty state message when sessions is empty', () => {
    render(<SessionList sessions={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no previous sessions/i)).toBeInTheDocument();
  });

  it('calls onSelect with file_id when a session is clicked', () => {
    const onSelect = vi.fn();
    render(<SessionList sessions={sessions} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('airbnb.pdf'));
    expect(onSelect).toHaveBeenCalledWith('file-1');
  });
});
