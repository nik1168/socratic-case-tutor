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
      thinkingQuality: 'developing',
      feedback: 'Try connecting this to the competitive landscape.',
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
      thinkingQuality: 'developing',
      feedback: 'Good start.',
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
      .mockResolvedValueOnce({
        response: 'Good question.',
        responseType: 'socratic_response',
        thinkingQuality: 'developing',
        feedback: '',
      })

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

  it('shows thinking quality badge on user message after response', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Good question.',
      responseType: 'socratic_response',
      thinkingQuality: 'insightful',
      feedback: 'Great connection to the competitive landscape.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'What drove their growth?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText(/insightful/i)).toBeInTheDocument()
    )
    expect(screen.getByText('Great connection to the competitive landscape.')).toBeInTheDocument()
  })

  it('shows red badge for shallow thinking quality', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Can you clarify what you mean?',
      responseType: 'clarification',
      thinkingQuality: 'shallow',
      feedback: 'Try going deeper than describing what happened.',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'What is Airbnb?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText(/shallow/i)).toBeInTheDocument()
    )
    expect(screen.getByText('Try going deeper than describing what happened.')).toBeInTheDocument()
  })

  it('shows badge without feedback text when feedback is empty', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Good question.',
      responseType: 'socratic_response',
      thinkingQuality: 'developing',
      feedback: '',
    })
    render(<Chat fileId="file-1" fileName="case.pdf" />)
    await userEvent.type(screen.getByRole('textbox'), 'Tell me about the case')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText(/developing/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(' — ')).not.toBeInTheDocument()
  })
})
