/** A word the string table never uses, and the pattern that finds it in any letter case. */
export type BannedTerm = { term: string; pattern: RegExp }

/** The props of the stand-in honesty view: its one action. */
export type HonestyViewProps = { onCustomize: () => void }
