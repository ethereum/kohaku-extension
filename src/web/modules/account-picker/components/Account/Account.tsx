import React, { useCallback, useContext, useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'

import { Account as AccountInterface, ImportStatus } from '@ambire-common/interfaces/account'
import { Network } from '@ambire-common/interfaces/network'
import { isAmbireV1LinkedAccount, isSmartAccount } from '@ambire-common/libs/account/account'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import Avatar from '@common/components/Avatar'
import Badge from '@common/components/Badge'
import BadgeWithPreset from '@common/components/BadgeWithPreset'
import Label from '@common/components/Label'
import NetworkIcon from '@common/components/NetworkIcon'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import Switch from '@common/components/Switch'
import Tooltip from '@common/components/Tooltip'
import { useTranslation } from '@common/config/localization'
import useReverseLookup from '@common/hooks/useReverseLookup'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { setStringAsync } from '@common/utils/clipboard'
import CopyIcon from '@web/assets/svg/CopyIcon'
import {
  AccountPickerIntroStepsContext,
  SmartAccountIntroId
} from '@web/modules/account-picker/contexts/accountPickerIntroStepsContext'

import getStyles from './styles'

const Account = ({
  account,
  type,
  unused,
  withBottomSpacing = true,
  shouldAddIntroStepsIds,
  isSelected,
  onSelect,
  onDeselect,
  isDisabled,
  importStatus,
  displayTypeBadge = true,
  displayTypePill = true,
  shouldBeDisplayedAsNew = false
}: {
  account: AccountInterface & { usedOnNetworks: Network[] }
  type: 'basic' | 'smart' | 'linked'
  unused: boolean
  isSelected: boolean
  withBottomSpacing: boolean
  shouldAddIntroStepsIds?: boolean
  onSelect: (account: AccountInterface) => void
  onDeselect: (account: AccountInterface) => void
  isDisabled?: boolean
  importStatus: ImportStatus
  displayTypeBadge?: boolean
  withQuaternaryBackground?: boolean
  displayTypePill?: boolean
  shouldBeDisplayedAsNew?: boolean
}) => {
  const { isLoading: isDomainResolving, ens } = useReverseLookup({ address: account.addr })
  const domainName = ens
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const { setShowIntroSteps } = useContext(AccountPickerIntroStepsContext)
  const { minWidthSize, maxWidthSize } = useWindowSize()
  const { addToast } = useToast()
  const isAccountImported = importStatus !== ImportStatus.NotImported

  const toggleSelectedState = useCallback(() => {
    if (isSelected) {
      !!onDeselect && onDeselect(account)
    } else {
      !!onSelect && onSelect(account)
    }
  }, [isSelected, onSelect, onDeselect, account])

  const formattedAddress = useMemo(() => {
    if (minWidthSize('m') || domainName) {
      return shortenAddress(account.addr, 16)
    }
    if (maxWidthSize('m') && minWidthSize('l')) {
      return shortenAddress(account.addr, 26)
    }
    if (maxWidthSize('l')) {
      return account.addr
    }
    return shortenAddress(account.addr, 16)
  }, [account.addr, domainName, maxWidthSize, minWidthSize])

  useEffect(() => {
    if (shouldAddIntroStepsIds) setShowIntroSteps(true)
  }, [shouldAddIntroStepsIds, setShowIntroSteps])

  const handleCopyAddress = useCallback(() => {
    setStringAsync(account.addr)
    addToast(t('Address copied to clipboard!') as string, { timeout: 2500 })
  }, [account.addr, addToast, t])

  if (isDomainResolving) {
    return <SkeletonLoader height={56} width="100%" />
  }

  if (!account.addr) return null

  return (
    <Pressable
      key={account.addr}
      style={({ hovered }: any) => [
        flexbox.alignCenter,
        withBottomSpacing ? spacings.mbTy : spacings.mb0,
        common.borderRadiusPrimary,
        common.hidden,
        {
          borderWidth: 1,
          borderColor: theme.accent
        },
        ((hovered && !isDisabled) || isSelected) && {
          borderColor: theme.accent
        }
      ]}
      onPress={isDisabled ? undefined : toggleSelectedState}
      testID={`add-account-${account.addr}`}
    >
      <View style={[styles.container, { backgroundColor: theme.surfaceInput }]}>
        <Switch
          isOn={isSelected}
          onToggle={toggleSelectedState}
          disabled={isDisabled}
          style={[spacings.mrSm]}
        />

        <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
          <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
            <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mrMd]}>
              {isAccountImported ? (
                <>
                  <Avatar
                    pfp={account.preferences.pfp}
                    size={24}
                    isSmart={isSmartAccount(account)}
                    displayTypeBadge={displayTypeBadge}
                  />
                  <Text
                    fontSize={16}
                    weight="medium"
                    appearance="primaryText"
                    style={spacings.mrTy}
                  >
                    {account.preferences.label}
                  </Text>
                  <Text
                    fontSize={14}
                    appearance="secondaryText"
                    style={spacings.mrMi}
                    // @ts-ignore
                    dataSet={{ tooltipId: account.addr }}
                  >
                    ({shortenAddress(account.addr, 16)})
                  </Text>
                  <Tooltip content={account.addr} id={account.addr} />
                </>
              ) : (
                <>
                  {domainName ? (
                    <Text
                      fontSize={16}
                      weight="medium"
                      appearance="primaryText"
                      style={spacings.mrTy}
                    >
                      {domainName}
                    </Text>
                  ) : null}
                  <Text
                    fontSize={domainName ? 14 : 16}
                    appearance={domainName ? 'secondaryText' : 'primaryText'}
                    style={spacings.mrMi}
                  >
                    {domainName ? '(' : ''}
                    {formattedAddress}
                    {domainName ? ')' : ''}
                  </Text>
                </>
              )}

              {(minWidthSize('l') || isAccountImported || domainName) && (
                <Pressable onPress={handleCopyAddress}>
                  <CopyIcon width={14} height={14} />
                </Pressable>
              )}
            </View>
            {displayTypePill && (
              <>
                {type === 'smart' && (
                  <BadgeWithPreset
                    withRightSpacing
                    preset="smart-account"
                    {...(shouldAddIntroStepsIds && { nativeID: SmartAccountIntroId })}
                  />
                )}

                {type === 'linked' && (
                  <>
                    <BadgeWithPreset preset="linked" withRightSpacing />
                    {isAmbireV1LinkedAccount(account.creation?.factoryAddr) && (
                      <BadgeWithPreset preset="ambire-v1" withRightSpacing />
                    )}
                  </>
                )}
              </>
            )}
          </View>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            {!!account.usedOnNetworks.length && (
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={12} weight="regular">
                  {t('used on ')}
                </Text>
                {account.usedOnNetworks.slice(0, 7).map((n, index: number, arr: string | any[]) => {
                  return (
                    <View
                      style={[
                        styles.networkIcon,
                        { marginLeft: index ? -5 : 0, zIndex: arr.length - index }
                      ]}
                      key={n.chainId.toString()}
                    >
                      <NetworkIcon
                        style={{ backgroundColor: '#fff' }}
                        id={n.chainId.toString()}
                        size={18}
                      />
                    </View>
                  )
                })}
              </View>
            )}
            {!!unused && (
              <Badge
                type={shouldBeDisplayedAsNew ? 'new' : 'new2'}
                text={shouldBeDisplayedAsNew ? t('new') : t('unused')}
                weight={shouldBeDisplayedAsNew ? undefined : 'number_bold'}
                style={{ borderRadius: 4 }}
              />
            )}
          </View>
        </View>
      </View>
      {[
        ImportStatus.ImportedWithSomeOfTheKeys,
        ImportStatus.ImportedWithDifferentKeys,
        ImportStatus.ImportedWithoutKey
      ].includes(importStatus) && (
        <View style={[spacings.mh, spacings.mvTy, flexbox.alignSelfStart]}>
          {importStatus === ImportStatus.ImportedWithSomeOfTheKeys && (
            <Label
              isTypeLabelHidden
              customTextStyle={styles.label}
              hasBottomSpacing={false}
              text={t(
                'Already imported with some of the keys found on this page but not all. Re-import now to use this account with multiple keys.'
              )}
              type="success"
            />
          )}
          {importStatus === ImportStatus.ImportedWithDifferentKeys && (
            <Label
              isTypeLabelHidden
              customTextStyle={styles.label}
              hasBottomSpacing={false}
              text={t(
                'Already imported, associated with a different key. Re-import now to use this account with multiple keys.'
              )}
              type="info"
            />
          )}
          {importStatus === ImportStatus.ImportedWithoutKey && (
            <Label
              isTypeLabelHidden
              customTextStyle={styles.label}
              hasBottomSpacing={false}
              text={t(
                'Already imported as a view only account. Import now to be able to manage this account.'
              )}
              type="info"
            />
          )}
        </View>
      )}
    </Pressable>
  )
}

export default React.memo(Account)
