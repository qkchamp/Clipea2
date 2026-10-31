import { getT } from '@shared/i18n'
import type { Shape } from '../domain/annotation'
import { drawShapes } from './drawShapes'

/** Transparent PNG of some drawings at the export resolution, ready for ffmpeg's overlay. */
export async function rasterizeShapes(shapes: readonly Shape[], width: number, height: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(getT().drawing.exportFailed)
  drawShapes(context, shapes, width, height)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}
