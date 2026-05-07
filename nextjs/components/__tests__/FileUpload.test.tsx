import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FileUpload from '../FileUpload'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

describe('FileUpload', () => {
  beforeEach(() => vi.resetAllMocks())

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
      expect(screen.getByText('Upload failed. Check that the backend is running.')).toBeInTheDocument()
    )
  })

  it('rejects non-PDF files and shows an error without calling the API', async () => {
    const uploadPdfSpy = vi.mocked(api.uploadPdf)
    const { container } = render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file, { applyAccept: false })
    expect(screen.getByText('Please select a PDF file.')).toBeInTheDocument()
    expect(uploadPdfSpy).not.toHaveBeenCalled()
  })

  it('choose pdf button fires stopPropagation on click', () => {
    render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    const button = screen.getByRole('button', { name: /choose pdf/i })
    fireEvent.click(button)
  })

  it('choose pdf button handles mouse enter and leave', () => {
    render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    const button = screen.getByRole('button', { name: /choose pdf/i })
    fireEvent.mouseEnter(button)
    fireEvent.mouseLeave(button)
  })

  it('download link handles click, mouse enter and mouse leave', () => {
    render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    const link = screen.getByText(/download sample case/i)
    fireEvent.click(link)
    fireEvent.mouseEnter(link)
    fireEvent.mouseLeave(link)
  })
})
