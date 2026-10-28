/**
 * The review's route: the settings chrome around the review of the setup
 * records of the tab's account, with the recovery client that reads the trust list.
 * A basic account, which this release cannot recover, sees that refusal in
 * place of the review, before any record of a draft is read.
 */
import React, { useMemo } from 'react'
import { View } from 'react-native'
import { isAddress, isAddressEqual } from 'viem'

import { isSmartAccount } from '@ambire-common/libs/account/account'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import { ActionsRow, PageTitle, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import {
  SETUP_STAGE_COUNTER_KEY,
  SETUP_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import CannotRecoverCard from './CannotRecoverCard'
import ReviewView from './ReviewView'
import type { ReviewClient } from './types'

const ReviewScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const { accounts } = useAccountsControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The wallet's own record of the tab's account, from the background's state push.
  const listed = account
    ? accounts?.find(
        (candidate) => isAddress(candidate.addr) && isAddressEqual(candidate.addr, account)
      )
    : undefined
  const accountLabel = listed?.preferences?.label || undefined
  const basicAccount = !!listed && !isSmartAccount(listed)
  // Only the review reads through the client, so a refused basic account builds none.
  const clientState = useRecoveryClient(basicAccount ? undefined : account)

  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ReviewClient>(() => {
    if (kit) {
      return { status: 'ready', client: kit }
    }
    if (status === 'loading') {
      return { status: 'loading' }
    }
    if (status === 'update-the-wallet') {
      return { status: 'update-the-wallet', retry }
    }
    return { status: 'failed', retry }
  }, [kit, status, retry])

  return (
    <SetupChrome
      // The refusal is no step of the setup, so it shows no stage counter.
      counter={
        basicAccount
          ? undefined
          : {
              labelKey: SETUP_STAGE_COUNTER_KEY,
              step: 5,
              total: SETUP_STAGES,
              testID: 'review-stage'
            }
      }
    >
      {!!account && basicAccount && (
        <TwoColumn testID="review-columns">
          <View testID="review">
            <PageTitle title={t('socialRecovery.review.title')} titleTestID="review-title" />
            <CannotRecoverCard blocked={{ kind: 'cannot-recover', reason: 'not-supported' }} />
            <ActionsRow
              primary={
                <Button
                  testID="review-back"
                  type="outline"
                  text={t('socialRecovery.ceremony.backAction')}
                  onPress={() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy)}
                  hasBottomSpacing={false}
                />
              }
            />
          </View>
        </TwoColumn>
      )}
      {!!account && !basicAccount && (
        <ReviewView
          key={account}
          records={records}
          chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
          account={account}
          client={client}
          accountLabel={accountLabel}
          basicAccount={basicAccount}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(ReviewScreen)
