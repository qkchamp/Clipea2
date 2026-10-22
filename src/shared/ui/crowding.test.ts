import { describe, expect, it } from 'vitest'
import { FRESH_MEMORY, nextCrowded, type CrowdingMemory } from './crowding'

interface Widths {
  full: number
  compact: number
}

/**
 * A row 800 px wide in full and 700 px compact, measured over and over like the ResizeObserver
 * does: each step measures the layout that the previous decision put on screen. `room` can depend
 * on that layout too (a parent that gets wider when the row compacts).
 */
function run(
  room: number | ((crowded: boolean) => number),
  start: { crowded: boolean; memory: CrowdingMemory },
  steps = 8,
  widths: Widths = { full: 800, compact: 700 }
): { states: boolean[]; memory: CrowdingMemory } {
  const roomOf = typeof room === 'number' ? () => room : room
  const states: boolean[] = []
  let { crowded, memory } = start
  for (let step = 0; step < steps; step++) {
    const next = nextCrowded(crowded, crowded ? widths.compact : widths.full, roomOf(crowded), memory)
    crowded = next.crowded
    memory = next.memory
    states.push(crowded)
  }
  return { states, memory }
}

const flips = (states: boolean[]): number => states.filter((state, index) => index > 0 && state !== states[index - 1]).length

describe('nextCrowded', () => {
  it('keeps the full layout while it fits', () => {
    expect(run(900, { crowded: false, memory: FRESH_MEMORY }).states).toEqual(Array(8).fill(false))
  })

  it('compacts once when the full layout no longer fits, and stays compact', () => {
    const { states } = run(750, { crowded: false, memory: FRESH_MEMORY })
    expect(states.at(-1)).toBe(true)
    expect(flips(states)).toBe(0)
  })

  it('goes back to the full layout as soon as it fits again', () => {
    const compact = { crowded: true, memory: { fullWidth: 800, saved: 100, failed: { room: 750, compactWidth: 700 } } }
    expect(run(810, compact).states).toEqual(Array(8).fill(false))
  })

  it('does not blink when it starts compact without ever having seen the full layout', () => {
    // What happened when hot reload restarted the measuring with the toolbar already compact: it saved 0 and flipped forever.
    const { states } = run(750, { crowded: true, memory: FRESH_MEMORY })
    expect(flips(states)).toBeLessThanOrEqual(1)
    expect(states.at(-1)).toBe(true)
  })

  it('does not blink when the full layout grew since the saving was measured', () => {
    // A button was added while compact: the old saving (60) is too small for the new full width (800 vs 700).
    const { states } = run(750, { crowded: true, memory: { fullWidth: 760, saved: 40, failed: null } })
    expect(flips(states)).toBeLessThanOrEqual(2)
    expect(states.slice(-4)).toEqual([true, true, true, true])
  })

  it('does not blink when compacting gives the row more room', () => {
    // Full fails with 780 px; compact, the parent offers 820, where the full layout would seem to fit.
    const { states } = run((crowded) => (crowded ? 820 : 780), { crowded: false, memory: FRESH_MEMORY }, 12)
    expect(flips(states)).toBe(0)
    expect(states.at(-1)).toBe(true)
  })

  it('tries the full layout again when the room grows past where it failed', () => {
    const compacted = run((crowded) => (crowded ? 820 : 780), { crowded: false, memory: FRESH_MEMORY })
    expect(run(860, { crowded: true, memory: compacted.memory }).states).toEqual(Array(8).fill(false))
  })

  it('tries the full layout again when the content gets narrower in the same room', () => {
    // The clock of a shorter clip: 60 px less in both layouts, so the full one fits in 750 now.
    const compacted = run(750, { crowded: false, memory: FRESH_MEMORY })
    const narrower = run(750, { crowded: true, memory: compacted.memory }, 8, { full: 740, compact: 640 })
    expect(narrower.states).toEqual(Array(8).fill(false))
  })
})
