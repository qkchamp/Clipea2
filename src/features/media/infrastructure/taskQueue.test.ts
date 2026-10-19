import { describe, expect, it } from 'vitest'
import { TaskQueue } from './taskQueue'

describe('TaskQueue', () => {
  it('never runs more tasks than allowed', async () => {
    const queue = new TaskQueue(2)
    let running = 0
    let peak = 0
    const task = async (): Promise<void> => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
    }
    await Promise.all(Array.from({ length: 8 }, () => queue.run(task)))
    expect(peak).toBe(2)
  })

  it('runs urgent tasks before the ones already waiting', async () => {
    const queue = new TaskQueue(1)
    const order: string[] = []
    const task = (name: string) => async (): Promise<void> => {
      order.push(name)
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    await Promise.all([
      queue.run(task('running')),
      queue.run(task('thumb 1')),
      queue.run(task('thumb 2')),
      queue.run(task('filmstrip'), { urgent: true })
    ])
    expect(order).toEqual(['running', 'filmstrip', 'thumb 1', 'thumb 2'])
  })

  it('keeps going after a failing task', async () => {
    const queue = new TaskQueue(1)
    const failed = queue.run(async () => {
      throw new Error('boom')
    })
    await expect(failed).rejects.toThrow('boom')
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok')
  })
})
