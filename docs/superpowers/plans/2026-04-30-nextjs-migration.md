# Next.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the CaseTutor frontend as a Next.js 15 App Router application in a parallel `nextjs/` folder, preserving all existing functionality and visual design.

**Architecture:** App Router with three URL-based routes (`/`, `/upload`, `/chat/[fileId]`). All data-fetching components are `'use client'` since they need `sessionId` from localStorage. A `SessionProvider` context manages `sessionId`. A self-contained `ThemeToggle` manages dark/light theme. The existing FastAPI backend on Railway is unchanged.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4 (`@tailwindcss/postcss`), `next/font/google`, `react-markdown`, Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `nextjs/app/layout.tsx` | Create | Root layout: fonts, theme flash script, SessionProvider |
| `nextjs/app/page.tsx` | Create | `/` — renders page shell + SessionList |
| `nextjs/app/upload/page.tsx` | Create | `/upload` — renders upload page shell + FileUpload |
| `nextjs/app/chat/[fileId]/page.tsx` | Create | `/chat/[fileId]` — renders chat page shell + Chat |
| `nextjs/app/globals.css` | Create | Tailwind import + all CSS variables (ported from frontend) |
| `nextjs/components/SessionList.tsx` | Create | `'use client'` — fetches sessions on mount via context |
| `nextjs/components/FileUpload.tsx` | Create | `'use client'` — drag-and-drop, prop-based (sessionId, onUpload) |
| `nextjs/components/Chat.tsx` | Create | `'use client'` — prop-based (fileId, sessionId), markdown render |
| `nextjs/components/ThemeToggle.tsx` | Create | `'use client'` — self-contained dark/light toggle |
| `nextjs/providers/SessionProvider.tsx` | Create | `'use client'` — localStorage sessionId via React context |
| `nextjs/lib/api.ts` | Create | API client (ported from frontend, uses `NEXT_PUBLIC_API_URL`) |
| `nextjs/lib/session.ts` | Create | `getOrCreateSessionId()` helper |
| `nextjs/vitest.config.ts` | Create | Vitest + jsdom + `@` alias + env vars |
| `nextjs/vitest.setup.ts` | Create | jest-dom matchers, cleanup, next/navigation global mock |
| `nextjs/next.config.ts` | Generated | Minimal Next.js config |
| `nextjs/postcss.config.mjs` | Create | `@tailwindcss/postcss` plugin |
| `nextjs/public/sample.pdf` | Copy | Sample case PDF |
| `nextjs/components/__tests__/SessionList.test.tsx` | Create | Tests for connected SessionList |
| `nextjs/components/__tests__/FileUpload.test.tsx` | Create | Tests for FileUpload (ported) |
| `nextjs/components/__tests__/Chat.test.tsx` | Create | Tests for Chat (ported) |
| `nextjs/providers/__tests__/SessionProvider.test.tsx` | Create | Tests for SessionProvider |

---

## Task 1: Create branch and scaffold Next.js project

**Files:** `nextjs/` (scaffold), `.gitignore`

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git checkout -b feat/nextjs-migration
```

Expected: `Switched to a new branch 'feat/nextjs-migration'`

- [ ] **Step 2: Scaffold the Next.js app (no Tailwind — we install v4 manually)**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
npx create-next-app@15 nextjs --typescript --no-tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
```

Expected: scaffold completes, `nextjs/` directory created with `app/`, `public/`, `next.config.ts`, `package.json`, `tsconfig.json`.

- [ ] **Step 3: Add nextjs build artifacts to root .gitignore**

Open `/Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/.gitignore` and append if not present:

```
# Next.js
nextjs/.next/
nextjs/node_modules/
nextjs/.env.local
.superpowers/
```

- [ ] **Step 4: Copy sample.pdf into the new public folder**

```bash
cp /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/frontend/public/sample.pdf \
   /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs/public/sample.pdf
```

- [ ] **Step 5: Delete the create-next-app placeholder SVGs (not needed)**

