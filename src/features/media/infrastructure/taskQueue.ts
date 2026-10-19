/** Runs at most `concurrency` tasks at a time; scrolling a 2,500-clip library must not spawn 2,500 ffmpegs. */
export class TaskQueue {
  private running = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly concurrency: number) {}

  /** `urgent` tasks (what the user is waiting for right now) skip ahead of everything queued. */
  async run<T>(task: () => Promise<T>, options: { urgent?: boolean } = {}): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => (options.urgent ? this.waiting.unshift(resolve) : this.waiting.push(resolve)))
    } else {
      this.running++
    }
    try {
      return await task()
    } finally {
      const next = this.waiting.shift()
      // The slot passes straight to the next task, so `running` only drops when nobody waits.
      if (next) next()
      else this.running--
    }
  }
}
