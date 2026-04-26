import { useState } from 'react'
import { sendMessage } from '../api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  responseType?: string
}

interface Props {
  fileId: string
  fileName: string
}

export default function Chat({ fileId, fileName }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    const userMessage: Message = { role: 'user', content: trimmed }
    const history = messages.filter((m) => !m.isError)
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    try {
      const { response: reply, responseType } = await sendMessage(fileId, trimmed, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, responseType }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: could not reach the backend.', isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-gray-100 border-b text-sm text-gray-600">
        Case: <span className="font-medium">{fileName}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            Ask your first question about the case
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-2xl px-4 py-3 rounded-lg text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : 'mr-auto bg-white border text-gray-800'
            }`}
          >
            {msg.role === 'assistant' && msg.responseType === 'clarification' && (
              <p className="text-xs text-blue-500 mb-1 font-medium">Clarifying question</p>
            )}
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="mr-auto bg-white border rounded-lg px-4 py-3 text-sm text-gray-400">
            Thinking…
          </div>
        )}
      </div>
      <div className="p-4 border-t flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask about the case…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSend}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  )
}