```bash
rm /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs/public/*.svg
```

- [ ] **Step 6: Commit the scaffold**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/ .gitignore
git commit -m "feat: scaffold Next.js 15 app in nextjs/ folder"
```

---

## Task 2: Install Tailwind CSS 4 and port globals.css

**Files:** `nextjs/postcss.config.mjs`, `nextjs/package.json`, `nextjs/app/globals.css`

- [ ] **Step 1: Install Tailwind CSS 4 and its PostCSS plugin**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npm install tailwindcss@^4 @tailwindcss/postcss@^4
```

- [ ] **Step 2: Create `postcss.config.mjs`** (replace any existing file)

```javascript
// nextjs/postcss.config.mjs
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
export default config
```

- [ ] **Step 3: Replace `app/globals.css` with the ported CSS**

Write the following to `nextjs/app/globals.css`:

```css
@import "tailwindcss";

/* ── Dark theme (default) ───────────────────────────────────────────────── */
:root, [data-theme="dark"] {
  --bg:              #242424;
  --surface:         #2c2c2c;
  --card:            #333333;
  --border:          #454545;
  --border-subtle:   #3a3a3a;
  --border-hover:    #585858;

  --text:            #f0ebe4;
  --text-secondary:  #c4bcb0;
  --text-muted:      #8e8680;
  --text-dim:        #6e6860;
  --text-faint:      #585048;

  --gold:            #d4af5a;
  --gold-border:     rgba(212, 175, 90, 0.40);
  --gold-border-h:   rgba(212, 175, 90, 0.65);
  --gold-bg-h:       rgba(212, 175, 90, 0.08);
  --gold-card-h:     rgba(212, 175, 90, 0.25);

  --user-bg:         #333333;
  --user-border:     #464646;
  --user-text:       #f0ebe4;
  --tutor-bg:        #2c2c2c;
  --tutor-border:    #3c3c3c;
  --tutor-text:      #b8b0a4;
  --error-bg:        #3a2020;
  --error-border:    #5a2c2c;
  --error-text:      #f08080;

  --badge-i:         #4ade80;
  --badge-i-bg:      rgba(74, 222, 128, 0.10);
  --badge-d:         #fbbf24;
  --badge-d-bg:      rgba(251, 191, 36, 0.10);
  --badge-s:         #f87171;
  --badge-s-bg:      rgba(248, 113, 113, 0.10);

  --input-bg:        #2c2c2c;
  --input-border:    #454545;
  --upload-bg:       #2c2c2c;
  --upload-icon:     #6e6860;
  --upload-icon-b:   #464646;
}

/* ── Light theme ────────────────────────────────────────────────────────── */
[data-theme="light"] {
  --bg:              #f4efe5;
  --surface:         #ede7db;
  --card:            #e6dfd2;
  --border:          #d4cdc0;
  --border-subtle:   #ddd7ca;
  --border-hover:    #c8c0b0;

  --text:            #1c1812;
  --text-secondary:  #6a6050;
  --text-muted:      #9a8e7e;
  --text-dim:        #c0b8a8;
  --text-faint:      #ccc4b4;

  --gold:            #9a6e20;
  --gold-border:     rgba(154, 110, 32, 0.40);
  --gold-border-h:   rgba(154, 110, 32, 0.70);
  --gold-bg-h:       rgba(154, 110, 32, 0.06);
  --gold-card-h:     rgba(154, 110, 32, 0.18);

  --user-bg:         #e6dfd2;
  --user-border:     #d4cdc0;
  --user-text:       #1c1812;
  --tutor-bg:        #ede7db;
  --tutor-border:    #ddd7ca;
  --tutor-text:      #5a5040;
  --error-bg:        #fdf0f0;
  --error-border:    #f0c0c0;
  --error-text:      #991b1b;

  --badge-i:         #15803d;
  --badge-i-bg:      rgba(21, 128, 61, 0.08);
  --badge-d:         #92400e;
  --badge-d-bg:      rgba(146, 64, 14, 0.08);
  --badge-s:         #991b1b;
  --badge-s-bg:      rgba(153, 27, 27, 0.08);

  --input-bg:        #ede7db;
  --input-border:    #d4cdc0;
  --upload-bg:       #ede7db;
  --upload-icon:     #9a8e7e;
  --upload-icon-b:   #c8c0b0;
}

/* ── Base ───────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color 0.25s ease, color 0.25s ease;
}

/* Film grain */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.028'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 9999;
}

::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
```

