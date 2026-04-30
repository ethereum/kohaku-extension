import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { SignAccountOpController } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import BottomSheet from '@common/components/BottomSheet'
import DualChoiceWarningModal from '@common/components/DualChoiceWarningModal'
import useSign from '@common/hooks/useSign'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import text from '@common/styles/utils/text'
import useMainControllerState from '@web/hooks/useMainControllerState'
import LedgerConnectModal from '@web/modules/hardware-wallet/components/LedgerConnectModal'
import SignAccountOpHardwareWalletSigningModal from '@web/modules/sign-account-op/components/SignAccountOpHardwareWalletSigningModal'
import { getUiType } from '@web/utils/uiType'

import getStyles from './styles'

const { isTab } = getUiType()

type Props = Pick<
  ReturnType<typeof useSign>,
  | 'renderedButNotNecessarilyVisibleModal'
  | 'warningModalRef'
  | 'feePayerKeyType'
  | 'signingKeyType'
  | 'slowPaymasterRequest'
  | 'shouldDisplayLedgerConnectModal'
  | 'handleDismissLedgerConnectModal'
  | 'warningToPromptBeforeSign'
  | 'acknowledgeWarning'
  | 'dismissWarning'
> & {
  signAccountOpState: SignAccountOpController | null
  autoOpen?: 'warnings'
  actionType?: 'swapAndBridge' | 'transfer' | 'privacyPoolsV1'
}

const Modals: FC<Props> = ({
  renderedButNotNecessarilyVisibleModal,
  signAccountOpState,
  warningModalRef,
  feePayerKeyType,
  signingKeyType,
  slowPaymasterRequest,
  shouldDisplayLedgerConnectModal,
  handleDismissLedgerConnectModal,
  warningToPromptBeforeSign,
  acknowledgeWarning,
  dismissWarning,
  autoOpen,
  actionType
}) => {
  const { styles } = useTheme(getStyles)
  const { t } = useTranslation()
  const mainState = useMainControllerState()

  if (renderedButNotNecessarilyVisibleModal === 'warnings') {
    return (
      <BottomSheet
        id="warning-modal"
        closeBottomSheet={!slowPaymasterRequest ? dismissWarning : undefined}
        sheetRef={warningModalRef}
        style={styles.warningsModal}
        type={isTab ? 'modal' : 'bottom-sheet'}
        withBackdropBlur={false}
        shouldBeClosableOnDrag={false}
        autoOpen={autoOpen === 'warnings'}
      >
        {warningToPromptBeforeSign && (
          <DualChoiceWarningModal
            title={t(warningToPromptBeforeSign.title)}
            description={t(warningToPromptBeforeSign.text || '')}
            primaryButtonText={t('Proceed')}
            secondaryButtonText={t('Cancel')}
            onPrimaryButtonPress={acknowledgeWarning}
            onSecondaryButtonPress={dismissWarning}
          />
        )}
        {slowPaymasterRequest && (
          <DualChoiceWarningModal.Wrapper>
            <DualChoiceWarningModal.ContentWrapper>
              <DualChoiceWarningModal.TitleAndIcon
                title={t('Sending transaction is taking longer than expected')}
                style={spacings.mbTy}
              />
              <DualChoiceWarningModal.Text
                style={{ ...text.center, ...spacings.mbLg }}
                text={t('Please wait...')}
                weight="medium"
              />
              <DualChoiceWarningModal.Text
                style={{ ...text.center, fontSize: 14, ...spacings.mb }}
                text={t('(Reason: paymaster is taking longer than expected)')}
              />
            </DualChoiceWarningModal.ContentWrapper>
          </DualChoiceWarningModal.Wrapper>
        )}
      </BottomSheet>
    )
  }

  if (renderedButNotNecessarilyVisibleModal === 'ledger-connect') {
    return (
      <LedgerConnectModal
        isVisible={shouldDisplayLedgerConnectModal}
        handleClose={handleDismissLedgerConnectModal}
        displayOptionToAuthorize={false}
      />
    )
  }

  if (renderedButNotNecessarilyVisibleModal === 'hw-sign' && signAccountOpState) {
    return (
      <SignAccountOpHardwareWalletSigningModal
        signingKeyType={signingKeyType}
        feePayerKeyType={feePayerKeyType}
        signAndBroadcastAccountOpStatus={mainState.statuses.signAndBroadcastAccountOp}
        signAccountOpStatusType={signAccountOpState.status?.type}
        shouldSignAuth={signAccountOpState.shouldSignAuth}
        signedTransactionsCount={signAccountOpState.signedTransactionsCount}
        accountOp={signAccountOpState.accountOp}
        actionType={actionType}
      />
    )
  }

  return null
}

export default Modals
