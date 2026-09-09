// Plain line logger — the worker runs as a service, so every line carries a timestamp.

const ts = () => new Date().toISOString().slice(11, 19)

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`${ts()}  ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`${ts()}  ! ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`${ts()}  ✗ ${msg}`, ...rest),
}

/** Run at most `size` promises at once (Orchestrator slows down under a burst of folder queries). */
export async function pooled<A, R>(items: A[], size: number, fn: (item: A) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker))
  return out
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
