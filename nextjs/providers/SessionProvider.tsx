// nextjs/providers/SessionProvider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getOrCreateSessionId } from '@/lib/session'

const SessionContext = createContext<string>('')

export function useSessionId(): string {
  return useContext(SessionContext)
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<string>('')

  useEffect(() => {
    setSessionId(getOrCreateSessionId())
  }, [])

  return (
    <SessionContext.Provider value={sessionId}>
      {children}
    </SessionContext.Provider>
  )
}