- [ ] **Step 4: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/
git commit -m "feat: set up Tailwind CSS 4 and port CSS variables to nextjs/"
```

---

## Task 3: Set up Vitest

**Files:** `nextjs/vitest.config.ts`, `nextjs/vitest.setup.ts`, `nextjs/package.json`, `nextjs/.env.local`

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create `vitest.setup.ts`**

```typescript
// nextjs/vitest.setup.ts
import { afterEach, expect, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'

expect.extend(jestDomMatchers)
afterEach(() => cleanup())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}))
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
// nextjs/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:8000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 4: Add test script to `package.json`**

Open `nextjs/package.json` and add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Create `.env.local`**

```
NEXT_PUBLIC_API_URL=https://adaptable-love-production-1eb8.up.railway.app
```

- [ ] **Step 6: Verify Vitest is wired up (no tests yet — should show "no test files found")**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run
```

Expected: exits cleanly or says "No test files found"

- [ ] **Step 7: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/
git commit -m "feat: set up Vitest with jsdom for nextjs/"
```

---

## Task 4: Create `lib/api.ts` and `lib/session.ts`

**Files:** `nextjs/lib/api.ts`, `nextjs/lib/session.ts`

No tests needed for these — pure functions tested indirectly through component tests.

- [ ] **Step 1: Create `lib/api.ts`** (ported from `frontend/src/api.ts`, env var renamed)

```typescript
// nextjs/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set')

export type ResponseType = 'clarification' | 'socratic_response'

const RESPONSE_TYPES: readonly string[] = ['clarification', 'socratic_response']
function isResponseType(value: unknown): value is ResponseType {
  return typeof value === 'string' && (RESPONSE_TYPES as string[]).includes(value)
}

export interface SessionItem {
  file_id: string
  file_name: string
  last_active_at: string
  message_count: number
}

export interface MessageItem {
  role: 'user' | 'assistant'
  content: string
  response_type?: ResponseType
  thinking_quality?: 'shallow' | 'developing' | 'insightful'
  feedback?: string
}

export async function uploadPdf(file: File, sessionId: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('session_id', sessionId)
  const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  const data = await res.json()
  const fileId = data?.file_id
  if (typeof fileId !== 'string' || fileId === '') throw new Error('Unexpected response: missing file_id')
  return fileId
}

export async function sendMessage(
  fileId: string,
  sessionId: string,
  message: string,
): Promise<{ response: string; responseType: ResponseType; thinkingQuality: string; feedback: string }> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, session_id: sessionId, message }),
  })
  if (!res.ok) throw new Error(`Chat failed: ${res.statusText}`)
  const data = await res.json()
  const response = data?.response
  const responseType = data?.response_type
  const thinkingQuality = data?.thinking_quality ?? ''
  const feedback = data?.feedback ?? ''
  if (typeof response !== 'string') throw new Error('Unexpected response: missing response')
  if (!isResponseType(responseType)) throw new Error('Unexpected response: invalid response_type')
  return { response, responseType, thinkingQuality: String(thinkingQuality), feedback: String(feedback) }
}

export async function getSessions(sessionId: string): Promise<SessionItem[]> {
  const res = await fetch(`${API_URL}/sessions/${sessionId}`)
  if (!res.ok) throw new Error(`getSessions failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getSessions: unexpected response shape')
  return data as SessionItem[]
}

