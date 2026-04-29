import { useRef, useState } from 'react'
import { uploadPdf } from '../api'

interface Props {
  sessionId: string
  onUpload: (fileId: string, fileName: string) => void
}

const serif = "'Playfair Display', Georgia, serif";
const mono  = "'JetBrains Mono', monospace";

export default function FileUpload({ sessionId, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus]   = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError]     = useState('')
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.')
      setStatus('error')
      return
    }
    setStatus('uploading')
    setError('')
    try {
      const fileId = await uploadPdf(file, sessionId)
      onUpload(fileId, file.name)
    } catch {
      setError('Upload failed. Check that the backend is running.')
      setStatus('error')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const uploading = status === 'uploading'

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className="flex flex-col items-center gap-7 px-10 py-16 rounded-2xl transition-all duration-300 cursor-pointer"
      style={{
        border: dragging ? '2px dashed var(--gold-border-h)' : '2px dashed var(--border)',
        background: dragging ? 'var(--gold-bg-h)' : 'var(--upload-bg)',
        opacity: uploading ? 0.6 : 1,
        pointerEvents: uploading ? 'none' : 'auto',
      }}
    >
      {/* Upload icon */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300"
        style={{ border: `1px solid ${dragging ? 'var(--gold-border)' : 'var(--upload-icon-b)'}` }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"
          style={{ color: dragging ? 'var(--gold)' : 'var(--upload-icon)', transition: 'color 0.3s' }}
        >
          <path d="M11 4v11M11 4L7.5 7.5M11 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.5 16v1.5A1.5 1.5 0 005 19h12a1.5 1.5 0 001.5-1.5V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        <p style={{ fontFamily: serif, color: 'var(--text)' }} className="text-2xl mb-1">
          {uploading ? 'Processing…' : 'Drop your case here'}
        </p>
        <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.07em' }} className="uppercase">
          {uploading ? 'indexing document' : 'or click to browse'}
        </p>
      </div>

      {/* Button */}
      <button
        type="button"
        disabled={uploading}
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
        className="px-5 py-2 rounded text-sm transition-all duration-200"
        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        {uploading ? 'Uploading…' : 'Choose PDF'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {error && (
        <p style={{ color: 'var(--error-text)', fontFamily: mono, fontSize: '12px' }}>{error}</p>
      )}

      <a
        href="/sample.pdf"
        download="sample-case.pdf"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.05em', textDecoration: 'none' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
      >
        ↓ download sample case
      </a>
    </div>
  )
}
