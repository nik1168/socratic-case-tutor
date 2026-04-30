# Next.js Migration Design

**Date:** 2026-04-30
**Status:** Approved
**Scope:** Rewrite the `frontend/` React+Vite app as a Next.js 15 App Router app in a parallel `nextjs/` folder

---

## Context

The CaseTutor frontend is currently a React 19 + Vite + TypeScript SPA (~891 lines) with four components, no routing library, and manual view-switching via a `view` state variable. The backend is a FastAPI app deployed on Railway.

The goal is to migrate to Next.js to demonstrate App Router patterns (server components, file-based routing, `next/font`) while keeping the FastAPI backend untouched.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Location | Parallel `nextjs/` folder | Keep `frontend/` live until migration is validated |
| API layer | Direct client calls to FastAPI | No proxy — FastAPI is the real product, Next.js is pure UI |
| Routing | App Router with real URLs | Use Next.js strengths; enables back button and deep links |
| Server components | Root layout and page shells only for v1 | `SessionList` needs `sessionId` from localStorage — true server fetch requires cookies (future iteration) |
| Styling | Port Tailwind CSS 4 + CSS variables unchanged | Same visual identity, no redesign |
| Extra libraries | None (no shadcn/ui, no Turborepo) | Focused scope — demonstrate Next.js, not framework sprawl |

---

## File Structure

```
nextjs/
├── app/
│   ├── layout.tsx              # Root layout: fonts, theme script, SessionProvider
│   ├── page.tsx                # / — session list (SERVER component)
│   ├── upload/
│   │   └── page.tsx            # /upload — file upload (CLIENT component)
│   ├── chat/
│   │   └── [fileId]/
│   │       └── page.tsx        # /chat/[fileId] — chat view (CLIENT component)
│   └── globals.css             # CSS variables + Tailwind (ported from frontend)
├── components/
│   ├── SessionList.tsx         # 'use client' — fetches sessions on mount
│   ├── Chat.tsx                # 'use client' — state, events, markdown
│   └── FileUpload.tsx          # 'use client' — drag-and-drop, upload progress
├── lib/
│   ├── api.ts                  # API client (ported from frontend/src/api.ts)
│   └── session.ts              # sessionId read/write helpers (localStorage)
├── providers/
│   └── SessionProvider.tsx     # 'use client' context — sessionId via localStorage
├── public/
│   └── sample.pdf              # Copied from frontend/public/
├── next.config.ts
├── package.json
├── tsconfig.json
└── .env.local
```

---

## Routing

### Routes

| URL | File | Rendering | API calls |
|---|---|---|---|
| `/` | `app/page.tsx` | Server shell + client `SessionList` | `GET /sessions/{sessionId}` (client-side on mount) |
| `/upload` | `app/upload/page.tsx` | Client | `POST /upload` |
| `/chat/[fileId]` | `app/chat/[fileId]/page.tsx` | Client | `GET /sessions/{sessionId}/{fileId}/messages`, `POST /chat` |

### Navigation flow

```
/ ──"New Case"──▶ /upload ──upload success──▶ /chat/[fileId]
│
└──click session──▶ /chat/[fileId]
```

Navigation inside client components uses `useRouter().push()`. Static links use `<Link href="...">`.

---

## Component Architecture

### `SessionList` — Client Component

- `'use client'` directive
- Fetches sessions from FastAPI on mount, once `sessionId` is available from `SessionProvider` context
- Renders the session grid with loading and empty states
- **Why not a server component?** Server components can't access `localStorage`, and `sessionId` lives there. Elevating to a true server component would require storing `sessionId` in a cookie so the server can read it via `next/headers` — that's a clean future improvement, but out of scope for v1.

### `Chat` — Client Component

- `'use client'` directive
- Reads `fileId` from route params (passed as a prop from the page)
- Reads `sessionId` from `SessionProvider` context
- Loads message history on mount, sends messages, renders markdown
- Evaluator badges (thinking quality, feedback) — same as today

### `FileUpload` — Client Component

- `'use client'` directive
- Drag-and-drop, file type validation, upload progress
- On success: calls `useRouter().push('/chat/' + fileId)`

### `SessionProvider` — Client Context

- `'use client'` wrapper in `layout.tsx`
- Generates or reads `sessionId` from `localStorage` on mount
- Exposes `sessionId` via React context to all client components
- Prevents the server components from needing localStorage access

---

## Styling & Theming

- **Tailwind CSS 4** via `@tailwindcss/postcss` (Next.js 15 compatible)
- **CSS custom properties** — dark/light theme via `data-theme` on `<html>` — ported unchanged into `globals.css`
- **Google Fonts** — `Playfair Display`, `DM Sans`, `JetBrains Mono` loaded via `next/font/google` in `layout.tsx`. Next.js self-hosts them at build time (no external network request, no FOUT)
- **Theme flash prevention** — inline `<script>` injected in `layout.tsx` `<head>` (same IIFE logic as current `index.html`)
- **Environment variable** — `VITE_API_URL` renamed to `NEXT_PUBLIC_API_URL`

---

## sessionId Across Server and Client

`sessionId` is browser-generated and persisted in `localStorage`. Server components cannot access `localStorage`, which is why all three data-fetching components (`SessionList`, `Chat`, `FileUpload`) are client components in v1.

- `SessionProvider` (client context in `layout.tsx`) generates or reads `sessionId` from `localStorage` on mount and exposes it via React context
- All components that need `sessionId` consume it from that context
- The root `layout.tsx` and `app/page.tsx` are server components for the static HTML shell only — they don't fetch user-specific data

**Future improvement:** Store `sessionId` in a cookie (set by `SessionProvider` alongside localStorage). Then `app/page.tsx` can read it via `cookies()` from `next/headers` and pass it to a true async server `SessionList` that fetches data at render time. This would demonstrate the full server component pattern but adds complexity not needed for v1.

---

## Testing

- **Framework:** Vitest + React Testing Library (unchanged)
- **Environment:** `jsdom` — same Vitest config as today
- **Existing tests** for `Chat`, `FileUpload`, `SessionList` port over with:
  - Updated import paths
  - `VITE_API_URL` → `NEXT_PUBLIC_API_URL` in test setup
- **`SessionList` server component test:** mock the fetch, assert rendered output — same pattern as current API mocks

---

## What Does NOT Change

- FastAPI backend — untouched
- Railway deployment for the backend
- All API endpoint contracts
- Visual design — same colors, fonts, component layouts
- Evaluator badges and thinking quality indicators
- `sample.pdf` in public folder

---

## Out of Scope

- Moving FastAPI logic into Next.js API routes
- Adding shadcn/ui or other component libraries
- Turborepo or monorepo tooling
- Authentication
- Any changes to iteration 2–4 backend features
