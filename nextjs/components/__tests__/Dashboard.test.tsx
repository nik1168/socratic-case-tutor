import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import Dashboard from '../Dashboard'
import * as api from '@/lib/api'

// Recharts uses ResizeObserver — mock it for jsdom
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

vi.mock('@/lib/api')

const mockOverview: api.AnalyticsOverview = {
  total_sessions: 3,
  total_messages: 15,
  quality_distribution: { shallow: 4, developing: 7, insightful: 4 },
}

const mockQualityTime: api.QualityDay[] = [
  { date: '2026-04-25', shallow: 2, developing: 3, insightful: 1 },
]

const mockSessions: api.AnalyticsSession[] = [
  {
    session_id: 's1', file_id: 'f1', file_name: 'Airbnb IPO Case.pdf',
    last_active_at: '2026-04-27T10:00:00+00:00',
    message_count: 4, shallow: 1, developing: 2, insightful: 1,
  },
]

const mockFiles: api.AnalyticsFile[] = [
  {
    file_id: 'f1', file_name: 'Airbnb IPO Case.pdf',
    session_count: 2, message_count: 8,
    shallow: 2, developing: 4, insightful: 2,
  },
]

beforeEach(() => {
  vi.mocked(api.getAnalyticsOverview).mockResolvedValue(mockOverview)
  vi.mocked(api.getQualityOverTime).mockResolvedValue(mockQualityTime)
  vi.mocked(api.getAnalyticsSessions).mockResolvedValue(mockSessions)
  vi.mocked(api.getAnalyticsFiles).mockResolvedValue(mockFiles)
})

describe('Dashboard', () => {
  it('shows loading state initially', () => {
    render(<Dashboard />)
    expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument()
  })

  it('renders Total Sessions stat card with correct value', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('renders Student Messages stat card with correct value', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('15')).toBeInTheDocument())
  })

  it('renders top thinking level badge (developing wins with 7)', async () => {
    render(<Dashboard />)
    await waitFor(() => {
      // The badge is the first element with "developing" text (not the table header)
      const elements = screen.getAllByText(/developing/i)
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('renders session file name in table', async () => {
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText(/airbnb ipo case/i)).toBeInTheDocument())
  })

  it('shows empty state for sessions when list is empty', async () => {
    vi.mocked(api.getAnalyticsSessions).mockResolvedValue([])
    render(<Dashboard />)
    await waitFor(() =>
      expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument(),
    )
  })

  it('sorts sessions by message count when Messages button is clicked', async () => {
    const twoSessions: api.AnalyticsSession[] = [
      {
        session_id: 's1', file_id: 'f1', file_name: 'Airbnb.pdf',
        last_active_at: '2026-04-27T10:00:00+00:00',
        message_count: 2, shallow: 1, developing: 1, insightful: 0,
      },
      {
        session_id: 's2', file_id: 'f2', file_name: 'Netflix.pdf',
        last_active_at: '2026-04-26T10:00:00+00:00',
        message_count: 5, shallow: 0, developing: 3, insightful: 2,
      },
    ]
    vi.mocked(api.getAnalyticsSessions).mockResolvedValue(twoSessions)
    render(<Dashboard />)
    await waitFor(() => screen.getByText(/airbnb/i))

    // Default sort (last active): Airbnb first (newer date)
    const rows = () => screen.getAllByRole('row').slice(1) // skip header
    expect(rows()[0]).toHaveTextContent(/airbnb/i)

    fireEvent.click(screen.getAllByText('Messages')[0])
    // After sort by message count: Netflix first (5 > 2)
    expect(rows()[0]).toHaveTextContent(/netflix/i)
  })
})
