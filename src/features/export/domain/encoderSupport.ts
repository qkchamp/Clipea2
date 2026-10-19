import type { VideoCodec } from './encodingPlan'

/** Hardware encoders ffmpeg drives on Windows: dedicated or integrated GPUs. */
export type GpuVendor = 'nvidia' | 'amd' | 'intel'

/** Preference when a machine has more than one (a dedicated GPU usually comes first). */
export const GPU_VENDORS: readonly GpuVendor[] = ['nvidia', 'amd', 'intel']

export const GPU_LABEL: Record<GpuVendor, string> = { nvidia: 'NVIDIA NVENC', amd: 'AMD AMF', intel: 'Intel Quick Sync' }

/** Which codecs this machine can produce: on a GPU (the first one that works) or on the CPU. */
export interface EncoderSupport {
  gpu: Record<VideoCodec, GpuVendor | null>
  cpu: Record<VideoCodec, boolean>
}

export const NO_ENCODERS: EncoderSupport = {
  gpu: { hevc: null, h264: null, av1: null },
  cpu: { hevc: false, h264: false, av1: false }
}

/** GPU that encodes `codec`; null means the CPU (none found, or acceleration turned off in Ajustes). */
export function gpuFor(support: EncoderSupport, codec: VideoCodec, allowGpu: boolean): GpuVendor | null {
  return allowGpu ? support.gpu[codec] : null
}

export function canEncode(support: EncoderSupport, codec: VideoCodec, allowGpu: boolean): boolean {
  return gpuFor(support, codec, allowGpu) !== null || support.cpu[codec]
}

/** The GPU that also decodes the recordings while exporting: the first one found for any codec. */
export function decodingGpu(support: EncoderSupport, allowGpu: boolean): GpuVendor | null {
  if (!allowGpu) return null
  const found = Object.values(support.gpu).filter((vendor): vendor is GpuVendor => vendor !== null)
  return GPU_VENDORS.find((vendor) => found.includes(vendor)) ?? null
}
