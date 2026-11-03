/**
 * The card's level and its carried mark. The screen is imported by path,
 * `./RecoveryCardScreen`, so this module loads in a Node test without the UI.
 */
export {
  CARD_FROM_KEY,
  CARD_FROM_MANAGE,
  levelFromSearch,
  levelOfBackup,
  openedFromManage
} from './card'
export { markCardCarried, wasCardCarried } from './carried'
export type { CardFile, CardLevel, PasswordAskAnswer } from './types'
