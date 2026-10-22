/** Side of the frame a drawing slides in from, or out to. */
export type Side = 'left' | 'right' | 'top' | 'bottom'

/**
 * What a drawing can do besides sitting still or moving along keyframes. "In" effects run from the
 * start of its bar, "out" effects end where the bar ends, and loops go on while it shows.
 */
export type Effect =
  | { kind: 'fadeIn' | 'fadeOut' | 'zoomIn' | 'zoomOut'; duration: number }
  | { kind: 'slideIn' | 'slideOut'; duration: number; side: Side }
  /** `rate`: times per second. */
  | { kind: 'blink' | 'pulse'; rate: number }

export type EffectKind = Effect['kind']

/** The part of a drawing its effects depend on: when it shows up and when it leaves. */
export interface Timed {
  start: number
  end: number
  effects?: readonly Effect[]
}

/** How a drawing looks on one frame because of its effects. Scale pivots on the middle of the shape. */
export interface Look {
  opacity: number
  scale: number
  /** Extra offset, in fractions of the frame (1 = a whole frame width or height). */
  dx: number
  dy: number
}

export const PLAIN_LOOK: Look = { opacity: 1, scale: 1, dx: 0, dy: 0 }

export const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom']

export const EFFECT_KINDS: readonly EffectKind[] = ['fadeIn', 'fadeOut', 'zoomIn', 'zoomOut', 'slideIn', 'slideOut', 'blink', 'pulse']

export const EFFECT_LABELS: Record<EffectKind, string> = {
  fadeIn: 'Aparecer',
  fadeOut: 'Desvanecer',
  zoomIn: 'Zoom al entrar',
  zoomOut: 'Zoom al salir',
  slideIn: 'Deslizar al entrar',
  slideOut: 'Deslizar al salir',
  blink: 'Parpadeo',
  pulse: 'Latido'
}

export const SIDE_LABELS: Record<Side, string> = { left: 'Izquierda', right: 'Derecha', top: 'Arriba', bottom: 'Abajo' }

export const DEFAULT_EFFECTS: Record<EffectKind, Effect> = {
  fadeIn: { kind: 'fadeIn', duration: 0.5 },
  fadeOut: { kind: 'fadeOut', duration: 0.5 },
  zoomIn: { kind: 'zoomIn', duration: 0.3 },
  zoomOut: { kind: 'zoomOut', duration: 0.3 },
  slideIn: { kind: 'slideIn', duration: 0.4, side: 'left' },
  slideOut: { kind: 'slideOut', duration: 0.4, side: 'right' },
  blink: { kind: 'blink', rate: 2 },
  pulse: { kind: 'pulse', rate: 1 }
}

export const MIN_EFFECT_SECONDS = 0.1
export const MAX_EFFECT_SECONDS = 600
export const MIN_RATE = 0.5
export const MAX_RATE = 8

/** How much bigger a drawing gets at the top of each pulse. */
export const PULSE_AMOUNT = 0.15
/**
 * A blink flips exactly on frame boundaries; this keeps the player and the encoder, which round
 * differently in the last digits, on the same side of the flip.
 */
export const BLINK_PHASE_EPSILON = 1e-4

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const fract = (value: number): number => value - Math.floor(value)

/** Fast at first, settling into place: 0 → 1. */
export const easeOut = (progress: number): number => 1 - (1 - progress) ** 3

export const isEntering = (kind: EffectKind): boolean => kind === 'fadeIn' || kind === 'zoomIn' || kind === 'slideIn'
export const isLeaving = (kind: EffectKind): boolean => kind === 'fadeOut' || kind === 'zoomOut' || kind === 'slideOut'

export function effectOf(drawing: Timed, kind: EffectKind): Effect | undefined {
  return drawing.effects?.find((effect) => effect.kind === kind)
}

export const hasEffects = (drawing: Timed): boolean => (drawing.effects?.length ?? 0) > 0

/** Adds the effect, replacing the one of its kind that was already there. */
export function setEffect(effects: readonly Effect[] | undefined, effect: Effect): Effect[] {
  const others = (effects ?? []).filter((existing) => existing.kind !== effect.kind)
  return EFFECT_KINDS.flatMap((kind) => (kind === effect.kind ? [effect] : others.filter((other) => other.kind === kind)))
}

export function removeEffect(effects: readonly Effect[] | undefined, kind: EffectKind): Effect[] {
  return (effects ?? []).filter((effect) => effect.kind !== kind)
}

/** Seconds an effect may last on a bar: never zero, never more than the bar itself (unless the bar is tiny). */
export function clampDuration(seconds: number, barSeconds: number): number {
  return clamp(seconds, MIN_EFFECT_SECONDS, Math.max(MIN_EFFECT_SECONDS, Math.min(barSeconds, MAX_EFFECT_SECONDS)))
}

export const clampRate = (rate: number): number => clamp(rate, MIN_RATE, MAX_RATE)

