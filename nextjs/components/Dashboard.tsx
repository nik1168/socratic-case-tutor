'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getAnalyticsOverview, getQualityOverTime,
  getAnalyticsSessions, getAnalyticsFiles,
} from '@/lib/api'
import type { AnalyticsOverview, QualityDay, AnalyticsSession, AnalyticsFile } from '@/lib/api'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

const SHALLOW_COLOR    = '#f87171'
const DEVELOPING_COLOR = '#fbbf24'
const INSIGHTFUL_COLOR = '#4ade80'

type SortKey = 'last_active_at' | 'message_count'

function topLevel(q: { shallow: number; developing: number; insightful: number }): 'shallow' | 'developing' | 'insightful' {
  if (q.insightful >= q.developing && q.insightful >= q.shallow) return 'insightful'
  if (q.developing >= q.shallow) return 'developing'
  return 'shallow'
}

export default function Dashboard() {
  const [overview, setOverview]       = useState<AnalyticsOverview | null>(null)
  const [qualityTime, setQualityTime] = useState<QualityDay[]>([])
  const [sessions, setSessions]       = useState<AnalyticsSession[]>([])
  const [files, setFiles]             = useState<AnalyticsFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('last_active_at')

  useEffect(() => {
    Promise.all([
      getAnalyticsOverview(),
      getQualityOverTime(),
      getAnalyticsSessions(),
      getAnalyticsFiles(),
    ])
      .then(([ov, qt, sess, fs]) => {
        setOverview(ov)
        setQualityTime(qt)
        setSessions(sess)
        setFiles(fs)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const sortedSessions = [...sessions].sort((a, b) =>
    sortKey === 'message_count'
      ? b.message_count - a.message_count
      : new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime(),
  )

  const cardStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '24px',
  }

  const badgeStyle = (level: 'shallow' | 'developing' | 'insightful'): React.CSSProperties => ({
    color:      level === 'insightful' ? 'var(--badge-i)' : level === 'developing' ? 'var(--badge-d)' : 'var(--badge-s)',
    background: level === 'insightful' ? 'var(--badge-i-bg)' : level === 'developing' ? 'var(--badge-d-bg)' : 'var(--badge-s-bg)',
    fontFamily: mono,
    fontSize: '11px',
    letterSpacing: '0.06em',
    padding: '6px 12px',
    borderRadius: '4px',
    display: 'inline-block',
    marginTop: '0.5rem',
    textTransform: 'capitalize' as const,
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span style={{ fontFamily: mono, color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em' }}>
          loading dashboard...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span style={{ fontFamily: mono, color: 'var(--error-text)', fontSize: '12px' }}>{error}</span>
      </div>
    )
  }

  const top = overview ? topLevel(overview.quality_distribution) : null

  return (
    <main className="max-w-6xl mx-auto px-8 py-10 flex flex-col gap-8">
      {/* ── Section 1: Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Total Sessions
          </p>
          <p style={{ fontFamily: serif, color: 'var(--text)', fontSize: '2.5rem', lineHeight: 1 }}>
            {overview?.total_sessions ?? 0}
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Student Messages
          </p>
          <p style={{ fontFamily: serif, color: 'var(--text)', fontSize: '2.5rem', lineHeight: 1 }}>
            {overview?.total_messages ?? 0}
          </p>
        </div>

        <div style={cardStyle}>
          <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Top Thinking Level
          </p>
          {top && <span style={badgeStyle(top)}>{top}</span>}
        </div>
      </div>

      {/* ── Section 2: Quality Over Time ── */}
      <div style={cardStyle}>
        <h2 style={{ fontFamily: serif, color: 'var(--text)', fontSize: '1.25rem', marginBottom: '1.5rem' }}>
          Thinking Quality Over Time
        </h2>
        {qualityTime.length === 0 ? (
          <p style={{ fontFamily: mono, color: 'var(--text-muted)', fontSize: '12px' }}>No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={qualityTime} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="shallow"    stackId="1" stroke={SHALLOW_COLOR}    fill={SHALLOW_COLOR}    fillOpacity={0.6} name="Shallow" />
              <Area type="monotone" dataKey="developing" stackId="1" stroke={DEVELOPING_COLOR} fill={DEVELOPING_COLOR} fillOpacity={0.6} name="Developing" />
              <Area type="monotone" dataKey="insightful" stackId="1" stroke={INSIGHTFUL_COLOR} fill={INSIGHTFUL_COLOR} fillOpacity={0.6} name="Insightful" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Section 3: Sessions Table ── */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: serif, color: 'var(--text)', fontSize: '1.25rem' }}>Sessions</h2>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: mono, fontSize: '11px', color: 'var(--text-muted)' }}>Sort:</span>
            {(['last_active_at', 'message_count'] as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                style={{
                  fontFamily: mono, fontSize: '11px', letterSpacing: '0.04em',
                  padding: '3px 8px', borderRadius: '4px', border: '1px solid',
                  borderColor: sortKey === key ? 'var(--gold-border-h)' : 'var(--border)',
                  color:       sortKey === key ? 'var(--gold)'          : 'var(--text-muted)',
                  background:  sortKey === key ? 'var(--gold-bg-h)'     : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {key === 'last_active_at' ? 'Last Active' : 'Messages'}
              </button>
            ))}
          </div>
        </div>
        {sessions.length === 0 ? (
          <p style={{ fontFamily: mono, color: 'var(--text-muted)', fontSize: '12px' }}>No sessions yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Case Study', 'Last Active', 'Messages', 'Shallow', 'Developing', 'Insightful'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontFamily: mono, fontSize: '11px', letterSpacing: '0.06em', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSessions.map((s) => (
                  <tr key={`${s.session_id}-${s.file_id}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: mono, fontSize: '13px', color: 'var(--text)' }} title={s.file_name}>
                      {s.file_name.replace(/\.pdf$/i, '')}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: mono, fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(s.last_active_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: mono, fontSize: '13px', color: 'var(--text)' }}>{s.message_count}</td>
                    <td style={{ padding: '10px 12px', fontFamily: mono, fontSize: '13px', color: 'var(--badge-s)' }}>{s.shallow}</td>
                    <td style={{ padding: '10px 12px', fontFamily: mono, fontSize: '13px', color: 'var(--badge-d)' }}>{s.developing}</td>
                    <td style={{ padding: '10px 12px', fontFamily: mono, fontSize: '13px', color: 'var(--badge-i)' }}>{s.insightful}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Engagement by Case Study ── */}
      <div style={cardStyle}>
        <h2 style={{ fontFamily: serif, color: 'var(--text)', fontSize: '1.25rem', marginBottom: '1.5rem' }}>
          Engagement by Case Study
        </h2>
        {files.length === 0 ? (
          <p style={{ fontFamily: mono, color: 'var(--text-muted)', fontSize: '12px' }}>No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(files.length * 52, 120)}>
            <BarChart data={files} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="file_name"
                width={150}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickFormatter={(v: string) => v.replace(/\.pdf$/i, '').substring(0, 20)}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="shallow"    stackId="a" fill={SHALLOW_COLOR}    name="Shallow" />
              <Bar dataKey="developing" stackId="a" fill={DEVELOPING_COLOR} name="Developing" />
              <Bar dataKey="insightful" stackId="a" fill={INSIGHTFUL_COLOR} name="Insightful" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </main>
  )
}
