// nextjs/app/page.tsx
import Link from 'next/link'
import SessionList from '@/components/SessionList'
import ThemeToggle from '@/components/ThemeToggle'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-xl">
          Case<em>Tutor</em>
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/upload"
            className="flex items-center gap-2 px-4 py-2 text-sm rounded transition-all"
            style={{ border: '1px solid var(--gold-border)', color: 'var(--gold)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
          >
            new case →
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-14">
        <h1 style={{ fontFamily: serif, color: 'var(--text)' }} className="text-3xl mb-2">Your Cases</h1>
        <SessionList />
      </main>
    </div>
  )
}