export async function getMessages(sessionId: string, fileId: string): Promise<MessageItem[]> {
  const res = await fetch(`${API_URL}/sessions/${sessionId}/${fileId}/messages`)
  if (!res.ok) throw new Error(`getMessages failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('getMessages: unexpected response shape')
  return data as MessageItem[]
}
```

- [ ] **Step 2: Create `lib/session.ts`**

```typescript
// nextjs/lib/session.ts
export function getOrCreateSessionId(): string {
  const stored = localStorage.getItem('case_tutor_session_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('case_tutor_session_id', id)
  return id
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/lib/
git commit -m "feat: add API client and session helper to nextjs/lib"
```

---

## Task 5: Create `SessionProvider` with tests

**Files:** `nextjs/providers/SessionProvider.tsx`, `nextjs/providers/__tests__/SessionProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `nextjs/providers/__tests__/SessionProvider.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import SessionProvider, { useSessionId } from '../SessionProvider'

function TestConsumer() {
  const sessionId = useSessionId()
  return <div data-testid="sid">{sessionId}</div>
}

describe('SessionProvider', () => {
  beforeEach(() => localStorage.clear())

  it('reads an existing sessionId from localStorage', async () => {
    localStorage.setItem('case_tutor_session_id', 'existing-abc')
    render(<SessionProvider><TestConsumer /></SessionProvider>)
    await waitFor(() =>
      expect(screen.getByTestId('sid').textContent).toBe('existing-abc')
    )
  })

  it('generates and persists a new sessionId when none exists', async () => {
    render(<SessionProvider><TestConsumer /></SessionProvider>)
    await waitFor(() => {
      const sid = screen.getByTestId('sid').textContent
      expect(sid).toBeTruthy()
      expect(localStorage.getItem('case_tutor_session_id')).toBe(sid)
    })
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run providers/__tests__/SessionProvider.test.tsx
```

Expected: FAIL — `Cannot find module '../SessionProvider'`

- [ ] **Step 3: Create `providers/SessionProvider.tsx`**

```typescript
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
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run providers/__tests__/SessionProvider.test.tsx
```

Expected: 2 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/providers/
git commit -m "feat: add SessionProvider context with tests"
```

---

## Task 6: Create `ThemeToggle` and root `layout.tsx`

**Files:** `nextjs/components/ThemeToggle.tsx`, `nextjs/app/layout.tsx`

No dedicated tests — ThemeToggle is a leaf UI component; layout is wired up in smoke test.

- [ ] **Step 1: Create `components/ThemeToggle.tsx`**

```typescript
// nextjs/components/ThemeToggle.tsx
'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('case_tutor_theme') as 'dark' | 'light' | null
    if (stored) setTheme(stored)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('case_tutor_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-8 h-8 rounded transition-colors"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {theme === 'dark' ? (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.8" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M7 1v1.4M7 11.6V13M1 7h1.4M11.6 7H13M2.7 2.7l1 1M10.3 10.3l1 1M2.7 11.3l1-1M10.3 3.7l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M12 9.5A5.5 5.5 0 015 1.5a5.5 5.5 0 107 8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```typescript
// nextjs/app/layout.tsx
import type { Metadata } from 'next'
import { Playfair_Display, DM_Sans, JetBrains_Mono } from 'next/font/google'
import SessionProvider from '@/providers/SessionProvider'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-dm-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'Case Tutor',
  description: 'AI-powered Socratic tutor for business case analysis',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('case_tutor_theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/components/ThemeToggle.tsx nextjs/app/layout.tsx
git commit -m "feat: add ThemeToggle component and root layout with next/font"
```

---

## Task 7: Port `SessionList` + home page with tests

**Files:** `nextjs/components/SessionList.tsx`, `nextjs/app/page.tsx`, `nextjs/components/__tests__/SessionList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `nextjs/components/__tests__/SessionList.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionProvider from '@/providers/SessionProvider'
import SessionList from '../SessionList'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const sessions = [
  { file_id: 'file-1', file_name: 'airbnb.pdf', last_active_at: '2026-04-27T10:00:00+00:00', message_count: 4 },
  { file_id: 'file-2', file_name: 'stripe.pdf',  last_active_at: '2026-04-26T08:00:00+00:00', message_count: 2 },
]

function renderWithProvider() {
  localStorage.setItem('case_tutor_session_id', 'test-session')
  return render(<SessionProvider><SessionList /></SessionProvider>)
}

describe('SessionList', () => {
  beforeEach(() => { vi.resetAllMocks(); localStorage.clear() })

  it('renders session file names after loading', async () => {
    vi.mocked(api.getSessions).mockResolvedValue(sessions)
    renderWithProvider()
    await waitFor(() => expect(screen.getByText('airbnb.pdf')).toBeInTheDocument())
    expect(screen.getByText('stripe.pdf')).toBeInTheDocument()
  })

  it('renders an empty state when there are no sessions', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([])
    renderWithProvider()
    await waitFor(() => expect(screen.getByText(/no previous sessions/i)).toBeInTheDocument())
  })

  it('navigates to /chat/[fileId] with name param when a session is clicked', async () => {
    vi.mocked(api.getSessions).mockResolvedValue(sessions)
    renderWithProvider()
    await waitFor(() => screen.getByText('airbnb.pdf'))
    fireEvent.click(screen.getByText('airbnb.pdf'))
    expect(mockPush).toHaveBeenCalledWith('/chat/file-1?name=airbnb.pdf')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/SessionList.test.tsx
```

Expected: FAIL — `Cannot find module '../SessionList'`

- [ ] **Step 3: Create `components/SessionList.tsx`**

```typescript
// nextjs/components/SessionList.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSessions, type SessionItem } from '@/lib/api'
import { useSessionId } from '@/providers/SessionProvider'

const mono  = 'var(--font-jetbrains), monospace'
const serif = 'var(--font-playfair), Georgia, serif'

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function SessionList() {
  const sessionId = useSessionId()
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    getSessions(sessionId)
      .then((data) => { setSessions(data); setLoaded(true) })
      .catch(console.error)
  }, [sessionId])

  if (!loaded) return null

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl p-16 text-center" style={{ border: '1px dashed var(--border)' }}>
        <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }} className="text-xl mb-2">
          No previous sessions
        </p>
        <p style={{ fontFamily: mono, color: 'var(--text-faint)', fontSize: '11px', letterSpacing: '0.06em' }} className="uppercase">
          upload a case to begin
        </p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
      {sessions.map((s) => (
        <li key={s.file_id}>
          <button
            type="button"
            onClick={() => router.push(`/chat/${s.file_id}?name=${encodeURIComponent(s.file_name)}`)}
            className="w-full text-left rounded-xl p-5 transition-all duration-200"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--gold-card-h)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <p className="truncate mb-4 text-sm font-medium" style={{ color: 'var(--text)' }}>
              {s.file_name}
            </p>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px', letterSpacing: '0.06em' }} className="uppercase">
                {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
              </span>
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px' }}>
                {formatDate(s.last_active_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Create `app/page.tsx`**

```typescript
// nextjs/app/page.tsx
import Link from 'next/link'
import SessionList from '@/components/SessionList'
import ThemeToggle from '@/components/ThemeToggle'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: serif, color: 'var(--text)' }} className="text-xl">
          Case<em>Tutor</em>
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/upload"
            className="flex items-center gap-2 px-4 py-2 text-sm rounded transition-all"
            style={{ border: '1px solid var(--gold-border)', color: 'var(--gold)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
          >
            new case →
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-8 py-14">
        <h1 style={{ fontFamily: serif, color: 'var(--text)' }} className="text-3xl mb-2">Your Cases</h1>
        <SessionList />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/SessionList.test.tsx
```

Expected: 3 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/components/SessionList.tsx nextjs/app/page.tsx nextjs/components/__tests__/SessionList.test.tsx
git commit -m "feat: add SessionList component and home page"
```

---

## Task 8: Port `FileUpload` + upload page with tests

**Files:** `nextjs/components/FileUpload.tsx`, `nextjs/app/upload/page.tsx`, `nextjs/components/__tests__/FileUpload.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `nextjs/components/__tests__/FileUpload.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FileUpload from '../FileUpload'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

describe('FileUpload', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renders the upload button', () => {
    render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    expect(screen.getByRole('button', { name: /choose pdf/i })).toBeInTheDocument()
  })

  it('calls onUpload with fileId and fileName on successful upload', async () => {
    vi.mocked(api.uploadPdf).mockResolvedValue('file-123')
    const onUpload = vi.fn()
    const { container } = render(<FileUpload sessionId="test-session" onUpload={onUpload} />)
    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('file-123', 'case.pdf'))
  })

  it('shows an error message on upload failure', async () => {
    vi.mocked(api.uploadPdf).mockRejectedValue(new Error('Server error'))
    const { container } = render(<FileUpload sessionId="test-session" onUpload={vi.fn()} />)
    const file = new File(['%PDF-1.4'], 'case.pdf', { type: 'application/pdf' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await waitFor(() =>
      expect(screen.getByText('Upload failed. Check that the backend is running.')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/FileUpload.test.tsx
```

Expected: FAIL — `Cannot find module '../FileUpload'`

- [ ] **Step 3: Create `components/FileUpload.tsx`** (ported from frontend, import path updated)

```typescript
// nextjs/components/FileUpload.tsx
'use client'

import { useRef, useState } from 'react'
import { uploadPdf } from '@/lib/api'

interface Props {
  sessionId: string
  onUpload: (fileId: string, fileName: string) => void
}

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function FileUpload({ sessionId, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus]     = useState<'idle' | 'uploading' | 'error'>('idle')
  const [error, setError]       = useState('')
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.')
      setStatus('error')
      return
    }
    setStatus('uploading')
    setError('')
    try {
      const fileId = await uploadPdf(file, sessionId)
      onUpload(fileId, file.name)
    } catch {
      setError('Upload failed. Check that the backend is running.')
      setStatus('error')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const uploading = status === 'uploading'

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className="flex flex-col items-center gap-7 px-10 py-16 rounded-2xl transition-all duration-300 cursor-pointer"
      style={{
        border: dragging ? '2px dashed var(--gold-border-h)' : '2px dashed var(--border)',
        background: dragging ? 'var(--gold-bg-h)' : 'var(--upload-bg)',
        opacity: uploading ? 0.6 : 1,
        pointerEvents: uploading ? 'none' : 'auto',
      }}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300"
        style={{ border: `1px solid ${dragging ? 'var(--gold-border)' : 'var(--upload-icon-b)'}` }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"
          style={{ color: dragging ? 'var(--gold)' : 'var(--upload-icon)', transition: 'color 0.3s' }}
        >
          <path d="M11 4v11M11 4L7.5 7.5M11 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.5 16v1.5A1.5 1.5 0 005 19h12a1.5 1.5 0 001.5-1.5V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="text-center">
        <p style={{ fontFamily: serif, color: 'var(--text)' }} className="text-2xl mb-1">
          {uploading ? 'Processing…' : 'Drop your case here'}
        </p>
        <p style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.07em' }} className="uppercase">
          {uploading ? 'indexing document' : 'or click to browse'}
        </p>
      </div>
      <button
        type="button"
        disabled={uploading}
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
        className="px-5 py-2 rounded text-sm transition-all duration-200"
        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        {uploading ? 'Uploading…' : 'Choose PDF'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {error && (
        <p style={{ color: 'var(--error-text)', fontFamily: mono, fontSize: '12px' }}>{error}</p>
      )}
      <a
        href="/sample.pdf"
        download="sample-case.pdf"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.05em', textDecoration: 'none' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        ↓ download sample case
      </a>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/upload/page.tsx`**

```typescript
// nextjs/app/upload/page.tsx
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
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/FileUpload.test.tsx
```

Expected: 3 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/components/FileUpload.tsx nextjs/app/upload/ nextjs/components/__tests__/FileUpload.test.tsx
git commit -m "feat: add FileUpload component and upload page"
```

---

## Task 9: Port `Chat` + chat page with tests

**Files:** `nextjs/components/Chat.tsx`, `nextjs/app/chat/[fileId]/page.tsx`, `nextjs/components/__tests__/Chat.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `nextjs/components/__tests__/Chat.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Chat from '../Chat'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

describe('Chat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.getMessages).mockResolvedValue([])
  })

  it('renders the empty state prompt', async () => {
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() =>
      expect(screen.getByText('Ask your first question about the case')).toBeInTheDocument()
    )
  })

  it('loads conversation history on mount', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([
      { role: 'user', content: 'Hello from history' },
      { role: 'assistant', content: 'Hi there, history reply' },
    ])
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(screen.getByText('Hello from history')).toBeInTheDocument())
    expect(screen.getByText('Hi there, history reply')).toBeInTheDocument()
  })

  it('restores evaluator badges from history', async () => {
    vi.mocked(api.getMessages).mockResolvedValue([
      { role: 'user', content: 'What drove growth?' },
      { role: 'assistant', content: 'Good thinking.', thinking_quality: 'insightful', feedback: 'Nice connection.' },
    ])
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(screen.getByText(/insightful/i)).toBeInTheDocument())
    expect(screen.getByText('Nice connection.')).toBeInTheDocument()
  })

  it('submits a message and displays the assistant reply', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'What do you think drove their growth?',
      responseType: 'socratic_response',
      thinkingQuality: 'developing',
      feedback: 'Try connecting this to the competitive landscape.',
    })
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox'), 'Tell me about Airbnb')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('What do you think drove their growth?')).toBeInTheDocument()
    )
  })

  it('calls sendMessage with fileId, sessionId, and message', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Good question.',
      responseType: 'socratic_response',
      thinkingQuality: 'developing',
      feedback: '',
    })
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox'), 'My question')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled())
    expect(vi.mocked(api.sendMessage).mock.calls[0]).toEqual(['file-1', 'test-session', 'My question'])
  })

  it('shows a clarification label when responseType is clarification', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Are you asking about the financial side?',
      responseType: 'clarification',
      thinkingQuality: 'developing',
      feedback: 'Good start.',
    })
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox'), 'Why did it fail?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText('Clarifying question')).toBeInTheDocument())
  })

  it('shows an error message when the API call fails', async () => {
    vi.mocked(api.sendMessage).mockRejectedValue(new Error('Network error'))
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() =>
      expect(screen.getByText('Error: could not reach the backend.')).toBeInTheDocument()
    )
  })

  it('shows thinking quality badge on user message after response', async () => {
    vi.mocked(api.sendMessage).mockResolvedValue({
      response: 'Good question.',
      responseType: 'socratic_response',
      thinkingQuality: 'insightful',
      feedback: 'Great connection to the competitive landscape.',
    })
    render(<Chat fileId="file-1" sessionId="test-session" />)
    await waitFor(() => expect(api.getMessages).toHaveBeenCalled())
    await userEvent.type(screen.getByRole('textbox'), 'What drove their growth?')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText(/insightful/i)).toBeInTheDocument())
    expect(screen.getByText('Great connection to the competitive landscape.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/Chat.test.tsx
```

Expected: FAIL — `Cannot find module '../Chat'`

- [ ] **Step 3: Create `components/Chat.tsx`** (ported from frontend, imports and font vars updated)

```typescript
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
```

- [ ] **Step 4: Create `app/chat/[fileId]/page.tsx`**

```typescript
// nextjs/app/chat/[fileId]/page.tsx
'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Chat from '@/components/Chat'
import ThemeToggle from '@/components/ThemeToggle'
import { useSessionId } from '@/providers/SessionProvider'

const serif = 'var(--font-playfair), Georgia, serif'
const mono  = 'var(--font-jetbrains), monospace'

export default function ChatPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = use(params)
  const sessionId = useSessionId()
  const searchParams = useSearchParams()
  const fileName = searchParams.get('name') ?? 'Case Study'

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="shrink-0 px-8 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: '12px', letterSpacing: '0.04em', textDecoration: 'none' }}
            className="shrink-0"
          >
            ← cases
          </Link>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ fontFamily: serif, color: 'var(--text-secondary)', fontStyle: 'italic' }} className="text-sm truncate">
            {fileName.replace(/\.pdf$/i, '')}
          </span>
        </div>
        <ThemeToggle />
      </header>
      <Chat fileId={fileId} sessionId={sessionId} />
    </div>
  )
}
```

- [ ] **Step 5: Install `react-markdown`** (needed by Chat.tsx)

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npm install react-markdown
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run components/__tests__/Chat.test.tsx
```

