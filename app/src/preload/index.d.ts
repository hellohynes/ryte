import type { RyteApi } from './index'

declare global {
  interface Window {
    ryte: RyteApi
  }
}

export {}
