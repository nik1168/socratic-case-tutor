// nextjs/lib/session.ts
export function getOrCreateSessionId(): string {
  const stored = localStorage.getItem('case_tutor_session_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('case_tutor_session_id', id)
  return id
}
