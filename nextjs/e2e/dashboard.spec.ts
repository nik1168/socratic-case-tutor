import { test, expect, type Page } from '@playwright/test'
import { API_URL as API } from '../playwright.config'

const defaultOverview = {
  total_sessions: 5,
  total_messages: 42,
  quality_distribution: { shallow: 6, developing: 20, insightful: 9 },
}

const defaultQualityTime = [
  { date: '2026-04-25', shallow: 2, developing: 3, insightful: 1 },
  { date: '2026-04-26', shallow: 1, developing: 5, insightful: 2 },
  { date: '2026-04-27', shallow: 3, developing: 12, insightful: 6 },
]

// airbnb is MORE RECENT (Apr 27), stripe has MORE MESSAGES (14 vs 8)
// → sort by date puts airbnb first; sort by messages puts stripe first
const defaultSessions = [
  {
    session_id: 's1', file_id: 'f1', file_name: 'airbnb.pdf',
    last_active_at: '2026-04-27T10:00:00Z',
    message_count: 8, shallow: 2, developing: 5, insightful: 3,
  },
  {
    session_id: 's2', file_id: 'f2', file_name: 'stripe.pdf',
    last_active_at: '2026-04-26T08:00:00Z',
    message_count: 14, shallow: 3, developing: 7, insightful: 4,
  },
]

const defaultFiles = [
  { file_id: 'f1', file_name: 'airbnb.pdf', session_count: 1, message_count: 8,  shallow: 2, developing: 5, insightful: 3 },
  { file_id: 'f2', file_name: 'stripe.pdf', session_count: 1, message_count: 14, shallow: 3, developing: 7, insightful: 4 },
]

async function setupMocks(page: Page, overrides: {
  overview?:    object
  qualityTime?: object[]
  sessions?:    object[]
  files?:       object[]
} = {}) {
  const ov  = overrides.overview    ?? defaultOverview
  const qt  = overrides.qualityTime ?? defaultQualityTime
  const ses = overrides.sessions    ?? defaultSessions
  const fs  = overrides.files       ?? defaultFiles

  await page.route(`${API}/sessions/*`,                  (r) => r.fulfill({ json: [] }))
  await page.route(`${API}/analytics/overview`,          (r) => r.fulfill({ json: ov  }))
  await page.route(`${API}/analytics/quality-over-time`, (r) => r.fulfill({ json: qt  }))
  await page.route(`${API}/analytics/sessions`,          (r) => r.fulfill({ json: ses }))
  await page.route(`${API}/analytics/files`,             (r) => r.fulfill({ json: fs  }))
}

test('navigates from home page to dashboard via nav link', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'dashboard →' }).click()
  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText('Faculty Dashboard')).toBeVisible()
})

test('stat cards display totals from the API', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/dashboard')
  await expect(page.getByTestId('stat-total-sessions')).toHaveText('5')
  await expect(page.getByTestId('stat-total-messages')).toHaveText('42')
})

test('badge reflects the dominant thinking quality', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/dashboard')
  // developing (20) > insightful (9) > shallow (6) in defaultOverview
  await expect(page.getByTestId('badge-top-level')).toHaveText('developing')
})

test('sort by Messages reorders the sessions table', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/dashboard')
  // Default sort is last_active_at: airbnb (Apr 27) is first
  const rows = page.getByTestId('sessions-table').locator('tbody tr')
  await expect(rows.first()).toContainText('airbnb')
  // Switching to Messages sort: stripe (14 msgs) should move to first
  await page.getByRole('button', { name: 'Messages' }).click()
  await expect(rows.first()).toContainText('stripe')
})

test('shows empty-state messages when API returns no data', async ({ page }) => {
  await setupMocks(page, {
    overview:    { total_sessions: 0, total_messages: 0, quality_distribution: { shallow: 0, developing: 0, insightful: 0 } },
    qualityTime: [],
    sessions:    [],
    files:       [],
  })
  await page.goto('/dashboard')
  await expect(page.getByText('No data yet.').first()).toBeVisible()
  await expect(page.getByText('No sessions yet.')).toBeVisible()
  await expect(page.getByTestId('badge-top-level')).not.toBeAttached()
})
