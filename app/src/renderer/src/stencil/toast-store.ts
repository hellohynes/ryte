import { readonly, ref } from 'vue'

export type ToastTone = 'neutral' | 'success' | 'danger'

export interface ToastInput {
  message: string
  tone?: ToastTone
  /** Milliseconds before it goes away. `null` keeps it until dismissed. Default 5000. */
  duration?: number | null
  /** One optional button, such as Undo. */
  action?: { label: string; onSelect: () => void }
}

export interface Toast extends Required<Pick<ToastInput, 'message' | 'tone'>> {
  id: number
  duration: number | null
  action?: ToastInput['action']
}

export const MAX_TOASTS = 3
export const DEFAULT_TOAST_MS = 5000

/** Adds a toast, dropping the oldest ones beyond `max`. Pure. */
export function addToast(list: Toast[], input: ToastInput, id: number, max = MAX_TOASTS): Toast[] {
  const toast: Toast = {
    id,
    message: input.message,
    tone: input.tone ?? 'neutral',
    duration: input.duration === undefined ? DEFAULT_TOAST_MS : input.duration,
    action: input.action
  }
  return [...list, toast].slice(-max)
}

export function removeToast(list: Toast[], id: number): Toast[] {
  return list.filter((toast) => toast.id !== id)
}

const toasts = ref<Toast[]>([])
let nextId = 1

/** Shows a short message. Returns its id, for `dismissToast`. */
export function toast(input: ToastInput | string): number {
  const id = nextId++
  toasts.value = addToast(toasts.value, typeof input === 'string' ? { message: input } : input, id)
  return id
}

export function dismissToast(id: number): void {
  toasts.value = removeToast(toasts.value, id)
}

/** The toasts on screen. Render them once, with `StToaster`, near the root of the app. */
export const activeToasts = readonly(toasts)
