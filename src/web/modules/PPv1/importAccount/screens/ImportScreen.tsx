import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
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
import AddChainScreen from '../components/ImportForm'
import usePrivacyPoolsForm from '../../hooks/usePrivacyPoolsForm'

const { isActionWindow } = getUiType()

const ImportScreen = () => {
  const { handleLoadAccount } = usePrivacyPoolsForm()
  const { dispatch } = useBackgroundService()
  const { state } = useTransferControllerState()
  const { latestBroadcastedAccountOp } = state

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
      navigate(WEB_ROUTES.dashboard)
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

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId, identifiedBy, txnId } = submittedAccountOp

    if (!chainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({ chainId, txnId, identifiedBy })}`
  }, [submittedAccountOp])

  const [displayedView, setDisplayedView] = useState<'transfer' | 'track'>('transfer')
  const [trackProgress, setTrackProgress] = useState<AccountOpStatus>(AccountOpStatus.Pending)

  const handleImportSecretNote = useCallback(async () => {
    setDisplayedView('track')
    await handleLoadAccount()

    setTrackProgress(AccountOpStatus.Success)
  }, [handleLoadAccount])

  const headerTitle = 'Import Mnemonic'

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
          <InProgress title={t('Importing your secret note')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(trackProgress === AccountOpStatus.Success ||
          trackProgress === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Secret note imported!')}
            titleSecondary={t('Your balance has been updated')}
            explorerLink={explorerLink}
            openExplorerText="View Transaction"
          />
        )}

        {(trackProgress === AccountOpStatus.Failure ||
          trackProgress === AccountOpStatus.Rejected ||
          trackProgress === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={t(
              "We couldn't import your secret note. Please try again later or contact Ambire support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={<>,</>}>
      <Content buttons={<> </>}>
        <AddChainScreen handleImportSecretNote={handleImportSecretNote} />
      </Content>
    </Wrapper>
  )
}

export default React.memo(ImportScreen)
