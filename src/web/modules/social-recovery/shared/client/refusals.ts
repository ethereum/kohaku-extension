import type { CodedRefusal } from './types'

/** A refusal of the client layer's own, carrying the code a screen reads and the values it refused on. */
export const codedRefusal = (code: string, values: Record<string, unknown> = {}): CodedRefusal => {
  const error = new Error(code) as CodedRefusal
  error.name = 'CodedRefusal'
  error.code = code
  error.values = values
  return error
}
