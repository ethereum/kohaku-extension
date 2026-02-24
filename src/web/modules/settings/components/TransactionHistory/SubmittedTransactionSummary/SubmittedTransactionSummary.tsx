/* eslint-disable @typescript-eslint/no-floating-promises */
import React, { useMemo } from 'react'
import { View, ViewStyle } from 'react-native'

import { Network } from '@ambire-common/interfaces/network'
import {
  isIdentifiedByMultipleTxn,
  SubmittedAccountOp
} from '@ambire-common/libs/accountOp/submittedAccountOp'
import { humanizeAccountOp } from '@ambire-common/libs/humanizer'
import { humanizePrivacyPoolsAccountOp } from '@ambire-common/libs/privacyPools/humanizer'
import { IrCall } from '@ambire-common/libs/humanizer/interfaces'
import SkeletonLoader from '@common/components/SkeletonLoader'
import useTheme from '@common/hooks/useTheme'
import { SPACING_SM } from '@common/styles/spacings'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import TransactionSummary, {
  sizeMultiplier
} from '@web/modules/sign-account-op/components/TransactionSummary'

import DelegationHumanization from '@web/components/DelegationHumanization'
import Footer from './Footer'
import getStyles from './styles'

interface Props {
  submittedAccountOp: SubmittedAccountOp
  style?: ViewStyle
  size?: 'sm' | 'md' | 'lg'
  // The primary difference is the ability to expand and view raw transaction details in 'full-info'. All other features are identical.
  defaultType: 'summary' | 'full-info'
}

const SubmittedTransactionSummaryInner = ({
  submittedAccountOp,
  size = 'lg',
  style,
  defaultType
}: Props) => {
  const { styles } = useTheme(getStyles)
  const { networks } = useNetworksControllerState()

  const network: Network | undefined = useMemo(
    () => networks.find((n) => n.chainId === submittedAccountOp.chainId),
    [networks, submittedAccountOp.chainId]
  )

  const calls = useMemo(
    () => {
      // Special handling for Privacy Pools related operations
      // These include PrivacyPoolsRelayer transactions and ImportedAccount records
      // Both have empty calls arrays, so humanizeAccountOp returns empty array
      // which causes skeleton to show. Use custom humanizer instead.
      if (
        submittedAccountOp.identifiedBy?.type === 'PrivacyPoolsRelayer' ||
        submittedAccountOp.identifiedBy?.type === 'ImportedAccount'
      ) {
        return humanizePrivacyPoolsAccountOp(submittedAccountOp)
      }

      return humanizeAccountOp(submittedAccountOp, { network }).map((call, index) => ({
        ...call,
        id: call.id || String(index)
      }))
    },
    // Humanize the calls only once. Because submittedAccountOp is an object
    // it causes rerenders on every activity update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      submittedAccountOp.txnId,
      submittedAccountOp.calls.length,
      submittedAccountOp.identifiedBy?.type,
      network
    ]
  )

  if (!network) return null

  if (!calls.length) {
    return (
      <View style={style}>
        <SkeletonLoader width="100%" height={112} />
      </View>
    )
  }

  const isDelegationTxn =
    submittedAccountOp.meta && submittedAccountOp.meta.setDelegation !== undefined

  return (
    <View
      style={[
        styles.container,
        style,
        {
          paddingTop: SPACING_SM * sizeMultiplier[size]
        }
      ]}
    >
      {!isDelegationTxn &&
        calls.map((call: IrCall) => (
          <TransactionSummary
            key={call.id}
            style={{ ...styles.summaryItem, marginBottom: SPACING_SM * sizeMultiplier[size] }}
            call={call}
            chainId={submittedAccountOp.chainId}
            isHistory
            enableExpand={defaultType === 'full-info'}
            size={size}
            hideLinks
          />
        ))}
      {isDelegationTxn && (
        <DelegationHumanization
          setDelegation={submittedAccountOp.meta?.setDelegation}
          delegatedContract={submittedAccountOp.meta?.delegation?.address}
          isBorderless
        />
      )}
      <Footer
        size={size}
        network={network}
        // rawCalls={submittedAccountOp.calls}
        txnId={submittedAccountOp.txnId}
        identifiedBy={submittedAccountOp.identifiedBy}
        accountAddr={submittedAccountOp.accountAddr}
        gasFeePayment={submittedAccountOp.gasFeePayment}
        status={submittedAccountOp.status}
        timestamp={submittedAccountOp.timestamp}
      />
    </View>
  )
}

const SubmittedTransactionSummary = ({
  submittedAccountOp,
  size = 'lg',
  style,
  defaultType
}: Props) => {
  // If the account op consists of multiple EOA transactions,
  // we need to divide them into separate components.
  // This will make them appear as if they were broadcasted one by one.
  const accountOpDividedIntoMultipleIfNeeded = isIdentifiedByMultipleTxn(
    submittedAccountOp.identifiedBy
  )
    ? submittedAccountOp.calls.reverse().map((call) => {
        return {
          ...submittedAccountOp,
          txnId: call.txnId,
          status: call.status,
          calls: [call],
          // if the call has a fee set, use it
          gasFeePayment: submittedAccountOp.gasFeePayment
            ? {
                ...submittedAccountOp.gasFeePayment,
                inToken: call.fee?.inToken
                  ? call.fee?.inToken
                  : submittedAccountOp.gasFeePayment.inToken,
                amount: call.fee?.amount
                  ? call.fee?.amount
                  : submittedAccountOp.gasFeePayment.amount
              }
            : null
        }
      })
    : [submittedAccountOp]

  return (
    <>
      {accountOpDividedIntoMultipleIfNeeded.map((op) => (
        <SubmittedTransactionSummaryInner
          key={op.txnId}
          submittedAccountOp={op}
          size={size}
          style={style}
          defaultType={defaultType}
        />
      ))}
    </>
  )
}

export default React.memo(SubmittedTransactionSummary)
