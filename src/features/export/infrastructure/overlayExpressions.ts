import {
  BLINK_PHASE_EPSILON,
  PULSE_AMOUNT,
  fadesOrBlinks,
  isEntering,
  normalizeEffects,
  resizes,
  type Effect
} from '@features/annotations/domain/effects'
import type { MotionKey, OverlayWindow, RenderEffects } from '../domain/renderTimeline'
import { num } from './num'

/**
 * Expressions that tell ffmpeg where a drawing is, how big and how opaque, frame by frame. They
 * mirror `lookAt` and `offsetAt` of the annotations domain (the tests evaluate both and compare), so
 * the exported video moves and fades exactly like the player.
 *
 * `t` is the clock of the overlay and scale filters; `geq` calls it `T`. Both count seconds of the
 * exported clip, and each window maps them back to seconds of the source video, where the drawing's
 * keyframes and effects live.
 */
export type TimeVariable = 't' | 'T'

/**
 * A frame belongs to a window when its start, rounded to the nearest frame, is inside [start, end):
 * the same rule as the player. Cutting half a frame early also keeps a frame that starts exactly on
 * an edge from flipping either way with the last digits of its time.
 */
export function inWindow(window: OverlayWindow, time: TimeVariable, half: number): string {
  return `gte(${time},${num(window.start - half)})*lt(${time},${num(window.end - half)})`
}

/** Seconds of the source video at the clip time `time`, inside a window. */
const sourceTime = (window: OverlayWindow, time: TimeVariable): string => `(${time}+(${num(window.sourceStart - window.start)}))`

/** A different expression in each window; `fallback` outside them (where the drawing is not shown anyway). */
function perWindow(
  windows: readonly OverlayWindow[],
  time: TimeVariable,
  half: number,
  fallback: string,
  value: (source: string) => string
): string {
  return windows.reduceRight((rest, window) => `if(${inWindow(window, time, half)},${value(sourceTime(window, time))},${rest})`, fallback)
}

/** A value that goes linearly from key to key along `time` (held before the first and after the last). */
export function piecewiseLinear(keys: readonly { time: number; value: number }[], time: string): string {
  let expression = num(keys[keys.length - 1].value)
  for (let index = keys.length - 2; index >= 0; index--) {
    const a = keys[index]
    const b = keys[index + 1]
    const slope = (b.value - a.value) / (b.time - a.time)
    expression = `if(lt(${time},${num(b.time)}),${num(a.value)}+(${num(slope)})*(${time}-(${num(a.time)})),${expression})`
  }
  return `if(lt(${time},${num(keys[0].time)}),${num(keys[0].value)},${expression})`
}

const clip01 = (value: string): string => `clip(${value},0,1)`
/** Mirrors `easeOut`: fast at first, settling into place. */
const easeOut = (progress: string): string => `(1-pow(1-${progress},3))`

/** Progress 0 → 1 of an effect on the source time `source`: entering ones grow from the start of the bar, leaving ones towards its end. */
function progressOf(effect: Extract<Effect, { duration: number }>, fx: RenderEffects, source: string): string {
  return isEntering(effect.kind)
    ? clip01(`(${source}-${num(fx.start)})/${num(effect.duration)}`)
    : clip01(`(${num(fx.end)}-${source})/${num(effect.duration)}`)
}

function opacityAt(fx: RenderEffects, source: string): string {
  const factors = fx.list.flatMap((effect) => {
    switch (effect.kind) {
      case 'fadeIn':
      case 'fadeOut':
        return [progressOf(effect, fx, source)]
      case 'blink':
        return [`lt(mod((${source}-${num(fx.start)})*${num(effect.rate)}+${num(BLINK_PHASE_EPSILON)},1),0.5)`]
      default:
        return []
    }
  })
  return factors.length > 0 ? factors.join('*') : '1'
}

function scaleAt(fx: RenderEffects, source: string): string {
  const factors = fx.list.flatMap((effect) => {
    switch (effect.kind) {
      case 'zoomIn':
      case 'zoomOut':
        return [easeOut(progressOf(effect, fx, source))]
      case 'pulse':
        return [`(1+${num(PULSE_AMOUNT)}*(0.5-0.5*cos(2*PI*${num(effect.rate)}*(${source}-${num(fx.start)}))))`]
      default:
        return []
    }
  })
  return factors.length > 0 ? factors.join('*') : '1'
}

