// nextjs/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set')

export type ResponseType = 'clarification' | 'socratic_response'

const RESPONSE_TYPES: readonly string[] = ['clarification', 'socratic_response']
function isResponseType(value: unknown): value is ResponseType {
  return typeof value === 'string' && (RESPONSE_TYPES as string[]).includes(value)
}

export interface SessionItem {
  file_id: string
  file_name: string
  last_active_at: string
  message_count: number
}

export interface MessageItem {
  role: 'user' | 'assistant'
  content: string
  response_type?: ResponseType
  thinking_quality?: 'shallow' | 'developing' | 'insightful'
  feedback?: string
}

export async function uploadPdf(file: File, sessionId: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  const fileId = data?.file_id
  if (typeof fileId !== 'string' || fileId === '') throw new Error('Unexpected response: missing file_id')
  return fileId
}

export async function sendMessage(
  fileId: string,
  sessionId: string,
  message: string,
): Promise<{ response: string; responseType: ResponseType; thinkingQuality: string; feedback: string }> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, session_id: sessionId, message }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  const response = data?.response
  const responseType = data?.response_type
  const thinkingQuality = data?.thinking_quality ?? ''
  const feedback = data?.feedback ?? ''
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  if (!isResponseType(responseType)) throw new Error('Unexpected response: invalid response_type')
  return { response, responseType, thinkingQuality: String(thinkingQuality), feedback: String(feedback) }
}

export async function getSessions(sessionId: string): Promise<SessionItem[]> {
  const res = await fetch(`${API_URL}/sessions/${sessionId}`)
  if (!res.ok) throw new Error(`getSessions failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getSessions: unexpected response shape')
  return data as SessionItem[]
}

export async function getMessages(sessionId: string, fileId: string): Promise<MessageItem[]> {
  const res = await fetch(`${API_URL}/sessions/${sessionId}/${fileId}/messages`)
  if (!res.ok) throw new Error(`getMessages failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getMessages: unexpected response shape')
  return data as MessageItem[]
}

// ── Analytics types ──────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  total_sessions: number
  total_messages: number
  quality_distribution: {
    shallow: number
    developing: number
    insightful: number
  }
}

export interface QualityDay {
  date: string
  shallow: number
  developing: number
  insightful: number
}

export interface AnalyticsSession {
  session_id: string
  file_id: string
  file_name: string
  last_active_at: string
  message_count: number
  shallow: number
  developing: number
  insightful: number
}

export interface AnalyticsFile {
  file_id: string
  file_name: string
  session_count: number
  message_count: number
  shallow: number
  developing: number
  insightful: number
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const res = await fetch(`${API_URL}/analytics/overview`)
  if (!res.ok) throw new Error(`getAnalyticsOverview failed: ${res.status}`)
  return res.json() as Promise<AnalyticsOverview>
}

export async function getQualityOverTime(): Promise<QualityDay[]> {
  const res = await fetch(`${API_URL}/analytics/quality-over-time`)
  if (!res.ok) throw new Error(`getQualityOverTime failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getQualityOverTime: unexpected response shape')
  return data as QualityDay[]
}

export async function getAnalyticsSessions(): Promise<AnalyticsSession[]> {
  const res = await fetch(`${API_URL}/analytics/sessions`)
  if (!res.ok) throw new Error(`getAnalyticsSessions failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getAnalyticsSessions: unexpected response shape')
  return data as AnalyticsSession[]
}

export async function getAnalyticsFiles(): Promise<AnalyticsFile[]> {
  const res = await fetch(`${API_URL}/analytics/files`)
  if (!res.ok) throw new Error(`getAnalyticsFiles failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getAnalyticsFiles: unexpected response shape')
  return data as AnalyticsFile[]
}
