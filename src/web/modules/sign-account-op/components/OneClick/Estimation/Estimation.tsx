import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'

import {
  SignAccountOpController,
  SigningStatus
} from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import Text from '@common/components/Text'
import useSign from '@common/hooks/useSign'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useColibriSimulation from '@web/hooks/useColibriSimulation'
import ColibriSimulationResult from '@web/modules/sign-account-op/components/ColibriSimulationResult'
import Estimation from '@web/modules/sign-account-op/components/Estimation'
import Modals from '@web/modules/sign-account-op/components/Modals/Modals'
import SigningKeySelect from '@web/modules/sign-message/components/SignKeySelect'
import { getUiType } from '@web/utils/uiType'

type Props = {
  closeEstimationModal: () => void
  handleBroadcastAccountOp: () => void
  handleUpdateStatus: (status: SigningStatus) => void
  updateController: (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => void
  estimationModalRef: React.RefObject<any>
  errors?: SignAccountOpError[]
  signAccountOpController: SignAccountOpController | null
  hasProceeded: boolean
  updateType: 'Swap&Bridge' | 'Transfer&TopUp' | 'PrivacyPools' | 'Railgun'
}

const { isActionWindow, isTab } = getUiType()

const OneClickEstimation = ({
  closeEstimationModal,
  handleBroadcastAccountOp,
  handleUpdateStatus,
  updateController,
  estimationModalRef,
  signAccountOpController,
  hasProceeded,
  errors,
  updateType
}: Props) => {
  const { t } = useTranslation()
  const { theme, themeType } = useTheme()

  const signingErrors = useMemo(() => {
    const signAccountOpErrors = signAccountOpController ? signAccountOpController.errors : []
    return [...(errors || []), ...signAccountOpErrors]
  }, [errors, signAccountOpController])

  const {
    isViewOnly,
    hasEstimation,
    signingKeyType,
    feePayerKeyType,
    handleDismissLedgerConnectModal,
    shouldDisplayLedgerConnectModal,
    isChooseSignerShown,
    setIsChooseSignerShown,
    isSignLoading,
    renderedButNotNecessarilyVisibleModal,
    handleChangeSigningKey,
    onSignButtonClick,
    isSignDisabled,
    warningToPromptBeforeSign,
    warningModalRef,
    dismissWarning,
    acknowledgeWarning,
    slowPaymasterRequest,
    primaryButtonText,
    bundlerNonceDiscrepancy,
    network
  } = useSign({
    signAccountOpState: signAccountOpController,
    handleBroadcast: handleBroadcastAccountOp,
    handleUpdate: updateController,
    handleUpdateStatus,
    isOneClickSign: true
  })

  const {
    isLoading: isSimulating,
    result: simulationResult,
    error: simulationError,
    isColibriAvailable,
    isSimulationEnabled,
    simulate: handleSimulate
  } = useColibriSimulation(network, signAccountOpController?.accountOp)

  return (
    <>
      <BottomSheet
        id="estimation-modal"
        sheetRef={estimationModalRef}
        type={isTab ? 'modal' : 'bottom-sheet'}
        backgroundColor={
          themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'
        }
        // NOTE: This must be lower than SigningKeySelect's z-index
        customZIndex={5}
        autoOpen={hasProceeded || (isActionWindow && !!signAccountOpController)}
        isScrollEnabled={false}
        shouldBeClosableOnDrag={false}
      >
        {!!signAccountOpController && (
          <View style={{ maxHeight: 420 }}>
            <SigningKeySelect
              isVisible={isChooseSignerShown}
              isSigning={isSignLoading || !signAccountOpController.readyToSign}
              handleClose={() => setIsChooseSignerShown(false)}
              selectedAccountKeyStoreKeys={signAccountOpController.accountKeyStoreKeys}
              handleChooseSigningKey={handleChangeSigningKey}
              account={signAccountOpController.account}
            />
            <ScrollView style={flexbox.flex1} showsVerticalScrollIndicator>
              <Estimation
                updateType={updateType}
                signAccountOpState={signAccountOpController}
                disabled={signAccountOpController.status?.type !== SigningStatus.ReadyToSign}
                hasEstimation={!!hasEstimation}
                // TODO<oneClickSwap>
                slowRequest={false}
                // TODO<oneClickSwap>
                isViewOnly={isViewOnly}
                isSponsored={signAccountOpController ? signAccountOpController.isSponsored : false}
                sponsor={signAccountOpController ? signAccountOpController.sponsor : undefined}
              />
              {signingErrors.length > 0 && (
                <View style={[flexbox.directionRow, flexbox.alignEnd, spacings.mt]}>
                  <Text fontSize={12} appearance="errorText">
                    {t(signingErrors[0].title)}
                  </Text>
                </View>
              )}
              {bundlerNonceDiscrepancy && (
                <View style={[flexbox.directionRow, flexbox.alignEnd, spacings.mt]}>
                  <Text fontSize={12} appearance="warningText">
                    {t(bundlerNonceDiscrepancy.title)}
                  </Text>
                </View>
              )}

              {isSimulationEnabled && (
                <ColibriSimulationResult
                  isLoading={isSimulating}
                  result={simulationResult}
                  error={simulationError}
                  isColibriAvailable={isColibriAvailable}
                />
              )}
            </ScrollView>

            <View
              style={{
                height: 1,
                backgroundColor: theme.secondaryBorder,
                ...spacings.mvLg
              }}
            />
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
              <Button
                testID="back-button"
                type="secondary"
                text={t('Back')}
                onPress={closeEstimationModal}
                hasBottomSpacing={false}
                disabled={isSignLoading}
                style={{ width: 98 }}
              />
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                {!!handleSimulate && (
                  <Button
                    testID="simulate-button"
                    type="outline"
                    text={isSimulating ? t('Simulating...') : t('Simulate')}
                    onPress={handleSimulate}
                    disabled={!hasEstimation || isSignLoading || isSimulating}
                    hasBottomSpacing={false}
                    style={{ minWidth: 100, ...spacings.mrTy }}
                  />
                )}
                <ButtonWithLoader
                  testID="sign-button"
                  text={primaryButtonText}
                  isLoading={isSignLoading}
                  disabled={isSignDisabled || signingErrors.length > 0}
                  onPress={onSignButtonClick}
                />
              </View>
            </View>
          </View>
        )}
      </BottomSheet>
      <Modals
        renderedButNotNecessarilyVisibleModal={renderedButNotNecessarilyVisibleModal}
        signAccountOpState={signAccountOpController}
        warningModalRef={warningModalRef}
        feePayerKeyType={feePayerKeyType}
        signingKeyType={signingKeyType}
        slowPaymasterRequest={slowPaymasterRequest}
        shouldDisplayLedgerConnectModal={shouldDisplayLedgerConnectModal}
        handleDismissLedgerConnectModal={handleDismissLedgerConnectModal}
        warningToPromptBeforeSign={warningToPromptBeforeSign}
        acknowledgeWarning={acknowledgeWarning}
        dismissWarning={dismissWarning}
        autoOpen={
          // Display the warning automatically if the user closed
          // the extension popup while the warning modal was open.
          warningToPromptBeforeSign &&
          renderedButNotNecessarilyVisibleModal === 'warnings' &&
          isSignLoading
            ? 'warnings'
            : undefined
        }
        actionType={updateType === 'Swap&Bridge' ? 'swapAndBridge' : 'transfer'}
      />
    </>
  )
}

export default OneClickEstimation
