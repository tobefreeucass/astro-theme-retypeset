import records from '@/data/site-status.json'
import { shanghaiDay } from '@/utils/shanghai-time'

interface StatusEvent {
  at: string
  type: 'incident' | 'recovery'
  summary?: string
}

export const statusEnabled = records.enabled
export const statusEvents = records.events as StatusEvent[]
export const lastStatusEvent = statusEvents.at(-1)
export const hasIncident = lastStatusEvent?.type === 'incident'

const dayMs = 86_400_000
const intervals = statusEvents.flatMap((event, index) => event.type === 'incident'
  ? [{ start: Date.parse(event.at), end: Date.parse(statusEvents[index + 1]?.at ?? '') || Infinity }]
  : [])

export function getStatusDays(now = new Date()) {
  const today = Date.parse(`${shanghaiDay(now)}T00:00:00+08:00`)
  return Array.from({ length: 30 }, (_, index) => {
    const start = today - (29 - index) * dayMs
    return {
      date: shanghaiDay(new Date(start)),
      incident: intervals.some(interval => interval.start < start + dayMs && interval.end > start),
    }
  })
}
