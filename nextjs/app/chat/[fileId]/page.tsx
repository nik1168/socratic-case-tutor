// nextjs/app/chat/[fileId]/page.tsx
'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Chat from '@/components/Chat'
import ThemeToggle from '@/components/ThemeToggle'
import { useSessionId } from '@/providers/SessionProvider'

export const dynamic = 'force-dynamic'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function ChatPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = use(params)
  const sessionId = useSessionId()
  const searchParams = useSearchParams()
  const fileName = searchParams.get('name') ?? 'Case Study'

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="shrink-0 px-8 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
            className="shrink-0"
          >
            ← cases
          </Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ fontFamily: serif, color: 'var(--text-secondary)', fontStyle: 'italic' }} className="text-sm truncate">
            {fileName.replace(/\.pdf$/i, '')}
          </span>
        </div>
        <ThemeToggle />
      </header>
      <Chat fileId={fileId} sessionId={sessionId} />
    </div>
  )
}
