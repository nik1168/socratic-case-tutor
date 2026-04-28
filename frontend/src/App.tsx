import { useEffect, useState } from 'react';
import FileUpload from './components/FileUpload';
import Chat from './components/Chat';
import SessionList from './components/SessionList';
import { getSessions } from './api';
import type { SessionItem } from './api';

function getOrCreateSessionId(): string {
  const stored = localStorage.getItem('case_tutor_session_id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('case_tutor_session_id', id);
  return id;
}

function getInitialTheme(): 'dark' | 'light' {
  return (localStorage.getItem('case_tutor_theme') as 'dark' | 'light') || 'dark';
}

type View = 'sessions' | 'upload' | 'chat';

const serif = "'Playfair Display', Georgia, serif";
const mono  = "'JetBrains Mono', monospace";

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-8 h-8 rounded transition-colors"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {theme === 'dark' ? (
        // Sun icon
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.8" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M7 1v1.4M7 11.6V13M1 7h1.4M11.6 7H13M2.7 2.7l1 1M10.3 10.3l1 1M2.7 11.3l1-1M10.3 3.7l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ) : (
        // Moon icon
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M12 9.5A5.5 5.5 0 015 1.5a5.5 5.5 0 107 8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

export default function App() {
  const [sessionId] = useState<string>(getOrCreateSessionId);
  const [view, setView]           = useState<View>('sessions');
  const [currentFileId, setCurrentFileId]     = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [sessions, setSessions]   = useState<SessionItem[]>([]);
  const [theme, setTheme]         = useState<'dark' | 'light'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('case_tutor_theme', theme);
  }, [theme]);

  useEffect(() => {
    getSessions(sessionId).then(setSessions).catch(console.error);
  }, [sessionId]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  function handleUploadSuccess(fileId: string, fileName: string) {
    setCurrentFileId(fileId);
    setCurrentFileName(fileName);
    setSessions((prev) => {
      if (prev.some((s) => s.file_id === fileId)) return prev;
      return [{ file_id: fileId, file_name: fileName, last_active_at: new Date().toISOString(), message_count: 0 }, ...prev];
    });
    setView('chat');
  }

  function handleSelectSession(fileId: string) {
    const session = sessions.find((s) => s.file_id === fileId);
    setCurrentFileId(fileId);
    setCurrentFileName(session?.file_name ?? '');
    setView('chat');
  }

  function goBack() {
    setView('sessions');
    getSessions(sessionId).then(setSessions).catch(console.error);
  }

  const navLink: React.CSSProperties = { color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em' };
  const separator: React.CSSProperties = { color: 'var(--border)' };

  // ── Upload view ──────────────────────────────────────────────────────────
  if (view === 'upload') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-4">
            <button type="button" onClick={goBack} className="flex items-center gap-2 transition-colors" style={navLink}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ← cases
            </button>
            <span style={separator}>·</span>
            <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-base">New Case</span>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <main className="flex-1 flex items-center justify-center px-8 py-16">
          <div className="w-full max-w-md">
            <FileUpload sessionId={sessionId} onUpload={handleUploadSuccess} />
          </div>
        </main>
      </div>
    );
  }

  // ── Chat view ────────────────────────────────────────────────────────────
  if (view === 'chat' && currentFileId) {
    return (
      <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <header className="shrink-0 px-8 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-4 min-w-0">
            <button type="button" onClick={goBack} className="flex items-center gap-2 shrink-0 transition-colors" style={navLink}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              ← cases
            </button>
            <span style={separator}>·</span>
            <span style={{ fontFamily: serif, color: 'var(--text-secondary)', fontStyle: 'italic' }} className="text-sm truncate">
              {currentFileName.replace(/\.pdf$/i, '') || 'Case Study'}
            </span>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <Chat fileId={currentFileId} sessionId={sessionId} />
      </div>
    );
  }

  // ── Sessions view (default) ──────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-xl">
          Case<em>Tutor</em>
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('upload')}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded transition-all"
            style={{ border: '1px solid var(--gold-border)', color: 'var(--gold)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gold-bg-h)'; e.currentTarget.style.borderColor = 'var(--gold-border-h)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--gold-border)'; }}
          >
            new case →
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-14">
        <h1 style={{ fontFamily: serif, color: 'var(--text)' }} className="text-3xl mb-2">Your Cases</h1>
        <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.08em' }} className="uppercase mb-10">
          {sessions.length === 0 ? 'no cases yet' : `${sessions.length} case${sessions.length !== 1 ? 's' : ''}`}
        </p>
        <SessionList sessions={sessions} onSelect={handleSelectSession} />
      </main>
    </div>
  );
}
