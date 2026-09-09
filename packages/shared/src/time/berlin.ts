// Business days are Europe/Berlin days, both in SQL (generated column) and
// here. Everything that assigns a record to a day goes through this file so the
// two can never disagree.

const TZ = 'Europe/Berlin'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** `2026-09-09T00:30:00Z` → `2026-09-09` (Berlin is UTC+2 in summer). */
export function berlinDay(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return dayFmt.format(d)
}

function berlinWallClock(d: Date): { y: number; m: number; day: number; h: number; min: number; s: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, day: +p.day, h: +p.hour, min: +p.minute, s: +p.second }
}

/** UTC instant of 00:00 Europe/Berlin on the given YYYY-MM-DD. */
export function berlinDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  // Guess UTC midnight, read the Berlin wall clock at that instant, and shift by
  // the difference. One correction is enough because the offset is constant
  // within the hour around midnight (DST switches at 02:00/03:00).
  const guess = Date.UTC(y, m - 1, d)
  const wall = berlinWallClock(new Date(guess))
  const wallAsUtc = Date.UTC(wall.y, wall.m - 1, wall.day, wall.h, wall.min, wall.s)
  return new Date(guess - (wallAsUtc - guess))
}

/** UTC instant of the first moment of the following Berlin day. */
export function berlinDayEnd(day: string): Date {
  return berlinDayStart(addDays(day, 1))
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export function todayBerlin(now: Date = new Date()): string {
  return berlinDay(now)
}
