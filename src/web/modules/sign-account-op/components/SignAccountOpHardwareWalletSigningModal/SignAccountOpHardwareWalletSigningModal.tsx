import React, { useEffect, useMemo } from 'react'
import { View } from 'react-native'

import { MainController } from '@ambire-common/controllers/main/main'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Key } from '@ambire-common/interfaces/keystore'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import Text from '@common/components/Text'
import usePrevious from '@common/hooks/usePrevious'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import HardwareWalletSigningModal from '@web/modules/hardware-wallet/components/HardwareWalletSigningModal'
import { getUiType } from '@web/utils/uiType'

const { isPopup } = getUiType()

interface Props {
  signingKeyType?: AccountOp['signingKeyType']
  feePayerKeyType?: Key['type']
  signAndBroadcastAccountOpStatus: MainController['statuses']['signAndBroadcastAccountOp']
  signAccountOpStatusType?: SigningStatus
  shouldSignAuth: {
    type: 'V2Deploy' | '7702'
    text: string
  } | null
  signedTransactionsCount?: number | null
  accountOp: AccountOp
  actionType?: 'swapAndBridge' | 'transfer' | 'privacyPoolsV1'
}

const SignAccountOpHardwareWalletSigningModal: React.FC<Props> = ({
  signingKeyType,
  feePayerKeyType,
  signAndBroadcastAccountOpStatus,
  signAccountOpStatusType,
  shouldSignAuth,
  signedTransactionsCount,
  accountOp,
  actionType
}: Props) => {
  const { dispatch } = useBackgroundService()
  const { addToast } = useToast()

  const prevTransactionCount = usePrevious(signedTransactionsCount)

  const shouldBeVisible = useMemo(() => {
    // we're not signing or broadcasting on paused updates
    if (signAccountOpStatusType === SigningStatus.UpdatesPaused) return false

    const isCurrentlyBroadcastingWithExternalKey =
      signAndBroadcastAccountOpStatus === 'BROADCASTING' &&
      !!feePayerKeyType &&
      feePayerKeyType !== 'internal'
    const isCurrentlySigningWithExternalKey =
      signAccountOpStatusType === SigningStatus.InProgress &&
      !!signingKeyType &&
      signingKeyType !== 'internal'

    return isCurrentlyBroadcastingWithExternalKey || isCurrentlySigningWithExternalKey
  }, [signAndBroadcastAccountOpStatus, feePayerKeyType, signAccountOpStatusType, signingKeyType])

  const currentlyInvolvedSignOrBroadcastKeyType = useMemo(
    () => (signAccountOpStatusType === SigningStatus.InProgress ? signingKeyType : feePayerKeyType),
    [feePayerKeyType, signAccountOpStatusType, signingKeyType]
  )

  useEffect(() => {
    const isSigningOneOfMultipleAsEoa = typeof signedTransactionsCount === 'number'

    if (!isSigningOneOfMultipleAsEoa) return

    const hasJustSigned = signedTransactionsCount > (prevTransactionCount || 0)

    if (hasJustSigned) {
      const hasSignedLast = signedTransactionsCount === accountOp?.calls.length

      addToast(
        `Transaction ${signedTransactionsCount} / ${accountOp?.calls.length} signed! ${
          hasSignedLast ? 'Broadcasting...' : 'Sending next...'
        }`
      )
    }
  }, [accountOp?.calls.length, addToast, prevTransactionCount, signedTransactionsCount])

  useEffect(() => {
    if (
      shouldBeVisible &&
      isPopup &&
      actionType &&
      currentlyInvolvedSignOrBroadcastKeyType === 'trezor'
    ) {
      // If the user needs to sign using a hardware wallet, we need to open the
      // screen in an action window and close the popup
      dispatch({
        type: 'OPEN_SIGNING_ACTION_WINDOW',
        params: {
          type: actionType
        }
      })
      window.close()
    }
  }, [actionType, currentlyInvolvedSignOrBroadcastKeyType, dispatch, shouldBeVisible])

  if (!currentlyInvolvedSignOrBroadcastKeyType) return null

  return (
    <HardwareWalletSigningModal
      isVisible={shouldBeVisible}
      keyType={currentlyInvolvedSignOrBroadcastKeyType}
    >
      {typeof signedTransactionsCount === 'number' ? (
        <View style={[flexbox.alignCenter, flexbox.justifyCenter, spacings.ptLg]}>
          <Text weight="medium" fontSize={16}>
            {signedTransactionsCount} / {accountOp?.calls.length}{' '}
            {signedTransactionsCount === 1 ? 'transaction' : 'transactions'} signed
          </Text>
        </View>
      ) : null}

      {shouldSignAuth ? (
        <View style={[flexbox.alignCenter, flexbox.justifyCenter, spacings.ptLg]}>
          <Text weight="medium" fontSize={16}>
            {shouldSignAuth.text}
          </Text>
        </View>
      ) : null}
    </HardwareWalletSigningModal>
  )
}

export default React.memo(SignAccountOpHardwareWalletSigningModal)
