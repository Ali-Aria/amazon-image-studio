import { describe, expect, it } from 'vitest'
import { RetailGenerationQueue } from './retailQueue'

type Item = { id: string }

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('retail generation queue', () => {
  it('never runs more than the configured concurrency', async () => {
    const gates = new Map<string, ReturnType<typeof deferred>>()
    let active = 0
    let peak = 0
    const queue = new RetailGenerationQueue<Item>(async (item) => {
      active += 1
      peak = Math.max(peak, active)
      const gate = deferred()
      gates.set(item.id, gate)
      await gate.promise
      active -= 1
    }, { concurrency: 2 })

    queue.enqueue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    await Promise.resolve()
    expect([...gates]).toHaveLength(2)
    expect(peak).toBe(2)

    gates.get('a')!.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(gates.has('c')).toBe(true)
    gates.get('b')!.resolve()
    gates.get('c')!.resolve()
    await queue.waitForIdle()
    expect(queue.getSnapshot().every((item) => item.status === 'done')).toBe(true)
  })

  it('pauses new work without cancelling in-flight work and resumes later', async () => {
    const gate = deferred()
    const started: string[] = []
    const queue = new RetailGenerationQueue<Item>(async (item) => {
      started.push(item.id)
      if (item.id === 'a') await gate.promise
    }, { concurrency: 1 })

    queue.enqueue([{ id: 'a' }, { id: 'b' }])
    await Promise.resolve()
    queue.pause()
    gate.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['a'])

    queue.resume()
    await queue.waitForIdle()
    expect(started).toEqual(['a', 'b'])
  })

  it('keeps processing after a failure and can retry only the failed item', async () => {
    const attempts = new Map<string, number>()
    const queue = new RetailGenerationQueue<Item>(async (item) => {
      const count = (attempts.get(item.id) ?? 0) + 1
      attempts.set(item.id, count)
      if (item.id === 'a' && count === 1) throw new Error('failed once')
    }, { concurrency: 1 })

    queue.enqueue([{ id: 'a' }, { id: 'b' }])
    await queue.waitForIdle()
    expect(queue.getSnapshot().map((item) => item.status)).toEqual(['error', 'done'])

    queue.retry('a')
    await queue.waitForIdle()
    expect(queue.getSnapshot().map((item) => item.status)).toEqual(['done', 'done'])
    expect(attempts.get('a')).toBe(2)
  })
})
