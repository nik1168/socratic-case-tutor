const API_URL = import.meta.env.VITE_API_URL
if (!API_URL) throw new Error('VITE_API_URL is not set')

export type ResponseType = 'clarification' | 'socratic_response'

const RESPONSE_TYPES: readonly string[] = ['clarification', 'socratic_response']
function isResponseType(value: unknown): value is ResponseType {
  return typeof value === 'string' && (RESPONSE_TYPES as string[]).includes(value)
}

export async function uploadPdf(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  const fileId = data?.file_id
  if (typeof fileId !== 'string' || fileId === '') throw new Error('Unexpected response: missing file_id')
  return fileId
}

export async function sendMessage(
  fileId: string,
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ response: string; responseType: ResponseType }> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      message,
      conversation_history: conversationHistory,
    }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  const response = data?.response
  const responseType = data?.response_type
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  if (!isResponseType(responseType)) throw new Error('Unexpected response: invalid response_type')
  return { response, responseType }
}
