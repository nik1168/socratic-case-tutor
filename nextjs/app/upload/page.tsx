'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FileUpload from '@/components/FileUpload'
import ThemeToggle from '@/components/ThemeToggle'
import { useSessionId } from '@/providers/SessionProvider'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function UploadPage() {
  const router = useRouter()
  const sessionId = useSessionId()

  function handleUpload(fileId: string, fileName: string) {
    router.push(`/chat/${fileId}?name=${encodeURIComponent(fileName)}`)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
          >
            ← cases
          </Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-base">New Case</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-center justify-center px-8 py-16">
        <div className="w-full max-w-md">
          <FileUpload sessionId={sessionId} onUpload={handleUpload} />
        </div>
      </main>
    </div>
  )
}
