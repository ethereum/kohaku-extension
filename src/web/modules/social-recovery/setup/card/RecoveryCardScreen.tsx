/**
 * The Recovery Card in the settings chrome, for the selected account on the
 * recovery chain. The level comes from the route's search the save passes,
 * else from the stored draft; with neither, the card takes the hidden level,
 * which carries the password row and so never drops the password silently.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isAddress } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import { levelFromSearch, levelOfBackup } from './card'
import { markCardCarried, wasCardCarried } from './carried'
import { BROWSER_CARRIERS } from './carriers'
import ExtensionPasswordAsk from './ExtensionPasswordAsk'
import RecoveryCardView from './RecoveryCardView'
import type { DraftLevel, PasswordAskAnswer } from './types'
import { useCardPassword } from './useCardPassword'

const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const renderPasswordAsk = (answer: PasswordAskAnswer) => <ExtensionPasswordAsk {...answer} />

const RecoveryCardScreen = () => {
  const { navigate, goBack } = useNavigation()
  const location = useLocation()
  const { account } = useSelectedAccountControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The selected account arrives from the background's state push.
  const address = account && isAddress(account.addr) ? account.addr : null
  const searchLevel = useMemo(() => levelFromSearch(location.search), [location.search])
  // The draft's level belongs to the account it was read for, so another
  // account never shows it while its own draft loads.
  const [draftLevel, setDraftLevel] = useState<DraftLevel | null>(null)

  useEffect(() => {
    if (!address || searchLevel) {
      return
    }
    let live = true
    records
      .setup(chainId, address)
      .setupDraft.read()
      .then((draft) => {
        if (!live) {
          return
        }
        setDraftLevel({
          address,
          level: draft.status === 'present' ? levelOfBackup(draft.value.privacy.backup) : 'hidden'
        })
      })
      .catch(() => {
        if (live) {
          setDraftLevel({ address, level: 'hidden' })
        }
      })
    return () => {
      live = false
    }
  }, [records, address, searchLevel])

  const level =
    searchLevel ?? (draftLevel && draftLevel.address === address ? draftLevel.level : null)
  const { password, missingPassword } = useCardPassword(address, level)
  const carriedBefore = useMemo(
    () => (address ? wasCardCarried(chainId, address) : false),
    [address]
  )

  const onCarried = useCallback(() => {
    if (address) {
      markCardCarried(chainId, address)
    }
  }, [address])
  const toManage = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManage), [navigate])
  const toPrivacy = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy), [navigate])

  return (
    <SetupChrome>
      {!!address && !!level && (
        <RecoveryCardView
          key={address}
          account={address}
          level={level}
          password={password}
          missingPassword={missingPassword}
          carriedBefore={carriedBefore}
          onCarried={onCarried}
          carriers={BROWSER_CARRIERS}
          renderPasswordAsk={renderPasswordAsk}
          onSetPasswordAgain={toPrivacy}
          onBack={goBack}
          onContinue={toManage}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(RecoveryCardScreen)
