import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import SuccessIcon from '@common/assets/svg/SuccessIcon'
import Alert from '@common/components/Alert'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { openInTab } from '@web/extension-services/background/webapi/tab'
import { EnrichedLog, EnrichedLogInput, EnrichedSimulationResult, SummarySegment } from '@web/hooks/useColibriSimulation'

import getStyles from './styles'

const COLIBRI_DOCS_URL =
  'https://corpus-core.gitbook.io/specification-colibri-stateless/specifications/ethereum/colibri-rpc-methods/colibri_simulatetransaction'

interface Props {
  isLoading: boolean
  result: EnrichedSimulationResult | null
  error: string | null
  isColibriAvailable: boolean
}

const AddressLink = ({
  address,
  displayValue,
  explorerUrl,
  fontSize: fs = 12
}: {
  address: string
  displayValue: string
  explorerUrl: string
  fontSize?: number
}) => {
  const { theme } = useTheme()

  return (
    <Pressable
      onPress={() => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        openInTab({ url: `${explorerUrl}/address/${address}` })
      }}
    >
      <Text
        fontSize={fs}
        weight="medium"
        numberOfLines={1}
        color={theme.primary}
        style={{ textDecorationLine: 'underline' }}
      >
        {displayValue}
      </Text>
    </Pressable>
  )
}

const LogInputRow = ({
  input,
  explorerUrl
}: {
  input: EnrichedLogInput
  explorerUrl: string
}) => {
  const { styles } = useTheme(getStyles)

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter, styles.logInputRow]}>
      <Text fontSize={12} weight="semiBold" style={{ minWidth: 72 }}>
        {input.name}
      </Text>
      <Text fontSize={11} style={[styles.typeLabel, { minWidth: 56, ...spacings.mhTy }]}>
        {input.type}
      </Text>
      <View style={flexbox.flex1}>
        {input.isAddress ? (
          <AddressLink
            address={input.rawValue}
            displayValue={input.displayValue}
            explorerUrl={explorerUrl}
          />
        ) : (
          <Text fontSize={12} weight="medium" numberOfLines={1}>
            {input.displayValue}
          </Text>
        )}
      </View>
    </View>
  )
}

