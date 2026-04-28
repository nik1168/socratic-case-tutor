import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FileUpload from '../FileUpload'
import * as api from '../../api'

vi.mock('../../api')

describe('FileUpload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the upload button', () => {
    render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    expect(screen.getByRole('button', { name: /choose pdf/i })).toBeInTheDocument()
  })

  it('calls onUpload with fileId and fileName on successful upload', async () => {
    vi.mocked(api.uploadPdf).mockResolvedValue('file-123')
    const onUpload = vi.fn()
    const { container } = render(<FileUpload sessionId="test-session" onUpload={onUpload} />)

    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('file-123', 'case.pdf'))
  })

  it('shows an error message on upload failure', async () => {
    vi.mocked(api.uploadPdf).mockRejectedValue(new Error('Server error'))
    const { container } = render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)

    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() =>
      expect(
        screen.getByText('Upload failed. Check that the backend is running.')
      ).toBeInTheDocument()
    )
  })
})
