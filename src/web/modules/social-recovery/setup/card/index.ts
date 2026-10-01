/**
 * The card's level and its carried mark. The screen is imported by path,
 * `./RecoveryCardScreen`, so this module loads in a Node test without the UI.
 */
export { levelFromSearch, levelOfBackup } from './card'
export { markCardCarried, wasCardCarried } from './carried'
export type { CardFile, CardLevel, PasswordAskAnswer } from './types'
