// nextjs/app/dashboard/page.tsx
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import Dashboard from '@/components/Dashboard'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function DashboardPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-xl">
          Case<em>Tutor</em>
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
          >
            ← cases
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-8 py-14">
        <h1 style={{ fontFamily: serif, color: 'var(--text)' }} className="text-3xl mb-8">Faculty Dashboard</h1>
        <Dashboard />
      </main>
    </div>
  )
}