/** An effect as it comes back from a saved file or over IPC: anything malformed is dropped. */
function parseEffect(item: unknown): Effect | null {
  if (!item || typeof item !== 'object') return null
  const { kind, duration, side, rate } = item as Record<string, unknown>
  const seconds = typeof duration === 'number' && Number.isFinite(duration) ? clamp(duration, MIN_EFFECT_SECONDS, MAX_EFFECT_SECONDS) : null
  switch (kind) {
    case 'fadeIn':
    case 'fadeOut':
    case 'zoomIn':
    case 'zoomOut':
      return seconds === null ? null : { kind, duration: seconds }
    case 'slideIn':
    case 'slideOut':
      return seconds === null || !SIDES.includes(side as Side) ? null : { kind, duration: seconds, side: side as Side }
    case 'blink':
    case 'pulse':
      return typeof rate === 'number' && Number.isFinite(rate) ? { kind, rate: clampRate(rate) } : null
    default:
      return null
  }
}

/** Valid effects only, at most one of each kind, in a fixed order. */
export function normalizeEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) return []
  return value.reduce<Effect[]>((effects, item) => {
    const effect = parseEffect(item)
    return effect && !effects.some((existing) => existing.kind === effect.kind) ? setEffect(effects, effect) : effects
  }, [])
}

/** Effects that change how opaque the drawing is. */
export const fadesOrBlinks = (effects: readonly Effect[]): boolean =>
  effects.some((effect) => effect.kind === 'fadeIn' || effect.kind === 'fadeOut' || effect.kind === 'blink')

/** Effects that change its size. */
export const resizes = (effects: readonly Effect[]): boolean =>
  effects.some((effect) => effect.kind === 'zoomIn' || effect.kind === 'zoomOut' || effect.kind === 'pulse')

/** Progress 0 → 1 of an entering effect on a frame, and of a leaving effect (1 → 0 towards the end of the bar). */
const enterProgress = (drawing: Timed, time: number, duration: number): number => clamp((time - drawing.start) / duration, 0, 1)
const leaveProgress = (drawing: Timed, time: number, duration: number): number => clamp((drawing.end - time) / duration, 0, 1)

/** Distance of a sliding drawing from its place, as a fraction of the frame, signed by the side. */
function slideOffset(side: Side, away: number): { dx: number; dy: number } {
  switch (side) {
    case 'left':
      return { dx: -away, dy: 0 }
    case 'right':
      return { dx: away, dy: 0 }
    case 'top':
      return { dx: 0, dy: -away }
    case 'bottom':
      return { dx: 0, dy: away }
  }
}

/** What the effects do to a drawing on the frame that starts at `time` (seconds of the source video). */
export function lookAt(drawing: Timed, time: number): Look {
  const effects = drawing.effects
  if (!effects || effects.length === 0) return PLAIN_LOOK
  const sinceStart = time - drawing.start
  let opacity = 1
  let scale = 1
  let dx = 0
  let dy = 0
  for (const effect of effects) {
    switch (effect.kind) {
      case 'fadeIn':
        opacity *= enterProgress(drawing, time, effect.duration)
        break
      case 'fadeOut':
        opacity *= leaveProgress(drawing, time, effect.duration)
        break
      case 'zoomIn':
        scale *= easeOut(enterProgress(drawing, time, effect.duration))
        break
      case 'zoomOut':
        scale *= easeOut(leaveProgress(drawing, time, effect.duration))
        break
      case 'slideIn':
      case 'slideOut': {
        const progress = effect.kind === 'slideIn' ? enterProgress(drawing, time, effect.duration) : leaveProgress(drawing, time, effect.duration)
        const offset = slideOffset(effect.side, 1 - easeOut(progress))
        dx += offset.dx
        dy += offset.dy
        break
      }
      case 'blink':
        opacity *= fract(sinceStart * effect.rate + BLINK_PHASE_EPSILON) < 0.5 ? 1 : 0
        break
      case 'pulse':
        scale *= 1 + PULSE_AMOUNT * (0.5 - 0.5 * Math.cos(2 * Math.PI * effect.rate * sinceStart))
        break
    }
  }
  return { opacity, scale, dx, dy }
}

export const isPlain = (look: Look): boolean => look.opacity === 1 && look.scale === 1 && look.dx === 0 && look.dy === 0

/** A stretch of the drawing's bar an effect covers (seconds of the source video), to paint it on the timeline. */
export interface EffectSpan {
  kind: EffectKind
  from: number
  to: number
}

export function effectSpans(drawing: Timed): EffectSpan[] {
  return (drawing.effects ?? []).map((effect) => {
    if ('duration' in effect) {
      return isEntering(effect.kind)
        ? { kind: effect.kind, from: drawing.start, to: Math.min(drawing.end, drawing.start + effect.duration) }
        : { kind: effect.kind, from: Math.max(drawing.start, drawing.end - effect.duration), to: drawing.end }
    }
    return { kind: effect.kind, from: drawing.start, to: drawing.end }
  })
}
