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

export default function App() {
  const [sessionId] = useState<string>(getOrCreateSessionId);
  const [view, setView] = useState<View>('sessions');
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  useEffect(() => {
    getSessions(sessionId).then(setSessions).catch(console.error);
  }, [sessionId]);

  function handleUploadSuccess(fileId: string) {
    setCurrentFileId(fileId);
    setView('chat');
  }

  function handleSelectSession(fileId: string) {
    setCurrentFileId(fileId);
    setView('chat');
  }

  if (view === 'upload') {
    return (
      <div>
        <button type="button" onClick={() => setView('sessions')}>Back</button>
        <FileUpload sessionId={sessionId} onUpload={handleUploadSuccess} />
      </div>
    );
  }

  if (view === 'chat' && currentFileId) {
    return (
      <div>
        <button type="button" onClick={() => setView('sessions')}>Back</button>
        <Chat fileId={currentFileId} sessionId={sessionId} />
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setView('upload')}>New Case</button>
      <SessionList sessions={sessions} onSelect={handleSelectSession} />
    </div>
  );
}
