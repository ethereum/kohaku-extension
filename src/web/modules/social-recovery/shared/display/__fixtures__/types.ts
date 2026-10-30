export type IntlWithSegmenter = { Segmenter?: unknown }

export type DisplayModule = typeof import('@web/modules/social-recovery/shared/display')

/** A rule of the display words, and the pattern that breaks it. */
export type DisplayBan = { rule: string; pattern: RegExp }

/** A time left that is not finite, and what it is. */
export type BadSpanCase = [number, string]

/** A key the translate function was called with, and its options. */
export type TranslateCall = [string, Record<string, unknown> | undefined]

/** A value that is not a valid time, and what it is. */
export type BadTimeCase = [Date | number, string]
