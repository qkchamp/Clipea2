/// <reference types="vite/client" />
import type { Clipea2Api } from '@shared/contracts/clipea2Api'

declare global {
  interface Window {
    clipea2: Clipea2Api
  }
}