Expected: 7 tests pass

- [ ] **Step 7: Run the full test suite**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npx vitest run
```

Expected: All tests pass (SessionProvider + SessionList + FileUpload + Chat)

- [ ] **Step 8: Commit**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/components/Chat.tsx nextjs/app/chat/ nextjs/components/__tests__/Chat.test.tsx nextjs/package.json nextjs/package-lock.json
git commit -m "feat: add Chat component and chat page — all tests passing"
```

---

## Task 10: Build check and smoke test

**Files:** none created — validation only

- [ ] **Step 1: Run a production build to catch type errors**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npm run build
```

Expected: build completes with no errors. Fix any TypeScript errors before continuing.

- [ ] **Step 2: Start the dev server**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor/nextjs
npm run dev
```

Open http://localhost:3000 and verify:
- [ ] Home page loads, shows "CaseTutor" header and "new case →" link
- [ ] "new case →" navigates to `/upload`
- [ ] Upload page shows drag-and-drop zone and "← cases" link
- [ ] "← cases" returns to `/`
- [ ] Upload a PDF → redirects to `/chat/[fileId]` with filename in header
- [ ] Chat page shows empty state, accepts messages, renders tutor replies with markdown
- [ ] Evaluator badges (insightful / developing / shallow) appear below user messages
- [ ] Theme toggle switches between dark and light — no flash on reload
- [ ] Browser back button works between all pages

