import { addDays, addHours, format, startOfDay, startOfHour } from 'date-fns'

export interface Bucket {
  start: Date
  label: string
}

export type BucketUnit = 'hour' | 'day'

/** Pick a bucket size that yields a readable number of bars for the range. */
export function bucketUnitFor(from: Date, to: Date): BucketUnit {
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
      buckets.push({ start: d, label: format(d, 'dd MMM') })
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

/** Format a Date for a datetime-local input (local time, minute precision). */
export function toInputValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}
