export type RetailQueueStatus = 'queued' | 'running' | 'done' | 'error'

export interface RetailQueueSnapshotItem<T> {
  id: string
  item: T
  status: RetailQueueStatus
  error: string | null
}

interface QueueOptions<T> {
  concurrency?: number
  onChange?: (items: RetailQueueSnapshotItem<T>[]) => void
}

export class RetailGenerationQueue<T extends { id: string }> {
  private readonly worker: (item: T) => Promise<void>
  private readonly concurrency: number
  private readonly onChange?: (items: RetailQueueSnapshotItem<T>[]) => void
  private entries: RetailQueueSnapshotItem<T>[] = []
  private running = 0
  private paused = false
  private idleResolvers: Array<() => void> = []

  constructor(worker: (item: T) => Promise<void>, options: QueueOptions<T> = {}) {
    this.worker = worker
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2))
    this.onChange = options.onChange
  }

  enqueue(items: T[]) {
    for (const item of items) {
      const existing = this.entries.find((entry) => entry.id === item.id)
      if (existing) {
        if (existing.status === 'done' || existing.status === 'running') continue
        existing.item = item
        existing.status = 'queued'
        existing.error = null
      } else {
        this.entries.push({ id: item.id, item, status: 'queued', error: null })
      }
    }
    this.emit()
    this.pump()
  }

  pause() {
    this.paused = true
    this.emit()
  }

  resume() {
    this.paused = false
    this.emit()
    this.pump()
  }

  retry(id: string) {
    const entry = this.entries.find((candidate) => candidate.id === id)
    if (!entry || entry.status !== 'error') return
    entry.status = 'queued'
    entry.error = null
    this.emit()
    this.pump()
  }

  getSnapshot() {
    return this.entries.map((entry) => ({ ...entry }))
  }

  isPaused() {
    return this.paused
  }

  waitForIdle() {
    if (this.running === 0 && !this.entries.some((entry) => entry.status === 'queued')) return Promise.resolve()
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve))
  }

  private pump() {
    if (this.paused) return
    while (this.running < this.concurrency) {
      const entry = this.entries.find((candidate) => candidate.status === 'queued')
      if (!entry) break
      entry.status = 'running'
      entry.error = null
      this.running += 1
      this.emit()
      void this.worker(entry.item)
        .then(() => {
          entry.status = 'done'
        })
        .catch((error) => {
          entry.status = 'error'
          entry.error = error instanceof Error ? error.message : String(error)
        })
        .finally(() => {
          this.running -= 1
          this.emit()
          this.pump()
          this.resolveIdleIfNeeded()
        })
    }
    this.resolveIdleIfNeeded()
  }

  private emit() {
    this.onChange?.(this.getSnapshot())
  }

  private resolveIdleIfNeeded() {
    if (this.running > 0 || this.entries.some((entry) => entry.status === 'queued')) return
    const resolvers = this.idleResolvers.splice(0)
    for (const resolve of resolvers) resolve()
  }
}
