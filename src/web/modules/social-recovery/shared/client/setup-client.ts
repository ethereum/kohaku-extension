/**
 * The setup client the screens use, over the SDK's: every member the SDK
 * serves as the screens need it passes through, and five keep the
 * extension's rules.
 *
 * - `validateSetup` judges an account with no code yet by the implementation
 *   it deploys behind its proxy. The action answers `supportsAccount` only
 *   for code that exists, so the `action.unsupported` the SDK raises for such
 *   an account is dropped where the wallet's fit check finds the
 *   implementation to be is the one the action serves, and kept otherwise.
 * - The clear splits into three writes. `prepareClearSetup` is the
 *   manager's clear alone, `prepareRemoveSetup` the clear with the revoke of
 *   the action's authorization where the account still grants it, and both
 *   refuse `setup.no-setup` where no setup stands, since the manager's clear
 *   reverts there. `prepareRemoveAuthorization` is the revoke alone, for an
 *   account whose setup is already gone, and refuses `setup.not-authorized`
 *   where the account does not authorize the action.
 * - `confirmSetup` reads a commit as landed only where the manager still
 *   holds its nonce and commitment after the SDK found its event, and refuses
 *   `confirm.commitment-mismatch` where the draft does not recompute to the
 *   commitment the prepared commit carries.
 * - `getSetup` under a password opens a clear backup too, which the SDK
 *   opens only from the configuration itself.
 *
 * A contract's revert met by the clear, the confirmation or the restore is
 * rethrown as the kit's named error.
 */
import {
  KitRefusalError,
  pinBlockHeader,
  SETUP_CLIENT_COMMITMENT_UNMATCHED_MESSAGE,
  setupStands
} from '@kohaku-eth/social-recovery'
import type {
  Configuration,
  ConfigurationSource,
  PinnedBlock,
  PreparedBatch,
  PreparedCall,
  PrepareOptions,
  SetupConfirmation,
  SetupDraft,
  ValidationError,
  ValidationResult
} from '@kohaku-eth/social-recovery'
import { isAddressEqual, size } from 'viem'

import { backupFormOf, openClearBackup } from './backup'
import { notificationsInChunks } from './events'
import { codedRefusal } from './refusals'
import { withNamedRevert } from './reverts'
import type { RecoverySetupClient, SetupClientInput } from './types'
import { confirmationAgainstState } from './wallet-reads'

export const createRecoverySetupClient = ({
  setup,
  policyManager,
  action,
  provider,
  account,
  descriptor,
  blockTags,
  logChunkSize,
  fitCheck
}: SetupClientInput): RecoverySetupClient => {
  const pin = async (): Promise<PinnedBlock> =>
    (await pinBlockHeader(provider, blockTags.read)).block

  const authorizedAt = async (block: PinnedBlock): Promise<boolean> =>
    size(await provider.code(account, block.number)) > 0 && action.isAuthorized(block)

  const standingSetup = async (): Promise<void> => {
    const block = await pin()
    const [state, isAuthorized] = await Promise.all([
      policyManager.stateOf(block),
      authorizedAt(block)
    ])
    if (!setupStands(state)) {
      throw codedRefusal('setup.no-setup', { isAuthorized })
    }
  }

  // The clear backup the standing setup keeps, where it keeps one.
  const clearBackupOf = async (): Promise<Configuration | undefined> => {
    const block = await pin()
    const state = await policyManager.stateOf(block)
    if (!setupStands(state)) {
      return undefined
    }
    const notifications = await notificationsInChunks(
      provider,
      setup.events,
      setup.events.accountFilter(),
      { from: state.setupCommittedAtBlock, to: block.number },
      logChunkSize
    )
    const commit = notifications.find(
      (log) =>
        log.kind === 'setup-committed' &&
        isAddressEqual(log.action, descriptor.action) &&
        log.nonce === state.setupNonce
    )
    if (commit?.kind !== 'setup-committed' || backupFormOf(commit.privateMetadata) !== 'clear') {
      return undefined
    }
    return openClearBackup(commit.privateMetadata)
  }

  return {
    events: setup.events,
    async validateSetup(draft: SetupDraft): Promise<ValidationResult> {
      const result = await setup.validateSetup(draft)
      const unsupported = ({ code }: ValidationError) => code === 'action.unsupported'
      if (!result.errors.some(unsupported)) {
        return result
      }
      const fit = await fitCheck()
      if (fit.basis !== 'code-to-be' || !fit.fits) {
        return result
      }
      return { ...result, errors: result.errors.filter((error) => !unsupported(error)) }
    },
    describeSetup: (draft: SetupDraft) => setup.describeSetup(draft),
    prepareCommitSetup: (draft: SetupDraft, password?: string, options?: PrepareOptions) =>
      setup.prepareCommitSetup(draft, password, options),
    setupState: () => setup.setupState(),

    prepareClearSetup(options?: PrepareOptions): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        await standingSetup()
        const prepared = await setup.prepareClearSetup(options)
        return prepared.kind === 'call' ? prepared : prepared.calls[0]
      })
    },

    prepareRemoveSetup(options?: PrepareOptions): Promise<PreparedBatch> {
      return withNamedRevert(async () => {
        await standingSetup()
        const prepared = await setup.prepareClearSetup(options)
        return prepared.kind === 'batch'
          ? prepared
          : { kind: 'batch', calls: [prepared], atomic: true, block: prepared.block }
      })
    },

    prepareRemoveAuthorization(): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        const block = await pin()
        if (!(await authorizedAt(block))) {
          throw codedRefusal('setup.not-authorized', { action: descriptor.action })
        }
        return action.disarmingCall(block)
      })
    },

    confirmSetup(
      draft: SetupDraft,
      prepared: PreparedCall | PreparedBatch
    ): Promise<SetupConfirmation> {
      return withNamedRevert(async () => {
        const confirmation = await setup.confirmSetup(draft, prepared).catch((thrown: unknown) => {
          if (
            thrown instanceof KitRefusalError &&
            thrown.message === SETUP_CLIENT_COMMITMENT_UNMATCHED_MESSAGE
          ) {
            throw codedRefusal('confirm.commitment-mismatch')
          }
          throw thrown
        })
        return confirmationAgainstState(confirmation, await policyManager.stateOf(await pin()))
      })
    },

    getSetup(source: ConfigurationSource): Promise<Configuration> {
      return withNamedRevert(async () => {
        if (!('password' in source)) {
          return setup.getSetup(source)
        }
        const clear = await clearBackupOf()
        return setup.getSetup(clear ?? source)
      })
    }
  }
}
