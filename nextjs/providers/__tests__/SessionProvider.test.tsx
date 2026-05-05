import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import SessionProvider, { useSessionId } from '../SessionProvider'

function TestConsumer() {
  const sessionId = useSessionId()
  return <div data-testid="sid">{sessionId}</div>
}

describe('SessionProvider', () => {
  beforeEach(() => localStorage.clear())

  it('reads an existing sessionId from localStorage', async () => {
    localStorage.setItem('case_tutor_session_id', 'existing-abc')
    render(<SessionProvider><TestConsumer /></SessionProvider>)
    await waitFor(() =>
      expect(screen.getByTestId('sid').textContent).toBe('existing-abc')
    )
  })

  it('generates and persists a new sessionId when none exists', async () => {
    render(<SessionProvider><TestConsumer /></SessionProvider>)
    await waitFor(() => {
      const sid = screen.getByTestId('sid').textContent
      expect(sid).toBeTruthy()
      expect(localStorage.getItem('case_tutor_session_id')).toBe(sid)
    })
  })
})