- [ ] **Step 3: Commit final state**

```bash
cd /Users/niklausgeisseraguilar/Documents/unosquare/case-tutor
git add nextjs/
git commit -m "feat: complete Next.js migration — build passing, smoke test done"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Parallel `nextjs/` folder — Task 1
- ✅ App Router routes `/`, `/upload`, `/chat/[fileId]` — Tasks 7–9
- ✅ `SessionProvider` context for localStorage sessionId — Task 5
- ✅ All components `'use client'` — Tasks 7–9
- ✅ Tailwind CSS 4 via `@tailwindcss/postcss` — Task 2
- ✅ CSS variables / dark-light theme unchanged — Task 2
- ✅ `next/font/google` for Playfair Display, DM Sans, JetBrains Mono — Task 6
- ✅ Theme flash prevention script in `layout.tsx` — Task 6
- ✅ `NEXT_PUBLIC_API_URL` (was `VITE_API_URL`) — Task 4
- ✅ Vitest + React Testing Library — Task 3
- ✅ `sample.pdf` in `nextjs/public/` — Task 1
- ✅ FastAPI backend untouched — (no backend tasks)
- ✅ Navigation via `useRouter().push()` and `<Link>` — Tasks 7–9
- ✅ Filename passed via URL search param `?name=` — Tasks 8–9
