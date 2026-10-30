import type { internalKey } from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/harness'
import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'

/** Keys that are not an ordinary recovery phrase: the case's name and the keys the wallet holds. */
export type KeysCase = { name: string; keys: ReturnType<typeof internalKey>[] }

/** A failure of the key step: the case's name and how the mocked calls end. */
export type FailureCase = { name: string; ends: Record<string, unknown> }

/** A wallet that does not hold the phrase: the case's name, its accounts and its keys. */
export type NotHeldCase = { name: string; accounts: Account[]; keys: Key[] }
