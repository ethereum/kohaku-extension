import React, { ReactNode } from 'react'
import { View } from 'react-native'

import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import Panel from '@common/components/Panel'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { formatEther } from 'viem'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
import styles from './styles'

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return '#28a745'
    case 'declined':
      return '#dc3545'
    case 'exited':
      return '#ffc107'
    case 'spent':
      return '#6c757d'
    default:
      return '#007bff'
  }
}

function RagequitForm({
  poolInfo,
  totalPendingBalance,
  totalDeclinedBalance,
  formTitle
}: {
  poolInfo?: PoolInfo
  totalPendingBalance: { total: bigint; accounts: PoolAccount[] }
  totalDeclinedBalance: { total: bigint; accounts: PoolAccount[] }
  formTitle: string | ReactNode
}) {
  const { t } = useTranslation()

  const ragequitableAccounts = [
    ...totalPendingBalance.accounts,
    ...totalDeclinedBalance.accounts
  ].filter((account) => !account.ragequit)

  const totalAmount = ragequitableAccounts.reduce((sum, account) => sum + account.balance, 0n)

  if (!poolInfo) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
            {t('No privacy pool available on this chain. Please switch to Sepolia testnet.')}
          </Text>
        </View>
      </ScrollableWrapper>
    )
  }

  if (ragequitableAccounts.length === 0) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Text appearance="secondaryText" fontSize={16} weight="medium" style={spacings.mbTy}>
            {formTitle}
          </Text>
          <Panel style={spacings.mtLg}>
            <Text appearance="secondaryText" fontSize={14} weight="regular">
              {t(
                'No accounts available to ragequit. Only pending or declined accounts can exit the pool.'
              )}
            </Text>
          </Panel>
        </View>
      </ScrollableWrapper>
    )
  }

  return (
    <ScrollableWrapper contentContainerStyle={styles.container}>
      <View style={spacings.mbLg}>
        <Text appearance="secondaryText" fontSize={16} weight="medium" style={spacings.mbTy}>
          {formTitle}
        </Text>

        <Panel style={spacings.mtLg}>
          <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mbLg]}>
            <Text weight="semiBold" fontSize={16}>
              {t('Total to Ragequit')}
            </Text>
            <Text weight="semiBold" fontSize={16} appearance="successText">
              {formatEther(totalAmount)} ETH
            </Text>
          </View>

          <View style={spacings.mtLg}>
            <Text weight="medium" fontSize={14} style={spacings.mbMi}>
              {t('Accounts to Exit')} ({ragequitableAccounts.length})
            </Text>

            {ragequitableAccounts.map((account, index) => (
              <Panel
                // eslint-disable-next-line react/no-array-index-key
                key={`${account.chainId}-${account.name}-${index}`}
                style={[
                  spacings.mbSm,
                  {
                    borderLeftWidth: 3,
                    borderLeftColor: getStatusColor(account.reviewStatus)
                  }
                ]}
              >
                <View
                  style={[
                    flexbox.directionRow,
                    flexbox.justifySpaceBetween,
                    flexbox.alignCenter,
                    spacings.mbSm
                  ]}
                >
                  <Text weight="medium" fontSize={14}>
                    Account #{account.name}
                  </Text>
                  <Text weight="medium" fontSize={14}>
                    {formatEther(account.balance)} ETH
                  </Text>
                </View>

                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <Text appearance="secondaryText" fontSize={12} weight="medium">
                    Status:
                  </Text>
                  <Text
                    style={{
                      backgroundColor: getStatusColor(account.reviewStatus),
                      color: 'white',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      marginLeft: 4
                    }}
                  >
                    {account.reviewStatus}
                  </Text>
                </View>
              </Panel>
            ))}
          </View>

          <Panel style={[spacings.mtLg, { backgroundColor: '#fff3cd' }]}>
            <Text fontSize={12} appearance="secondaryText">
              ⚠️{' '}
              {t(
                'Ragequitting will exit these accounts from the pool and make your funds withdrawable. This action creates {{count}} transaction(s).',
                { count: ragequitableAccounts.length }
              )}
            </Text>
          </Panel>
        </Panel>
      </View>
    </ScrollableWrapper>
  )
}

export default React.memo(RagequitForm)
