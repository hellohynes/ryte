import { describe, expect, it } from 'vitest'

import { fieldIds } from './field-logic'

describe('field ids', () => {
  it('wires hint and error to the control through aria-describedby', () => {
    expect(fieldIds('f1', undefined, undefined)).toEqual({
      control: 'f1',
      hint: 'f1-hint',
      error: 'f1-error',
      describedby: undefined
    })
    expect(fieldIds('f1', 'Where notes live', undefined).describedby).toBe('f1-hint')
    expect(fieldIds('f1', 'Where notes live', 'Choose a folder').describedby).toBe(
      'f1-error f1-hint'
    )
    expect(fieldIds('f1', undefined, 'Choose a folder').describedby).toBe('f1-error')
  })
})
