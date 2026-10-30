import type { SetupAccount } from '@web/modules/social-recovery/shared/chrome/types'

/** A setup tab with no account latched and no other account selected. */
const useSetupAccount = (): SetupAccount => ({
  account: undefined,
  differs: false,
  selected: undefined,
  switchToSelected: () => {}
})

export default useSetupAccount
