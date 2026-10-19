import { create } from 'zustand'
import type { ExportEvent } from '@shared/contracts/clipea2Api'
import { formatBytes } from '@shared/domain/time'

export type ExportJob =
  | { status: 'idle' }
  | { status: 'preparing'; label: string }
  | {
      status: 'running'
      jobId: string
      label: string
      attempt: number
      fraction: number
      speed: number | null
      note: string | null
    }
  | { status: 'error'; message: string }
  | { status: 'cancelled' }

interface ExportState {
  job: ExportJob
  fileName: string
  setFileName(name: string): void
  setJob(job: ExportJob): void
  handleEvent(event: ExportEvent): void
}

/**
 * The export in progress. Finished exports leave this store (they go to the history), so the
 * panel is ready for the next clip right away.
 */
export const useExportStore = create<ExportState>((set, get) => ({
  job: { status: 'idle' },
  fileName: '',

  setFileName: (fileName) => set({ fileName }),
  setJob: (job) => set({ job }),

  handleEvent(event) {
    const job = get().job
    const current = job.status === 'running' ? job : null
    if (current && current.jobId !== event.jobId) return
    const label = job.status === 'running' || job.status === 'preparing' ? job.label : ''
    switch (event.type) {
      case 'progress':
        set({
          job: {
            status: 'running',
            jobId: event.jobId,
            label,
            attempt: event.attempt,
            fraction: event.fraction,
            speed: event.speed,
            note: current?.note ?? null
          }
        })
        break
      case 'retry':
        set({
          job: {
            status: 'running',
            jobId: event.jobId,
            label,
            attempt: event.attempt,
            fraction: 0,
            speed: null,
            note: `Salió de ${formatBytes(event.previousBytes)}: lo achico y reintento (intento ${event.attempt})`
          }
        })
        break
      case 'fallback':
        set({
          job: {
            status: 'running',
            jobId: event.jobId,
            label,
            attempt: current?.attempt ?? 1,
            fraction: 0,
            speed: null,
            note: 'La GPU no pudo con este clip: sigo con la CPU (puede tardar más).'
          }
        })
        break
      case 'done':
        set({ job: { status: 'idle' }, fileName: '' })
        break
      case 'error':
        set({ job: { status: 'error', message: event.message } })
        break
      case 'cancelled':
        set({ job: { status: 'cancelled' } })
        break
    }
  }
}))
