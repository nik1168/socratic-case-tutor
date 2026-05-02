import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionProvider from '@/providers/SessionProvider'
import SessionList from '../SessionList'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const sessions = [
  { file_id: 'file-1', file_name: 'airbnb.pdf', last_active_at: '2026-04-27T10:00:00+00:00', message_count: 4 },
  { file_id: 'file-2', file_name: 'stripe.pdf',  last_active_at: '2026-04-26T08:00:00+00:00', message_count: 2 },
]

function renderWithProvider() {
  localStorage.setItem('case_tutor_session_id', 'test-session')
  return render(<SessionProvider><SessionList /></SessionProvider>)
}

describe('SessionList', () => {
  beforeEach(() => { vi.resetAllMocks(); localStorage.clear() })

  it('renders session file names after loading', async () => {
    vi.mocked(api.getSessions).mockResolvedValue(sessions)
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('airbnb.pdf')).toBeInTheDocument())
    expect(screen.getByText('stripe.pdf')).toBeInTheDocument()
  })

  it('renders an empty state when there are no sessions', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([])
    renderWithProvider()
    await waitFor(() => expect(screen.getByText(/no previous sessions/i)).toBeInTheDocument())
  })

  it('navigates to /chat/[fileId] with name param when a session is clicked', async () => {
    vi.mocked(api.getSessions).mockResolvedValue(sessions)
    renderWithProvider()
    await waitFor(() => screen.getByText('airbnb.pdf'))
    fireEvent.click(screen.getByText('airbnb.pdf'))
    expect(mockPush).toHaveBeenCalledWith('/chat/file-1?name=airbnb.pdf')
  })
})
