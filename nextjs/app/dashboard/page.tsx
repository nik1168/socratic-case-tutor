import Link from 'next/link'
import Dashboard from '@/components/Dashboard'
import ThemeToggle from '@/components/ThemeToggle'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function DashboardPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
          >
            ← cases
          </Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ fontFamily: serif, color: 'var(--text)' }}>Faculty Dashboard</span>
        </div>
        <ThemeToggle />
      </header>
      <Dashboard />
    </div>
  )
}
