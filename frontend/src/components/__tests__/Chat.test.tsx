import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Chat from '../Chat'
import * as api from '../../api'

vi.mock('../../api')

describe('Chat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the empty state prompt', () => {
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    expect(screen.getByText('Ask your first question about the case')).toBeInTheDocument()
  })

  it('submits a message and displays the assistant reply', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'What do you think drove their growth?',
      responseType: 'socratic_response',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Tell me about Airbnb')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('What do you think drove their growth?')).toBeInTheDocument()
    )
  })

  it('shows a clarification label when responseType is clarification', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Are you asking about the financial side or the operational side?',
      responseType: 'clarification',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Why did it fail?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Clarifying question')).toBeInTheDocument()
    )
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(api.sendMessage).mockRejectedValue(new Error('Network error'))
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Error: could not reach the backend.')).toBeInTheDocument()
    )
  })

  it('filters error messages from conversation history before sending', async () => {
    vi.mocked(api.sendMessage)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ response: 'Good question.', responseType: 'socratic_response' })

    render(<Chat fileId="file-1" fileName="case.pdf" />)

    await userEvent.type(screen.getByRole('textbox'), 'First question')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Error: could not reach the backend.')).toBeInTheDocument()
    )

    await userEvent.type(screen.getByRole('textbox'), 'Second question')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText('Good question.')).toBeInTheDocument())

    const secondCall = vi.mocked(api.sendMessage).mock.calls[1]
    const history = secondCall[2]!
    expect(history).toHaveLength(1)
    expect(history[0].content).toBe('First question')
  })
})
