import { addDays, addHours, format, startOfDay, startOfHour } from 'date-fns'

export interface Bucket {
  start: Date
  label: string
}

export type BucketUnit = 'hour' | 'day'

/** Pick a bucket size that yields a readable number of bars for the range. */
function bucketUnitFor(from: Date, to: Date): BucketUnit {
  const hours = (to.getTime() - from.getTime()) / 3600_000
  return hours <= 49 ? 'hour' : 'day'
}

export function buildBuckets(from: Date, to: Date): { unit: BucketUnit; buckets: Bucket[] } {
  const unit = bucketUnitFor(from, to)
  const buckets: Bucket[] = []
  if (unit === 'hour') {
    for (let d = startOfHour(from); d <= to; d = addHours(d, 1)) {
      buckets.push({ start: d, label: format(d, 'HH:mm') })
    }
  } else {
    for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
      buckets.push({ start: d, label: format(d, 'dd.MM.') })
    }
  }
  return { unit, buckets }
}

export function bucketIndexOf(time: Date, from: Date, unit: BucketUnit, count: number): number {
  const anchor = unit === 'hour' ? startOfHour(from) : startOfDay(from)
  const span = unit === 'hour' ? 3600_000 : 24 * 3600_000
  const idx = Math.floor((time.getTime() - anchor.getTime()) / span)
  return idx >= 0 && idx < count ? idx : -1
}

/** Format a Date for a `<input type="date">` (local date). */
export function toDateInputValue(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/**
 * Keep a custom window inside [earliest, latest]: `to` never exceeds the last
 * published moment, `from` never exceeds `to`.
 */
export function clampWindow(from: Date, to: Date, latest: Date): { from: Date; to: Date } {
  const t = to > latest ? latest : to
  const f = from > t ? new Date(t.getTime() - 24 * 3600_000) : from
  return { from: f, to: t }
}
