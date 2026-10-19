import { create } from 'zustand'

type Dialog = 'help' | 'settings' | 'discord' | null
export type SidebarTab = 'montage' | 'history'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'warning'
  actions: ToastAction[]
}

export interface ToastInput {
  text: string
  tone?: Toast['tone']
  actions?: ToastAction[]
  /** Milliseconds on screen; toasts with actions stay longer by default. */
  durationMs?: number
}

const MAX_TOASTS = 3

interface UiState {
  dialog: Dialog
  /** Clip the "Enviar a canal" dialog is about. */
  discordClipPath: string | null
  sidebarTab: SidebarTab
  /** Export just finished: highlighted in the history until the next one. */
  highlightedExportId: string | null
  toasts: Toast[]
  openDialog(dialog: Exclude<Dialog, null | 'discord'>): void
  openDiscordSend(clipPath: string): void
  closeDialog(): void
  setSidebarTab(tab: SidebarTab): void
  showExport(id: string): void
  showToast(toast: ToastInput): number
  dismissToast(id: number): void
}

let toastCounter = 0
const timers = new Map<number, number>()

/** App-level layout state (dialogs, right sidebar tab, toasts). */
export const useUiStore = create<UiState>((set, get) => ({
  dialog: null,
  discordClipPath: null,
  sidebarTab: 'montage',
  highlightedExportId: null,
  toasts: [],
  openDialog: (dialog) => set({ dialog }),
  openDiscordSend: (discordClipPath) => set({ dialog: 'discord', discordClipPath }),
  closeDialog: () => set({ dialog: null }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  showExport: (highlightedExportId) => set({ sidebarTab: 'history', highlightedExportId }),

  showToast({ text, tone = 'info', actions = [], durationMs }) {
    const id = ++toastCounter
    const toasts = [...get().toasts, { id, text, tone, actions }]
    for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) get().dismissToast(dropped.id)
    set({ toasts: toasts.slice(-MAX_TOASTS) })
    const timer = window.setTimeout(() => get().dismissToast(id), durationMs ?? (actions.length > 0 ? 8000 : 4000))
    timers.set(id, timer)
    return id
  },

  dismissToast(id) {
    window.clearTimeout(timers.get(id))
    timers.delete(id)
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }
}))
