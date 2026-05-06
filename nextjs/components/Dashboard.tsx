// nextjs/components/Dashboard.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  getAnalyticsOverview,
  getQualityOverTime,
  getAnalyticsSessions,
  getAnalyticsFiles,
  type AnalyticsOverview,
  type QualityDay,
  type AnalyticsSession,
  type AnalyticsFile,
} from '@/lib/api'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

const qualityVars: Record<string, { border: string; bg: string; text: string }> = {
  insightful: { border: 'var(--badge-i)', bg: 'var(--badge-i-bg)', text: 'var(--badge-i)' },
  developing: { border: 'var(--badge-d)', bg: 'var(--badge-d-bg)', text: 'var(--badge-d)' },
  shallow:    { border: 'var(--badge-s)', bg: 'var(--badge-s-bg)', text: 'var(--badge-s)' },
}

function badgeStyle(quality: string): React.CSSProperties {
  const q = qualityVars[quality] ?? qualityVars.developing
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    border: `1px solid ${q.border}`,
    background: q.bg,
    color: q.text,
    fontFamily: mono,
    fontSize: '11px',
    letterSpacing: '0.06em',
  }
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
}

type SortKey = 'last_active_at' | 'message_count'

function dominantQuality(dist: { shallow: number; developing: number; insightful: number }): string | null {
  const entries = Object.entries(dist) as [string, number][]
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return null
  return entries.reduce((best, curr) => (curr[1] > best[1] ? curr : best))[0]
}

export default function Dashboard() {
  const [overview,    setOverview]    = useState<AnalyticsOverview | null>(null)
  const [qualityTime, setQualityTime] = useState<QualityDay[]>([])
  const [sessions,    setSessions]    = useState<AnalyticsSession[]>([])
  const [files,       setFiles]       = useState<AnalyticsFile[]>([])
  const [sortKey,     setSortKey]     = useState<SortKey>('last_active_at')
  const [loaded,      setLoaded]      = useState(false)

  useEffect(() => {
    Promise.all([
      getAnalyticsOverview(),
      getQualityOverTime(),
      getAnalyticsSessions(),
      getAnalyticsFiles(),
    ])
      .then(([ov, qt, ses, fs]) => {
        setOverview(ov)
        setQualityTime(qt)
        setSessions(ses)
        setFiles(fs)
      })
      .catch(console.error)
      .finally(() => setLoaded(true))
  }, [])

  const top = overview ? dominantQuality(overview.quality_distribution) : null

  const sortedSessions = [...sessions].sort((a, b) => {
    if (sortKey === 'message_count') return b.message_count - a.message_count
    return new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
  })

  if (!loaded) return null

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Total Sessions
          </p>
          <p data-testid="stat-total-sessions" style={{ fontFamily: serif, color: 'var(--text)', fontSize: '2.5rem', lineHeight: 1 }}>
            {overview?.total_sessions ?? 0}
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Student Messages
          </p>
          <p data-testid="stat-total-messages" style={{ fontFamily: serif, color: 'var(--text)', fontSize: '2.5rem', lineHeight: 1 }}>
            {overview?.total_messages ?? 0}
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Top Thinking Level
          </p>
          {top && <span data-testid="badge-top-level" style={badgeStyle(top)}>{top}</span>}
        </div>
      </div>

      {/* Quality over time */}
      <section className="mb-10">
        <h2 style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Quality Over Time
        </h2>
        {qualityTime.length === 0 ? (
          <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }}>No data yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: mono, fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Shallow', 'Developing', 'Insightful'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qualityTime.map((row) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{row.date}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-s)' }}>{row.shallow}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-d)' }}>{row.developing}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-i)' }}>{row.insightful}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sessions table */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Sessions
          </h2>
          <div className="flex gap-2">
            {(['last_active_at', 'message_count'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                style={{
                  fontFamily: mono,
                  fontSize: '10px',
                  letterSpacing: '0.06em',
                  padding: '2px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${sortKey === key ? 'var(--gold-border)' : 'var(--border)'}`,
                  background: sortKey === key ? 'var(--gold-bg-h)' : 'transparent',
                  color: sortKey === key ? 'var(--gold)' : 'var(--text-dim)',
                  cursor: 'pointer',
                }}
              >
                {key === 'last_active_at' ? 'Recent' : 'Messages'}
              </button>
            ))}
          </div>
        </div>
        {sortedSessions.length === 0 ? (
          <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }}>No sessions yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="sessions-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: mono, fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['File', 'Messages', 'Shallow', 'Developing', 'Insightful', 'Last Active'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSessions.map((s) => (
                  <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text)' }}>{s.file_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{s.message_count}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-s)' }}>{s.shallow}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-d)' }}>{s.developing}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-i)' }}>{s.insightful}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>
                      {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(s.last_active_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Files table */}
      <section>
        <h2 style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Files
        </h2>
        {files.length === 0 ? (
          <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }}>No data yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: mono, fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['File', 'Sessions', 'Messages', 'Shallow', 'Developing', 'Insightful'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.file_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text)' }}>{f.file_name}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{f.session_count}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{f.message_count}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-s)' }}>{f.shallow}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-d)' }}>{f.developing}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--badge-i)' }}>{f.insightful}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
