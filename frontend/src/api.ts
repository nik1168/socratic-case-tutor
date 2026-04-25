const API_URL = import.meta.env.VITE_API_URL as string

export async function uploadPdf(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  return data.file_id as string
}

export async function sendMessage(fileId: string, message: string): Promise<string> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, message }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  return data.response as string
}
