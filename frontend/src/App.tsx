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

type View = 'sessions' | 'upload' | 'chat';

const serif = "'Playfair Display', Georgia, serif";
const mono = "'JetBrains Mono', monospace";

export default function App() {
  const [sessionId] = useState<string>(getOrCreateSessionId);
  const [view, setView] = useState<View>('sessions');
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    getSessions(sessionId).then(setSessions).catch(console.error);
  }, [sessionId]);

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

  // ── Upload view ──────────────────────────────────────────────────────────
  if (view === 'upload') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0c0c0c' }}>
        <header style={{ borderBottom: '1px solid #181818' }} className="px-8 py-5 flex items-center gap-5">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#454035', fontFamily: mono }}
          >
            ← cases
          </button>
          <span style={{ color: '#1a1a1a' }}>·</span>
          <span style={{ fontFamily: serif, color: '#ddd6cc' }} className="text-base">
            New Case
          </span>
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
      <div className="h-screen flex flex-col" style={{ background: '#0c0c0c' }}>
        <header style={{ borderBottom: '1px solid #181818' }} className="shrink-0 px-8 py-4 flex items-center gap-5">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#454035', fontFamily: mono }}
          >
            ← cases
          </button>
          <span style={{ color: '#1a1a1a' }}>·</span>
          <span style={{ fontFamily: serif, color: '#9b9080', fontStyle: 'italic' }} className="text-sm truncate">
            {currentFileName.replace(/\.pdf$/i, '') || 'Case Study'}
          </span>
        </header>
        <Chat fileId={currentFileId} sessionId={sessionId} />
      </div>
    );
  }

  // ── Sessions view (default) ──────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#0c0c0c' }}>
      <header style={{ borderBottom: '1px solid #181818' }} className="px-8 py-5 flex items-center justify-between">
        <span style={{ fontFamily: serif, color: '#ddd6cc' }} className="text-xl">
          Case<em>Tutor</em>
        </span>
        <button
          type="button"
          onClick={() => setView('upload')}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded transition-all"
          style={{
            border: '1px solid rgba(201,168,76,0.35)',
            color: '#c9a84c',
            fontFamily: mono,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201,168,76,0.06)';
            e.currentTarget.style.borderColor = 'rgba(201,168,76,0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'rgba(201,168,76,0.35)';
          }}
        >
          new case →
        </button>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-14">
        <h1 style={{ fontFamily: serif, color: '#ddd6cc' }} className="text-3xl mb-2">
          Your Cases
        </h1>
        <p
          style={{ fontFamily: mono, color: '#3a3430', fontSize: '11px', letterSpacing: '0.08em' }}
          className="uppercase mb-10"
        >
          {sessions.length === 0
            ? 'no cases yet'
            : `${sessions.length} case${sessions.length !== 1 ? 's' : ''}`}
        </p>
        <SessionList sessions={sessions} onSelect={handleSelectSession} />
      </main>
    </div>
  );
}
