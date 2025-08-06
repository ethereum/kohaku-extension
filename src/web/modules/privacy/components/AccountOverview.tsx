import React, { useState } from 'react'
import { View, Pressable } from 'react-native'
import Text from '@common/components/Text'
import Button from '@common/components/Button'
import Heading from '@common/components/Heading'
import Panel from '@common/components/Panel'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

const AccountOverview = () => {
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null)
  const [ragequitLoading] = useState<Record<string, boolean>>({})

  const poolAccounts: any[] = []
  const account = null

  if (!account && !poolAccounts?.length) {
    return (
      <View style={[spacings.mb24]}>
        <Panel>
          <Heading style={[spacings.mb16]}>Account Overview</Heading>
          <Text appearance="secondaryText" style={{ textAlign: 'center', fontStyle: 'italic' }}>
            Load an account to view your pool history
          </Text>
        </Panel>
      </View>
    )
  }

  const handleAccountSelect = (poolAccount: any) => {
    setSelectedAccount(selectedAccount?.name === poolAccount.name ? null : poolAccount)
  }

  const formatTimestamp = (timestamp?: bigint) => {
    if (!timestamp) return 'Pending...'
    return new Date(Number(timestamp) * 1000).toLocaleDateString()
  }

  const getStatusColor = (status: any) => {
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

  const handleRagequit = async (poolAccount: any, event: any) => {
    // eslint-disable-next-line no-console
    console.log('handleRagequit', poolAccount, event)
  }

  const isRagequitLoading = (poolAccount: any) => {
    const accountKey = `${poolAccount.chainId}-${poolAccount.name}`
    return ragequitLoading[accountKey] || false
  }

  const canRagequitLocal = (poolAccount: any) => {
    // eslint-disable-next-line no-console
    console.log('canRagequitLocal', poolAccount)
    return false
  }

  return (
    <View style={[spacings.mb24]}>
      <Heading style={[spacings.mb16]}>Account Overview</Heading>

      {poolAccounts && poolAccounts.length > 0 && (
        <View style={[flexbox.flex1]}>
          <Text weight="medium" style={[spacings.mb8]}>
            Pool Accounts ({poolAccounts.length})
          </Text>
          {poolAccounts.map((poolAccount) => (
            <Pressable
              key={`${poolAccount.chainId}-${poolAccount.name}`}
              onPress={() => handleAccountSelect(poolAccount)}
              disabled={isRagequitLoading(poolAccount)}
            >
              <Panel
                style={[
                  spacings.mb12,
                  {
                    borderLeftWidth: selectedAccount?.name === poolAccount.name ? 4 : 0,
                    borderLeftColor:
                      selectedAccount?.name === poolAccount.name ? '#007bff' : 'transparent',
                    opacity: isRagequitLoading(poolAccount) ? 0.8 : 1
                  }
                ]}
              >
                <View
                  style={[
                    flexbox.directionRow,
                    flexbox.justifySpaceBetween,
                    flexbox.alignCenter,
                    spacings.mb8
                  ]}
                >
                  <Text weight="semiBold">Account #{poolAccount.name}</Text>
                  <Text weight="medium" appearance="successText" fontSize={14}>
                    {/* {formatEther(poolAccount.balance)} ETH */}
                  </Text>
                </View>

                <View style={[flexbox.directionRow, spacings.mt8]}>
                  <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mr16]}>
                    <Text appearance="secondaryText" weight="medium" fontSize={12}>
                      Status:
                    </Text>
                    <Text
                      style={{
                        backgroundColor: getStatusColor(poolAccount.reviewStatus),
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
                      {poolAccount.reviewStatus}
                    </Text>
                  </View>
                  <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                    <Text appearance="secondaryText" weight="medium" fontSize={12}>
                      Chain:
                    </Text>
                    <Text fontSize={12} style={[spacings.ml4]}>
                      {poolAccount.chainId}
                    </Text>
                  </View>
                </View>

                {selectedAccount?.name === poolAccount.name && (
                  <View
                    style={[
                      spacings.mt16,
                      { borderTopWidth: 1, borderTopColor: '#dee2e6', paddingTop: 16 }
                    ]}
                  >
                    <View style={[spacings.mb16]}>
                      <Text weight="semiBold" fontSize={14} style={[spacings.mb8]}>
                        Deposit
                      </Text>
                      <Panel style={[spacings.mb8]}>
                        <View
                          style={[
                            flexbox.directionRow,
                            flexbox.justifySpaceBetween,
                            flexbox.alignCenter,
                            spacings.mb4
                          ]}
                        >
                          <Text appearance="secondaryText" fontSize={12} weight="medium">
                            Amount:
                          </Text>
                          <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                            {/* {formatEther(poolAccount.deposit.value)} ETH */}
                          </Text>
                        </View>
                        <View
                          style={[
                            flexbox.directionRow,
                            flexbox.justifySpaceBetween,
                            flexbox.alignCenter,
                            spacings.mb4
                          ]}
                        >
                          <Text appearance="secondaryText" fontSize={12} weight="medium">
                            Date:
                          </Text>
                          <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                            {formatTimestamp(poolAccount.deposit.timestamp)}
                          </Text>
                        </View>
                        <View
                          style={[
                            flexbox.directionRow,
                            flexbox.justifySpaceBetween,
                            flexbox.alignCenter,
                            spacings.mb4
                          ]}
                        >
                          <Text appearance="secondaryText" fontSize={12} weight="medium">
                            Block:
                          </Text>
                          <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                            {poolAccount.deposit.blockNumber.toString()}
                          </Text>
                        </View>
                        <View
                          style={[
                            flexbox.directionRow,
                            flexbox.justifySpaceBetween,
                            flexbox.alignCenter
                          ]}
                        >
                          <Text appearance="secondaryText" fontSize={12} weight="medium">
                            Tx Hash:
                          </Text>
                          <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                            {poolAccount.deposit.txHash}
                          </Text>
                        </View>
                      </Panel>
                    </View>

                    {poolAccount.children.length > 0 && (
                      <View style={[spacings.mb16]}>
                        <Text weight="semiBold" fontSize={14} style={[spacings.mb8]}>
                          Withdrawals ({poolAccount.children.length})
                        </Text>
                        {poolAccount.children.map((withdrawal: any) => (
                          <Panel
                            key={`${withdrawal.chainId}-${withdrawal.name}`}
                            style={[spacings.mb8]}
                          >
                            <View
                              style={[
                                flexbox.directionRow,
                                flexbox.justifySpaceBetween,
                                flexbox.alignCenter,
                                spacings.mb4
                              ]}
                            >
                              <Text appearance="secondaryText" fontSize={12} weight="medium">
                                Amount:
                              </Text>
                              <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                                {/* {formatEther(withdrawal.value)} ETH */}
                              </Text>
                            </View>
                            <View
                              style={[
                                flexbox.directionRow,
                                flexbox.justifySpaceBetween,
                                flexbox.alignCenter,
                                spacings.mb4
                              ]}
                            >
                              <Text appearance="secondaryText" fontSize={12} weight="medium">
                                Date:
                              </Text>
                              <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                                {formatTimestamp(withdrawal.timestamp)}
                              </Text>
                            </View>
                            <View
                              style={[
                                flexbox.directionRow,
                                flexbox.justifySpaceBetween,
                                flexbox.alignCenter,
                                spacings.mb4
                              ]}
                            >
                              <Text appearance="secondaryText" fontSize={12} weight="medium">
                                Block:
                              </Text>
                              <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                                {withdrawal.blockNumber.toString()}
                              </Text>
                            </View>
                            <View
                              style={[
                                flexbox.directionRow,
                                flexbox.justifySpaceBetween,
                                flexbox.alignCenter
                              ]}
                            >
                              <Text appearance="secondaryText" fontSize={12} weight="medium">
                                Tx Hash:
                              </Text>
                              <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                                {withdrawal.txHash}
                              </Text>
                            </View>
                          </Panel>
                        ))}
                      </View>
                    )}

                    {poolAccount.ragequit && (
                      <View style={[spacings.mb16]}>
                        <Text weight="semiBold" fontSize={14} style={[spacings.mb8]}>
                          Ragequit
                        </Text>
                        <Panel style={[spacings.mb8]}>
                          <View
                            style={[
                              flexbox.directionRow,
                              flexbox.justifySpaceBetween,
                              flexbox.alignCenter,
                              spacings.mb4
                            ]}
                          >
                            <Text appearance="secondaryText" fontSize={12} weight="medium">
                              Amount:
                            </Text>
                            <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                              {/* {formatEther(poolAccount.ragequit.value)} ETH */}
                            </Text>
                          </View>
                          <View
                            style={[
                              flexbox.directionRow,
                              flexbox.justifySpaceBetween,
                              flexbox.alignCenter,
                              spacings.mb4
                            ]}
                          >
                            <Text appearance="secondaryText" fontSize={12} weight="medium">
                              Date:
                            </Text>
                            <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                              {formatTimestamp(poolAccount.ragequit.timestamp)}
                            </Text>
                          </View>
                          <View
                            style={[
                              flexbox.directionRow,
                              flexbox.justifySpaceBetween,
                              flexbox.alignCenter,
                              spacings.mb4
                            ]}
                          >
                            <Text appearance="secondaryText" fontSize={12} weight="medium">
                              Block:
                            </Text>
                            <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                              {poolAccount.ragequit.blockNumber.toString()}
                            </Text>
                          </View>
                          <View
                            style={[
                              flexbox.directionRow,
                              flexbox.justifySpaceBetween,
                              flexbox.alignCenter,
                              spacings.mb4
                            ]}
                          >
                            <Text appearance="secondaryText" fontSize={12} weight="medium">
                              Tx Hash:
                            </Text>
                            <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                              {poolAccount.ragequit.transactionHash}
                            </Text>
                          </View>
                          <View
                            style={[
                              flexbox.directionRow,
                              flexbox.justifySpaceBetween,
                              flexbox.alignCenter
                            ]}
                          >
                            <Text appearance="secondaryText" fontSize={12} weight="medium">
                              Ragequitter:
                            </Text>
                            <Text fontSize={12} style={{ fontFamily: 'monospace' }}>
                              {poolAccount.ragequit.ragequitter}
                            </Text>
                          </View>
                        </Panel>
                      </View>
                    )}

                    <View style={[spacings.mb16]}>
                      <View style={[flexbox.alignCenter, spacings.mt16]}>
                        <Button
                          type="secondary"
                          disabled={
                            !canRagequitLocal(poolAccount) || isRagequitLoading(poolAccount)
                          }
                          onPress={(event) => handleRagequit(poolAccount, event)}
                          text={
                            poolAccount.ragequit
                              ? 'Already Exited'
                              : isRagequitLoading(poolAccount)
                              ? 'Exiting...'
                              : 'Exit Pool (Ragequit)'
                          }
                          style={{ minWidth: 180 }}
                        />
                        {canRagequitLocal(poolAccount) && (
                          <Text
                            appearance="secondaryText"
                            fontSize={10}
                            style={[
                              spacings.mt8,
                              { textAlign: 'center', fontStyle: 'italic', maxWidth: 200 }
                            ]}
                          >
                            This will exit the pool and make your funds withdrawable
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </Panel>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

export default React.memo(AccountOverview)