/** Pixels a sliding drawing is away from its place along one axis (a whole frame size at the edge). */
function slideAt(fx: RenderEffects, source: string, axis: 'x' | 'y', size: number): string {
  const terms = fx.list.flatMap((effect) => {
    if (effect.kind !== 'slideIn' && effect.kind !== 'slideOut') return []
    const along = effect.side === 'left' || effect.side === 'right' ? 'x' : 'y'
    if (along !== axis) return []
    const sign = effect.side === 'left' || effect.side === 'top' ? '-' : ''
    return [`(${sign}(1-${easeOut(progressOf(effect, fx, source))})*${num(size)})`]
  })
  return terms.length > 0 ? terms.join('+') : '0'
}

/** What the effects list of an overlay needs from ffmpeg, validated: it comes from outside this process. */
export function validEffects(fx: RenderEffects | undefined): RenderEffects | undefined {
  if (!fx) return undefined
  const list = normalizeEffects(fx.list)
  const finite = [fx.start, fx.end, fx.center?.x, fx.center?.y].every((value) => typeof value === 'number' && Number.isFinite(value))
  if (list.length === 0 || !finite) return undefined
  return { start: fx.start, end: fx.end, list, center: fx.center }
}

/** True when the drawing must travel as a stream of frames (not one still image) so ffmpeg can fade or scale it. */
export const needsFrames = (fx: RenderEffects | undefined): boolean => Boolean(fx && (fadesOrBlinks(fx.list) || resizes(fx.list)))

export interface OverlayLook {
  /** Overlay position in pixels (expressions of `t`); both '0' when the drawing stays put. */
  x: string
  y: string
  /** Size factor of the image (an expression of `t`), or null when it keeps its size. */
  scale: string | null
  /** Opacity 0..1 (an expression of `T`), or null when it keeps its own. */
  opacity: string | null
}

const sum = (terms: readonly string[]): string => {
  const used = terms.filter((term) => term !== '0')
  if (used.length <= 1) return used[0] ?? '0'
  return used.map((term) => `(${term})`).join('+')
}

/**
 * Where, how big and how opaque the drawing is on every frame of its windows: keyframe motion plus
 * the slide of its effects, scaled around the middle of the shape, and the fade of its effects.
 */
export function overlayLook(
  windows: readonly OverlayWindow[],
  motion: readonly MotionKey[] | undefined,
  fx: RenderEffects | undefined,
  frame: { width: number; height: number; half: number }
): OverlayLook {
  const moving = motion !== undefined && motion.length >= 2
  const place = (axis: 'x' | 'y'): string => {
    const size = axis === 'x' ? frame.width : frame.height
    const center = fx ? (axis === 'x' ? fx.center.x : fx.center.y) * size : 0
    const scaled = Boolean(fx && resizes(fx.list))
    const terms = (source: string): string[] => [
      moving ? piecewiseLinear(motion.map((key) => ({ time: key.time, value: key[axis === 'x' ? 'dx' : 'dy'] * size })), source) : '0',
      fx ? slideAt(fx, source, axis, size) : '0',
      // Scaling grows the image from its corner; this puts the middle of the shape back where it was.
      fx && scaled ? `${num(center)}*(1-${scaleAt(fx, source)})` : '0'
    ]
    // An axis nothing moves along stays '0' (and the overlay keeps its plain "0:0" when both do).
    if (terms('t').every((term) => term === '0')) return '0'
    return perWindow(windows, 't', frame.half, '0', (source) => sum(terms(source)))
  }
  return {
    x: place('x'),
    y: place('y'),
    scale: fx && resizes(fx.list) ? perWindow(windows, 't', frame.half, '1', (source) => scaleAt(fx, source)) : null,
    opacity: fx && fadesOrBlinks(fx.list) ? perWindow(windows, 'T', frame.half, '1', (source) => opacityAt(fx, source)) : null
  }
}
