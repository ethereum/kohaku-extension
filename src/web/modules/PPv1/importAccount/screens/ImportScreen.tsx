import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import { Content, Wrapper } from '@web/components/TransactionsScreen'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useTransferControllerState from '@web/hooks/useTransferControllerState'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import { getUiType } from '@web/utils/uiType'
import usePrivacyPoolsControllerState from '@web/hooks/usePrivacyPoolsControllerState'
import { getPPv1Accounts } from '@web/modules/PPv1/sdk/misc'
import AddChainScreen from '../components/ImportForm'

const { isActionWindow } = getUiType()

const ImportScreen = () => {
  const { dispatch } = useBackgroundService()
  const { state } = useTransferControllerState()
  const { latestBroadcastedAccountOp } = state
  const { addImportedPrivateAccount, seedPhrase, importedPrivateAccounts } =
    usePrivacyPoolsControllerState()
  const { navigate } = useNavigation()
  const { t } = useTranslation()

  const { accountsOps } = useActivityControllerState()

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.transfer || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.transfer.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp.signature
    )
  }, [accountsOps.transfer, latestBroadcastedAccountOp?.signature])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(WEB_ROUTES.pp1Home)
    }

    dispatch({
      type: 'TRANSFER_CONTROLLER_RESET_FORM'
    })
  }, [dispatch, navigate])

  const { onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId: 'transfer',
    submittedAccountOp,
    navigateOut
  })

  const [displayedView, setDisplayedView] = useState<'transfer' | 'track'>('transfer')
  const [trackProgress, setTrackProgress] = useState<AccountOpStatus>(AccountOpStatus.Pending)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)

  const defaultAccountName = useMemo(() => {
    const existingCount = importedPrivateAccounts.filter((accounts) => accounts.length > 0).length
    return `Privacy Pools #${existingCount + 1}`
  }, [importedPrivateAccounts])

  const [accountName, setAccountName] = useState(defaultAccountName)

  useEffect(() => {
    setAccountName(defaultAccountName)
  }, [defaultAccountName])

  useEffect(() => {
    async function checkForDuplicate() {
      if (!seedPhrase || seedPhrase.trim().length === 0) {
        setIsDuplicate(false)
        return
      }

      setIsCheckingDuplicate(true)
      try {
        const existingAccounts = await getPPv1Accounts()
        const normalizedSeedPhrase = seedPhrase.trim().toLowerCase()

        const duplicate = existingAccounts.some((account) => {
          if ('mnemonic' in account) {
            return account.mnemonic.trim().toLowerCase() === normalizedSeedPhrase
          }
          return false
        })

        setIsDuplicate(duplicate)
      } catch {
        setIsDuplicate(false)
      } finally {
        setIsCheckingDuplicate(false)
      }
    }

    checkForDuplicate().catch(() => {
      setIsDuplicate(false)
    })
  }, [seedPhrase])

  const handleImportSecretNote = useCallback(async () => {
    if (isDuplicate || !accountName.trim()) return

    setDisplayedView('track')
    await addImportedPrivateAccount({ mnemonic: seedPhrase, name: accountName.trim() })

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_ADD_IMPORTED_ACCOUNT_TO_ACTIVITY_CONTROLLER',
      params: { accountName: accountName.trim() }
    })

    setTrackProgress(AccountOpStatus.Success)
  }, [isDuplicate, accountName, addImportedPrivateAccount, seedPhrase, dispatch])

  const headerTitle = 'New Private Account'

  const handleGoBackPress = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={onPrimaryButtonPress}
        handleClose={() => {
          dispatch({
            type: 'TRANSFER_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })
        }}
      >
        {trackProgress === AccountOpStatus.Pending && (
          <InProgress title={t('Importing your Privacy Pool account')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Fetching account deposit details...')}
            </Text>
          </InProgress>
        )}
        {(trackProgress === AccountOpStatus.Success ||
          trackProgress === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Private account imported successfully!')}
            titleSecondary={t('Your Privacy Pool account is ready to use')}
            openExplorerText="View Transaction"
          />
        )}

        {(trackProgress === AccountOpStatus.Failure ||
          trackProgress === AccountOpStatus.Rejected ||
          trackProgress === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Import failed')}
            errorMessage={t(
              "We couldn't import your Privacy Pool account. Please verify your mnemonic and try again, or contact Kohaku support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={<>,</>}>
      <Content buttons={<> </>}>
        <AddChainScreen
          handleImportSecretNote={handleImportSecretNote}
          isDuplicate={isDuplicate}
          isCheckingDuplicate={isCheckingDuplicate}
          accountName={accountName}
          onAccountNameChange={setAccountName}
        />
      </Content>
    </Wrapper>
  )
}

export default React.memo(ImportScreen)
