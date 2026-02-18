import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import Alert from '@common/components/Alert'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { EnrichedLog, EnrichedLogInput, EnrichedSimulationResult } from '@web/hooks/useColibriSimulation'

import getStyles from './styles'

interface Props {
  isLoading: boolean
  result: EnrichedSimulationResult | null
  error: string | null
  isColibriAvailable: boolean
}

const LogInputRow = ({ input }: { input: EnrichedLogInput }) => {
  const { styles } = useTheme(getStyles)

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter, styles.logInputRow]}>
      <Text fontSize={12} appearance="secondaryText" style={{ minWidth: 80 }}>
        {input.name}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={{ minWidth: 64, ...spacings.mhTy }}>
        {input.type}
      </Text>
      <Text fontSize={12} weight="medium" numberOfLines={1} style={flexbox.flex1}>
        {input.displayValue}
      </Text>
    </View>
  )
}

const LogCard = ({ log }: { log: EnrichedLog }) => {
  const { theme, styles } = useTheme(getStyles)
  const [showRaw, setShowRaw] = useState(false)

  const contractLabel = log.contractAddressBookName
    ? `${log.contractAddressBookName} (${log.contractAddress.slice(0, 6)}...${log.contractAddress.slice(-4)})`
    : `${log.contractAddress.slice(0, 6)}...${log.contractAddress.slice(-4)}`

  return (
    <View style={styles.logCard}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          {log.isTokenEvent && log.tokenSymbol && (
            <View style={styles.tokenBadge}>
              <Text fontSize={10} weight="semiBold">
                {log.tokenSymbol}
              </Text>
            </View>
          )}
          <Text fontSize={14} weight="semiBold">
            {log.name}
          </Text>
        </View>
        <Text fontSize={10} appearance="secondaryText">
          {contractLabel}
        </Text>
      </View>

      <View style={spacings.mtTy}>
        {log.inputs.map((input, idx) => (
          <LogInputRow key={`${input.name}-${idx}`} input={input} />
        ))}
      </View>

      <Pressable onPress={() => setShowRaw(!showRaw)} style={spacings.mtTy}>
        <Text fontSize={10} appearance="secondaryText" weight="medium">
          {showRaw ? 'Hide raw data' : 'Show raw data'}
        </Text>
      </Pressable>

      {showRaw && (
        <View style={styles.rawDataContainer}>
          <Text fontSize={10} appearance="secondaryText" style={{ fontFamily: 'monospace' }}>
            {JSON.stringify(log.raw, null, 2)}
          </Text>
        </View>
      )}
    </View>
  )
}

const ColibriSimulationResult = ({ isLoading, result, error, isColibriAvailable }: Props) => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)

  if (isLoading) {
    return (
      <View style={[flexbox.alignCenter, spacings.pvSm]}>
        <Spinner />
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
          {t('Simulating transaction...')}
        </Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={spacings.ptTy}>
        <Alert type={isColibriAvailable ? 'error' : 'info'} size="sm" title={error} />
      </View>
    )
  }

  if (!result) return null

  return (
    <View style={styles.container}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Text fontSize={14} weight="semiBold">
          {t('Simulation Result')}
        </Text>
        <View
          style={[
            styles.statusBadge,
            result.statusLabel === 'success' ? styles.statusSuccess : styles.statusReverted
          ]}
        >
          <Text
            fontSize={10}
            weight="semiBold"
            color={result.statusLabel === 'success' ? '#16a34a' : '#dc2626'}
          >
            {result.statusLabel === 'success' ? t('Success') : t('Reverted')}
          </Text>
        </View>
      </View>

      <View style={[flexbox.directionRow, spacings.mtMi]}>
        <Text fontSize={12} appearance="secondaryText">
          {t('Gas used:')}
        </Text>
        <Text fontSize={12} weight="medium" style={spacings.mlMi}>
          {result.gasUsedDecimal}
        </Text>
      </View>

      {result.returnValue && result.returnValue !== '0x' && (
        <View style={[flexbox.directionRow, spacings.mtMi]}>
          <Text fontSize={12} appearance="secondaryText">
            {t('Return value:')}
          </Text>
          <Text fontSize={12} weight="medium" style={spacings.mlMi}>
            {result.returnValue}
          </Text>
        </View>
      )}

      {result.logs.length > 0 && (
        <View style={spacings.mtSm}>
          <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbMi}>
            {t('Events ({{count}})', { count: result.logs.length })}
          </Text>
          {result.logs.map((log, idx) => (
            <LogCard key={`${log.name}-${log.contractAddress}-${idx}`} log={log} />
          ))}
        </View>
      )}

      {result.logs.length === 0 && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
          {t('No events emitted')}
        </Text>
      )}
    </View>
  )
}

export default React.memo(ColibriSimulationResult)
