import { useRef, useState } from 'react'
import { uploadPdf } from '../api'

interface Props {
  sessionId: string
  onUpload: (fileId: string, fileName: string) => void
}

export default function FileUpload({ sessionId, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError] = useState('')

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

  return (
    <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-gray-300 rounded-lg">
      <p className="text-gray-600">Upload a business case PDF to begin</p>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        disabled={status === 'uploading'}
        onClick={() => inputRef.current?.click()}
      >
        {status === 'uploading' ? 'Uploading…' : 'Choose PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
