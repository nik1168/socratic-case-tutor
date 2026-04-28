import { useState } from 'react'
import Chat from './components/Chat'
import FileUpload from './components/FileUpload'

export default function App() {
  const [session, setSession] = useState<{ fileId: string; fileName: string } | null>(null)

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">CaseTutor</h1>
        <p className="text-sm text-gray-500">AI-powered business case analysis</p>
      </header>
      <div className="max-w-3xl mx-auto mt-8 px-4">
        {!session ? (
          <FileUpload
            sessionId=""
            onUpload={(fileId, fileName) => setSession({ fileId, fileName })}
          />
        ) : (
          <div className="bg-white border rounded-lg shadow-sm" style={{ height: '70vh' }}>
            <Chat fileId={session.fileId} fileName={session.fileName} />
          </div>
        )}
      </div>
    </main>
  )
}
