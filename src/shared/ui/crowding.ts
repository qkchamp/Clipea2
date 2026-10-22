/** What a row remembers between two measurements of its width. */
export interface CrowdingMemory {
  /** One-line width of the full layout the last time it was on screen; 0 until then. */
  fullWidth: number
  /** Pixels the compact layout saves, measured on the first check after compacting. */
  saved: number | null
  /**
   * The last time the full layout didn't fit: the most room it had (in either layout) and the
   * compact width that followed. Null while the full layout fits.
   */
  failed: { room: number; compactWidth: number | null } | null
}

export const FRESH_MEMORY: CrowdingMemory = { fullWidth: 0, saved: null, failed: null }

/**
 * Whether a row should use its compact layout after a measurement. `needed` is the one-line width
 * of the layout on screen and `room` the width it has.
 *
 * Compact, it can't measure the full layout, so it adds what compacting saves (measured once per
 * compaction, from the full width just seen). Flipping forever between both layouts looks like the
 * window blinking, so three cases are covered: a saving left over from an older full width (it is
 * measured again on every compaction), compacting before the full width was ever seen (the full
 * layout is shown once to measure it), and a room that grows when the row compacts. For the last
 * one, after the full layout fails it isn't tried again until there is more room than when it
 * failed or the content changes width.
 */
export function nextCrowded(
  crowded: boolean,
  needed: number,
  room: number,
  memory: CrowdingMemory
): { crowded: boolean; memory: CrowdingMemory } {
  if (!crowded) {
    const fits = needed <= room + 0.5
    return {
      crowded: !fits,
      memory: { fullWidth: needed, saved: fits ? memory.saved : null, failed: fits ? null : { room, compactWidth: null } }
    }
  }
  if (memory.fullWidth === 0) return { crowded: false, memory }
  const saved = memory.saved ?? Math.max(0, memory.fullWidth - needed)
  let failed = memory.failed
  if (failed && failed.compactWidth === null) failed = { room: Math.max(failed.room, room), compactWidth: needed }
  const blocked = failed !== null && Math.abs(needed - (failed.compactWidth ?? needed)) <= 0.5 && room <= failed.room + 0.5
  return { crowded: blocked || needed + saved > room + 0.5, memory: { ...memory, saved, failed } }
}
