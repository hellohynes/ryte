/** The ids that tie a field's hint and error to its control. */
export interface FieldIds {
  control: string
  hint: string
  error: string
  /** The value for `aria-describedby`: the error first, then the hint, or nothing. */
  describedby: string | undefined
}

export function fieldIds(id: string, hint?: string, error?: string): FieldIds {
  const ids = { control: id, hint: `${id}-hint`, error: `${id}-error` }
  const described = [error ? ids.error : '', hint ? ids.hint : ''].filter(Boolean).join(' ')
  return { ...ids, describedby: described || undefined }
}
