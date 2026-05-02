// nextjs/components/Chat.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { sendMessage, getMessages, type ResponseType } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  responseType?: ResponseType
  thinkingQuality?: string
  feedback?: string
}

interface Props {
  fileId: string
  sessionId: string
}

const mono  = 'var(--font-jetbrains), monospace'
const serif = 'var(--font-playfair), Georgia, serif'

const qualityVars: Record<string, { border: string; bg: string; text: string }> = {
  insightful: { border: 'var(--badge-i)',    bg: 'var(--badge-i-bg)', text: 'var(--badge-i)' },
  developing: { border: 'var(--badge-d)',    bg: 'var(--badge-d-bg)', text: 'var(--badge-d)' },
  shallow:    { border: 'var(--badge-s)',    bg: 'var(--badge-s-bg)', text: 'var(--badge-s)' },
}

export default function Chat({ fileId, sessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId) return
    getMessages(sessionId, fileId)
      .then((items) => {
        const loaded: Message[] = items.map((item) => ({
          role: item.role,
          content: item.content,
          responseType: item.response_type,
        }))
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.role === 'assistant' && (item.thinking_quality || item.feedback)) {
            for (let j = i - 1; j >= 0; j--) {
              if (loaded[j].role === 'user') {
                loaded[j] = { ...loaded[j], thinkingQuality: item.thinking_quality ?? undefined, feedback: item.feedback ?? undefined }
                break
              }
            }
          }
        }
        setMessages(loaded)
      })
      .catch(console.error)
  }, [sessionId, fileId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)
    try {
      const { response: reply, responseType, thinkingQuality, feedback } = await sendMessage(fileId, sessionId, trimmed)
      setMessages((prev) => {
        const updated = [...prev]
        const lastUserIdx = updated.map((m) => m.role).lastIndexOf('user')
        if (lastUserIdx !== -1) updated[lastUserIdx] = { ...updated[lastUserIdx], thinkingQuality, feedback }
        return [...updated, { role: 'assistant', content: reply, responseType }]
      })
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: could not reach the backend.', isError: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-8 py-10 space-y-8">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }} className="text-xl">
              Ask your first question about the case
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px', letterSpacing: '0.1em' }} className="uppercase mb-2 px-1">
              {msg.role === 'user' ? 'You' : 'Tutor'}
            </span>
            <div
              className="max-w-[580px] px-5 py-4 rounded-xl text-sm leading-relaxed"
              style={
                msg.role === 'user'
                  ? { background: 'var(--user-bg)', border: '1px solid var(--user-border)', color: 'var(--user-text)' }
                  : msg.isError
                  ? { background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-text)' }
                  : { background: 'var(--tutor-bg)', border: '1px solid var(--tutor-border)', color: 'var(--tutor-text)' }
              }
            >
              {msg.role === 'assistant' && msg.responseType === 'clarification' && (
                <p style={{ fontFamily: mono, color: 'var(--gold)', fontSize: '10px', letterSpacing: '0.1em' }} className="uppercase mb-3">
                  Clarifying question
                </p>
              )}
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="ml-2">{children}</li>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
            {msg.role === 'user' && msg.thinkingQuality && (() => {
              const q = qualityVars[msg.thinkingQuality] ?? qualityVars.developing
              return (
                <div
                  className="mt-2 px-3 py-2 rounded max-w-[580px]"
                  style={{ borderLeft: `2px solid ${q.border}`, background: q.bg, color: q.text }}
                >
                  <span style={{ fontFamily: mono, fontSize: '10px', letterSpacing: '0.1em' }} className="uppercase font-medium">
                    {msg.thinkingQuality}
                  </span>
                  {msg.feedback && (
                    <span style={{ fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: '12px', opacity: 0.8 }} className="ml-3">
                      {msg.feedback}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        ))}
        {loading && (
          <div className="flex flex-col items-start">
            <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px', letterSpacing: '0.1em' }} className="uppercase mb-2 px-1">
              Tutor
            </span>
            <div className="px-5 py-4 rounded-xl" style={{ background: 'var(--tutor-bg)', border: '1px solid var(--tutor-border)' }}>
              <span style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }} className="text-sm">Thinking</span>
              <span style={{ color: 'var(--text-dim)' }} className="animate-pulse text-sm">…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 px-8 py-5 flex gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          className="flex-1 rounded-xl px-4 py-3 text-sm transition-colors"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', outline: 'none' }}
          placeholder="Ask about the case…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)' }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--input-border)' }}
          disabled={loading}
        />
        <button
          className="px-5 py-3 rounded-xl text-sm transition-all"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          onClick={handleSend}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  )
}
