// nextjs/components/SessionList.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSessions, type SessionItem } from '@/lib/api'
import { useSessionId } from '@/providers/SessionProvider'

const mono  = 'var(--font-jetbrains), monospace'
const serif = 'var(--font-playfair), Georgia, serif'

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function SessionList() {
  const sessionId = useSessionId()
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    getSessions(sessionId)
      .then((data) => { setSessions(data); setLoaded(true) })
      .catch(console.error)
  }, [sessionId])

  if (!loaded) return null

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl p-16 text-center" style={{ border: '1px dashed var(--border)' }}>
        <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }} className="text-xl mb-2">
          No previous sessions
        </p>
        <p style={{ fontFamily: mono, color: 'var(--text-faint)', fontSize: '11px', letterSpacing: '0.06em' }} className="uppercase">
          upload a case to begin
        </p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
      {sessions.map((s) => (
        <li key={s.file_id}>
          <button
            type="button"
            onClick={() => router.push(`/chat/${s.file_id}?name=${encodeURIComponent(s.file_name)}`)}
            className="w-full text-left rounded-xl p-5 transition-all duration-200"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--gold-card-h)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <p className="truncate mb-4 text-sm font-medium" style={{ color: 'var(--text)' }}>
              {s.file_name}
            </p>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px', letterSpacing: '0.06em' }} className="uppercase">
                {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
              </span>
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px' }}>
                {formatDate(s.last_active_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