const LogCard = ({ log, explorerUrl }: { log: EnrichedLog; explorerUrl: string }) => {
  const { styles } = useTheme(getStyles)
  const [showRaw, setShowRaw] = useState(false)

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
        <AddressLink
          address={log.contractAddress}
          displayValue={
            log.contractAddressBookName
              ? `${log.contractAddressBookName} (${log.contractAddress.slice(0, 6)}...${log.contractAddress.slice(-4)})`
              : `${log.contractAddress.slice(0, 6)}...${log.contractAddress.slice(-4)}`
          }
          explorerUrl={explorerUrl}
          fontSize={10}
        />
      </View>

      <View style={spacings.mtMi}>
        {log.inputs.map((input, idx) => (
          <LogInputRow
            key={`${input.name}-${idx}`}
            input={input}
            explorerUrl={explorerUrl}
          />
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

const SummarySegmentView = ({
  segment,
  explorerUrl
}: {
  segment: SummarySegment
  explorerUrl: string
}) => {
  switch (segment.kind) {
    case 'event':
      return (
        <Text fontSize={12} weight="semiBold">
          {segment.text}
        </Text>
      )
    case 'amount':
      return (
        <Text fontSize={12} weight="semiBold" color="#16a34a" style={spacings.mlMi}>
          {segment.text}
        </Text>
      )
    case 'label':
      return (
        <Text fontSize={12} weight="semiBold" style={spacings.mlMi}>
          {segment.text}
        </Text>
      )
    case 'address':
      return (
        <View style={spacings.mlMi}>
          <AddressLink
            address={segment.rawAddress}
            displayValue={segment.text}
            explorerUrl={explorerUrl}
          />
        </View>
      )
    default:
      return null
  }
}

const EventSummaryLine = ({ log, explorerUrl }: { log: EnrichedLog; explorerUrl: string }) => {
  const { styles } = useTheme(getStyles)

  if (!log.summarySegments?.length) return null

  return (
    <View style={[flexbox.directionRow, flexbox.alignCenter, styles.summaryLine]}>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mrMi}>
        {'\u2022'}
      </Text>
      {log.summarySegments.map((seg, idx) => (
        <SummarySegmentView key={idx} segment={seg} explorerUrl={explorerUrl} />
      ))}
    </View>
  )
}

const ColibriSimulationResult = ({ isLoading, result, error, isColibriAvailable }: Props) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const { navigate } = useNavigation()
  const [showDetails, setShowDetails] = useState(false)

  const summaryLogs = useMemo(
    () => (result?.logs ?? []).filter((l) => l.isTokenEvent && l.summarySegments?.length),
    [result?.logs]
  )

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
        {!isColibriAvailable && (
          <Pressable
            onPress={() => navigate(WEB_ROUTES.networksSettings)}
            style={spacings.mtMi}
          >
            <Text
              fontSize={12}
              weight="semiBold"
              color={theme.primary}
              style={{ textDecorationLine: 'underline' }}
            >
              {t('Open Network Settings')}
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  if (!result) return null

  return (
    <View style={styles.container}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Text fontSize={18} weight="medium">
          {t('Simulation Result')}
        </Text>
        <View
          style={[
            styles.statusBadge,
            result.statusLabel === 'success' ? styles.statusSuccess : styles.statusReverted
          ]}
        >
          {result.statusLabel === 'success' && (
            <SuccessIcon width={14} height={14} color="#16a34a" withCirc={false} />
          )}
          <Text
            fontSize={10}
            weight="semiBold"
            color={result.statusLabel === 'success' ? '#16a34a' : '#dc2626'}
            style={result.statusLabel === 'success' ? spacings.mlMi : undefined}
          >
            {result.statusLabel === 'success' ? t('Success') : t('Reverted')}
          </Text>
        </View>
      </View>

      {result.batchCallCount > 1 && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtMi]}>
          <Text fontSize={12} appearance="secondaryText">
            {t('Batch transaction ({{count}} calls)', { count: result.batchCallCount })}
          </Text>
        </View>
      )}

      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween, spacings.mtMi]}>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text fontSize={12} appearance="secondaryText">
            {t('Gas used:')}
          </Text>
          <Text fontSize={12} weight="medium" style={spacings.mlMi}>
            {result.gasUsedDecimal}
          </Text>
        </View>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text fontSize={10} appearance="secondaryText">
            {t('simulated and verified by ')}
          </Text>
          <Pressable
            onPress={() => {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              openInTab({ url: COLIBRI_DOCS_URL })
            }}
          >
            <Text
              fontSize={10}
              weight="semiBold"
              color={theme.primary}
              style={{ textDecorationLine: 'underline' }}
            >
              colibri
            </Text>
          </Pressable>
        </View>
      </View>

      {result.statusLabel === 'reverted' && (
        <View style={spacings.mtTy}>
          <Alert
            type="error"
            size="sm"
            title={
              result.decodedError
                ? `${t('Revert reason:')} ${result.decodedError}`
                : t('Transaction would revert')
            }
          />
        </View>
      )}

      {summaryLogs.length > 0 && !showDetails && (
        <View style={spacings.mtTy}>
          {summaryLogs.map((log, idx) => (
            <EventSummaryLine key={`summary-${idx}`} log={log} explorerUrl={result.explorerUrl} />
          ))}
        </View>
      )}

      {result.logs.length > 0 && (
        <Pressable
          onPress={() => setShowDetails(!showDetails)}
          style={spacings.mtTy}
        >
          <Text fontSize={12} weight="medium" appearance="secondaryText">
            {showDetails
              ? t('Hide details')
              : t('Details ({{count}} events)', { count: result.logs.length })}
          </Text>
        </Pressable>
      )}

      {showDetails && result.logs.length > 0 && (
        <View style={spacings.mtTy}>
          {result.logs.map((log, idx) => (
            <LogCard
              key={`${log.name}-${log.contractAddress}-${idx}`}
              log={log}
              explorerUrl={result.explorerUrl}
            />
          ))}
        </View>
      )}

      {result.logs.length === 0 && result.statusLabel === 'success' && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
          {t('No events emitted')}
        </Text>
      )}
    </View>
  )
}

export default React.memo(ColibriSimulationResult)
