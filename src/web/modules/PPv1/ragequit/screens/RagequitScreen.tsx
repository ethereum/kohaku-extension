import React, { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { getBenzinUrlParams } from '@ambire-common/utils/benzin'
import BackButton from '@common/components/BackButton'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import { ROUTES } from '@common/modules/router/constants/common'
import { Content, Form, Wrapper } from '@web/components/TransactionsScreen'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import TrackProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress'
import Completed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Completed'
import Failed from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/Failed'
import InProgress from '@web/modules/sign-account-op/components/OneClick/TrackProgress/ByStatus/InProgress'
import useTrackAccountOp from '@web/modules/sign-account-op/hooks/OneClick/useTrackAccountOp'
import RagequitForm from '@web/modules/PPv1/ragequit/components/RagequitForm'
import Buttons from '@web/modules/PPv1/ragequit/components/Buttons'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import { getUiType } from '@web/utils/uiType'

const { isTab, isActionWindow } = getUiType()

function RagequitScreen() {
  const { dispatch } = useBackgroundService()
  const { navigate } = useNavigation()
  const { t } = useTranslation()

  const { accountsOps } = useActivityControllerState()

  const {
    poolInfo,
    hasProceeded,
    estimationModalRef,
    signAccountOpController,
    latestBroadcastedAccountOp,
    isLoading,
    totalPendingBalance,
    totalDeclinedBalance,
    handleMultipleRagequit,
    closeEstimationModal
  } = usePrivacyPoolsForm()

  const ragequitableAccounts = useMemo(() => {
    return [...totalPendingBalance.accounts, ...totalDeclinedBalance.accounts].filter(
      (account) => !account.ragequit
    )
  }, [totalPendingBalance.accounts, totalDeclinedBalance.accounts])

  const submittedAccountOp = useMemo(() => {
    if (!accountsOps.privacyPools || !latestBroadcastedAccountOp?.signature) return

    return accountsOps.privacyPools.result.items.find(
      (accOp) => accOp.signature === latestBroadcastedAccountOp?.signature
    )
  }, [accountsOps.privacyPools, latestBroadcastedAccountOp?.signature])

  const navigateOut = useCallback(() => {
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'transfer'
        }
      })
    } else {
      navigate(ROUTES.pp1Home)
    }

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN'
    })
  }, [dispatch, navigate])

  const { sessionHandler, onPrimaryButtonPress } = useTrackAccountOp({
    address: latestBroadcastedAccountOp?.accountAddr,
    chainId: latestBroadcastedAccountOp?.chainId,
    sessionId: 'privacyPools',
    submittedAccountOp,
    navigateOut
  })

  const explorerLink = useMemo(() => {
    if (!submittedAccountOp) return

    const { chainId, identifiedBy, txnId } = submittedAccountOp

    if (!chainId || !identifiedBy || !txnId) return

    return `https://explorer.ambire.com/${getBenzinUrlParams({ chainId, txnId, identifiedBy })}`
  }, [submittedAccountOp])

  useEffect(() => {
    // Optimization: Don't apply filtration if we don't have a recent broadcasted account op
    if (!latestBroadcastedAccountOp?.accountAddr || !latestBroadcastedAccountOp?.chainId) return

    sessionHandler.initSession()

    return () => {
      sessionHandler.killSession()
    }
  }, [latestBroadcastedAccountOp?.accountAddr, latestBroadcastedAccountOp?.chainId, sessionHandler])

  const displayedView: 'transfer' | 'track' = useMemo(() => {
    if (latestBroadcastedAccountOp) return 'track'

    return 'transfer'
  }, [latestBroadcastedAccountOp])

  useEffect(() => {
    return () => {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_UNLOAD_SCREEN' })
    }
  }, [dispatch])

  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'PrivacyPools'
      }
    })
  }, [dispatch])

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS',
        params: {
          status
        }
      })
    },
    [dispatch]
  )

  const updateController = useCallback(
    (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => {
      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  const isRagequitFormValid = useMemo(() => {
    return !!(ragequitableAccounts.length > 0 && poolInfo) && !isLoading
  }, [ragequitableAccounts.length, poolInfo, isLoading])

  const onBack = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

  const headerTitle = t('Ragequit')
  const formTitle = t('Exit Pool')

  const buttons = useMemo(() => {
    return (
      <>
        {isTab && <BackButton onPress={onBack} />}
        <Buttons
          handleSubmitForm={handleMultipleRagequit}
          proceedBtnText={
            ragequitableAccounts.length > 1
              ? t('Ragequit ({{count}})', { count: ragequitableAccounts.length })
              : t('Ragequit')
          }
          isNotReadyToProceed={!isRagequitFormValid}
          isLoading={isLoading}
          signAccountOpErrors={[]}
          networkUserRequests={[]}
        />
      </>
    )
  }, [
    onBack,
    handleMultipleRagequit,
    isRagequitFormValid,
    isLoading,
    ragequitableAccounts.length,
    t
  ])

  const handleGoBackPress = useCallback(() => {
    navigate(ROUTES.pp1Home)
  }, [navigate])

  if (displayedView === 'track') {
    return (
      <TrackProgress
        onPrimaryButtonPress={onPrimaryButtonPress}
        secondaryButtonText={t('Add more')}
        handleClose={() => {
          dispatch({
            type: 'PRIVACY_POOLS_CONTROLLER_DESTROY_LATEST_BROADCASTED_ACCOUNT_OP'
          })
        }}
      >
        {submittedAccountOp?.status === AccountOpStatus.BroadcastedButNotConfirmed && (
          <InProgress title={t('Confirming your ragequit')}>
            <Text fontSize={16} weight="medium" appearance="secondaryText">
              {t('Almost there!')}
            </Text>
          </InProgress>
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Success ||
          submittedAccountOp?.status === AccountOpStatus.UnknownButPastNonce) && (
          <Completed
            title={t('Ragequit complete!')}
            titleSecondary={t('You have successfully exited the pool!')}
            explorerLink={explorerLink}
            openExplorerText="View Transaction"
          />
        )}
        {(submittedAccountOp?.status === AccountOpStatus.Failure ||
          submittedAccountOp?.status === AccountOpStatus.Rejected ||
          submittedAccountOp?.status === AccountOpStatus.BroadcastButStuck) && (
          <Failed
            title={t('Something went wrong!')}
            errorMessage={t(
              "We couldn't complete your ragequit. Please try again later or contact Ambire support."
            )}
          />
        )}
      </TrackProgress>
    )
  }

  return (
    <Wrapper title={headerTitle} handleGoBack={handleGoBackPress} buttons={buttons}>
      <Content buttons={buttons}>
        <Form>
          <RagequitForm
            poolInfo={poolInfo}
            totalPendingBalance={totalPendingBalance}
            totalDeclinedBalance={totalDeclinedBalance}
            formTitle={formTitle}
          />
        </Form>
      </Content>

      <Estimation
        updateType="PrivacyPools"
        estimationModalRef={estimationModalRef}
        closeEstimationModal={closeEstimationModal}
        updateController={updateController}
        handleUpdateStatus={handleUpdateStatus}
        handleBroadcastAccountOp={handleBroadcastAccountOp}
        hasProceeded={!!hasProceeded}
        signAccountOpController={signAccountOpController || null}
      />
    </Wrapper>
  )
}

export default React.memo(RagequitScreen)
