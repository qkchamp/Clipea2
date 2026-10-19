const EPSILON = 1e-4

/**
 * Exact presentation times of every frame of a video, relative to its first frame.
 * ShadowPlay records VFR, so "time × fps" drifts; frame stepping uses this table instead.
 */
export class FrameIndex {
  private constructor(
    private readonly times: Float64Array,
    readonly nominalFrameDuration: number
  ) {}

  /** Typed-array sort is native and numeric: ~10x faster than Array#sort on a 175,000-frame recording. */
  static fromTimestamps(timestamps: ArrayLike<number>, startTime = 0, fallbackFps = 30): FrameIndex | null {
    const sorted = Float64Array.from(timestamps, (t) => t - startTime).sort()
    let count = 0
    for (const t of sorted) {
      if (!Number.isFinite(t)) continue
      if (count === 0 || t - sorted[count - 1] > 1e-6) sorted[count++] = t
    }
    if (count === 0) return null
    const unique = sorted.slice(0, count)
    const nominal = count > 1 ? (unique[count - 1] - unique[0]) / (count - 1) : 1 / fallbackFps
    return new FrameIndex(unique, nominal)
  }

  get count(): number {
    return this.times.length
  }

  timeOf(index: number): number {
    const clamped = Math.min(this.count - 1, Math.max(0, Math.round(index)))
    return this.times[clamped]
  }

  /** Index of the frame on screen at `time`: the last one starting at or before it. */
  indexAt(time: number): number {
    let low = 0
    let high = this.count - 1
    if (time < this.times[0]) return 0
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (this.times[mid] <= time + EPSILON) low = mid
      else high = mid - 1
    }
    return low
  }

  /** A seek target that safely lands on frame `index`: the middle of its display interval. */
  seekTimeOf(index: number): number {
    const clamped = Math.min(this.count - 1, Math.max(0, Math.round(index)))
    const start = this.times[clamped]
    const next = clamped + 1 < this.count ? this.times[clamped + 1] : start + this.nominalFrameDuration
    return start + (next - start) / 2
  }
}
