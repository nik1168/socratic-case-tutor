import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  uploadPdf,
  sendMessage,
  getSessions,
  getMessages,
  getAnalyticsOverview,
  getQualityOverTime,
  getAnalyticsSessions,
  getAnalyticsFiles,
} from '@/lib/api'

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(data),
  } as Response)
}

afterEach(() => vi.restoreAllMocks())

describe('uploadPdf', () => {
  it('returns file_id on success', async () => {
    mockFetch({ file_id: 'abc-123' })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    expect(await uploadPdf(file, 'session-1')).toBe('abc-123')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 400)
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    await expect(uploadPdf(file, 'session-1')).rejects.toThrow('Upload failed')
  })

  it('throws when file_id is missing from response', async () => {
    mockFetch({ other: 'data' })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    await expect(uploadPdf(file, 'session-1')).rejects.toThrow('missing file_id')
  })

  it('throws when file_id is an empty string', async () => {
    mockFetch({ file_id: '' })
    const file = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })
    await expect(uploadPdf(file, 'session-1')).rejects.toThrow('missing file_id')
  })
})

describe('sendMessage', () => {
  it('returns parsed response on success', async () => {
    mockFetch({ response: 'Good question', response_type: 'socratic_response', thinking_quality: 'developing', feedback: 'Keep going.' })
    const result = await sendMessage('file-1', 'session-1', 'Why?')
    expect(result.response).toBe('Good question')
    expect(result.responseType).toBe('socratic_response')
    expect(result.thinkingQuality).toBe('developing')
    expect(result.feedback).toBe('Keep going.')
  })

  it('defaults thinkingQuality and feedback to empty string when absent', async () => {
    mockFetch({ response: 'Hello', response_type: 'clarification' })
    const result = await sendMessage('file-1', 'session-1', 'Why?')
    expect(result.thinkingQuality).toBe('')
    expect(result.feedback).toBe('')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(sendMessage('file-1', 'session-1', 'Hello')).rejects.toThrow('Chat failed')
  })

  it('throws when response field is missing', async () => {
    mockFetch({ response_type: 'socratic_response' })
    await expect(sendMessage('file-1', 'session-1', 'Hello')).rejects.toThrow('missing response')
  })

  it('throws on invalid response_type', async () => {
    mockFetch({ response: 'Hello', response_type: 'not_a_valid_type' })
    await expect(sendMessage('file-1', 'session-1', 'Hello')).rejects.toThrow('invalid response_type')
  })
})

describe('getSessions', () => {
  it('returns session array on success', async () => {
    const data = [{ file_id: 'f1', file_name: 'case.pdf', last_active_at: '2026-01-01', message_count: 3 }]
    mockFetch(data)
    expect(await getSessions('session-1')).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 404)
    await expect(getSessions('session-1')).rejects.toThrow('getSessions failed')
  })

  it('throws when response is not an array', async () => {
    mockFetch({ sessions: [] })
    await expect(getSessions('session-1')).rejects.toThrow('unexpected response shape')
  })
})

describe('getMessages', () => {
  it('returns message array on success', async () => {
    const data = [{ role: 'user', content: 'Hello' }]
    mockFetch(data)
    expect(await getMessages('session-1', 'file-1')).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 404)
    await expect(getMessages('session-1', 'file-1')).rejects.toThrow('getMessages failed')
  })

  it('throws when response is not an array', async () => {
    mockFetch({ messages: [] })
    await expect(getMessages('session-1', 'file-1')).rejects.toThrow('unexpected response shape')
  })
})

describe('getAnalyticsOverview', () => {
  it('returns overview data on success', async () => {
    const data = { total_sessions: 5, total_messages: 20, quality_distribution: { shallow: 2, developing: 10, insightful: 8 } }
    mockFetch(data)
    expect(await getAnalyticsOverview()).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(getAnalyticsOverview()).rejects.toThrow('getAnalyticsOverview failed')
  })
})

describe('getQualityOverTime', () => {
  it('returns array on success', async () => {
    const data = [{ date: '2026-01-01', shallow: 1, developing: 2, insightful: 3 }]
    mockFetch(data)
    expect(await getQualityOverTime()).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(getQualityOverTime()).rejects.toThrow('getQualityOverTime failed')
  })

  it('throws when response is not an array', async () => {
    mockFetch({ data: [] })
    await expect(getQualityOverTime()).rejects.toThrow('unexpected response shape')
  })
})

describe('getAnalyticsSessions', () => {
  it('returns array on success', async () => {
    const data = [{ session_id: 's1', file_id: 'f1', file_name: 'case.pdf', last_active_at: '2026-01-01', message_count: 3, shallow: 1, developing: 1, insightful: 1 }]
    mockFetch(data)
    expect(await getAnalyticsSessions()).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(getAnalyticsSessions()).rejects.toThrow('getAnalyticsSessions failed')
  })

  it('throws when response is not an array', async () => {
    mockFetch({ data: [] })
    await expect(getAnalyticsSessions()).rejects.toThrow('unexpected response shape')
  })
})

describe('getAnalyticsFiles', () => {
  it('returns array on success', async () => {
    const data = [{ file_id: 'f1', file_name: 'case.pdf', session_count: 2, message_count: 8, shallow: 2, developing: 4, insightful: 2 }]
    mockFetch(data)
    expect(await getAnalyticsFiles()).toEqual(data)
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(getAnalyticsFiles()).rejects.toThrow('getAnalyticsFiles failed')
  })

  it('throws when response is not an array', async () => {
    mockFetch({ data: [] })
    await expect(getAnalyticsFiles()).rejects.toThrow('unexpected response shape')
  })
})
