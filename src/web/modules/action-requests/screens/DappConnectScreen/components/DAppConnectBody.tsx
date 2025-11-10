import React, { FC, useCallback, useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { View } from 'react-native'

import CheckIcon from '@common/assets/svg/CheckIcon'
import ErrorIcon from '@common/assets/svg/ErrorIcon'
import Alert from '@common/components/Alert'
import Badge from '@common/components/Badge'
import Checkbox from '@common/components/Checkbox'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING, SPACING_LG, SPACING_MI } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { openInTab } from '@web/extension-services/background/webapi/tab'

import getStyles from '../styles'
import DAppAccountSelector from './DAppAccountSelector'
import DAppPermissions from './DAppPermissions'

const DAppConnectBody: FC<{
  confirmedRiskCheckbox: boolean
  setConfirmedRiskCheckbox: React.Dispatch<React.SetStateAction<boolean>>
  selectedAccount: string | null
  setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
  saveDappAccountPreference: boolean
  setSaveDappAccountPreference: React.Dispatch<React.SetStateAction<boolean>>
  responsiveSizeMultiplier: number
  securityCheck: 'BLACKLISTED' | 'NOT_BLACKLISTED' | 'LOADING'
  origin?: string
}> = ({
  confirmedRiskCheckbox,
  setConfirmedRiskCheckbox,
  selectedAccount,
  setSelectedAccount,
  saveDappAccountPreference,
  setSaveDappAccountPreference,
  securityCheck,
  responsiveSizeMultiplier,
  origin
}) => {
    const { t } = useTranslation()
    const { styles, theme } = useTheme(getStyles)
    const [fullscreenDappAccounts, setFullscreenDappAccounts] = React.useState(false)

    const spacingsStyle = useMemo(() => {
      return {
        paddingHorizontal: SPACING_LG * responsiveSizeMultiplier,
        paddingTop: SPACING_LG * responsiveSizeMultiplier,
        paddingBottom: SPACING_LG * responsiveSizeMultiplier
      }
    }, [responsiveSizeMultiplier])

    const handleRiskCheckboxPress = useCallback(() => {
      setConfirmedRiskCheckbox((p) => !p)
    }, [setConfirmedRiskCheckbox])

    return (
      <View style={[styles.contentBody, spacingsStyle]}>
        {!fullscreenDappAccounts && (<>
          <View
            style={[
              styles.securityChecksContainer,
              {
                marginBottom: SPACING * responsiveSizeMultiplier
              },
              securityCheck === 'BLACKLISTED' && { borderColor: theme.errorDecorative }
            ]}
          >
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={14} weight="medium" style={spacings.mr} appearance="secondaryText">
                  {t('Security checks')}
                </Text>
              </View>
              {securityCheck === 'LOADING' && <Spinner style={{ width: 18, height: 18 }} />}
              {securityCheck === 'NOT_BLACKLISTED' && (
                <Badge type="success" text={t('Passed')} testId="dapp-security-check-passed">
                  <CheckIcon
                    width={12}
                    height={12}
                    style={{ marginRight: -SPACING_MI, marginLeft: SPACING_MI }}
                  />
                </Badge>
              )}
              {securityCheck === 'BLACKLISTED' && (
                <Badge type="error" text={t('Danger')}>
                  <ErrorIcon
                    width={12}
                    height={12}
                    color={theme.errorDecorative}
                    style={{ marginRight: -SPACING_MI, marginLeft: SPACING_MI }}
                  />
                </Badge>
              )}
            </View>
            {securityCheck === 'BLACKLISTED' && (
              <View style={spacings.ptTy}>
                <Text
                  fontSize={20 * responsiveSizeMultiplier}
                  weight="semiBold"
                  color={theme.errorDecorative}
                  style={[{ lineHeight: 18 * responsiveSizeMultiplier }, spacings.mbTy]}
                >
                  {t('Potential danger!')}
                </Text>
                <Trans>
                  <Text
                    fontSize={14 * responsiveSizeMultiplier}
                    color={theme.errorDecorative}
                    style={{ lineHeight: 18 * responsiveSizeMultiplier }}
                  >
                    {
                      "This website didn't pass our safety checks and is blacklisted. It might trick you into signing malicious transactions, asking you to reveal sensitive information, or be dangerous otherwise. If you believe we have blocked it in error, please "
                    }
                    <Text
                      fontSize={14 * responsiveSizeMultiplier}
                      color={theme.errorDecorative}
                      style={{ lineHeight: 18 * responsiveSizeMultiplier }}
                      underline
                      onPress={() =>
                        openInTab({ url: 'https://help.ambire.com/hc/en-us/requests/new' })
                      }
                    >
                      let us know.
                    </Text>
                  </Text>
                </Trans>
              </View>
            )}
          </View>
          <DAppPermissions responsiveSizeMultiplier={responsiveSizeMultiplier} />
        </>)}
        <DAppAccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={setSelectedAccount}
          saveDappAccountPreference={saveDappAccountPreference}
          setSaveDappAccountPreference={setSaveDappAccountPreference}
          responsiveSizeMultiplier={responsiveSizeMultiplier}
          onFullscreen={setFullscreenDappAccounts}
          origin={origin}
        />
        {securityCheck === 'BLACKLISTED' ? (
          <Alert type="warning" size="sm" withIcon={false}>
            <Checkbox
              value={confirmedRiskCheckbox}
              style={{ ...spacings.mb0 }}
              onValueChange={handleRiskCheckboxPress}
              uncheckedBorderColor={theme.warningDecorative}
              checkedColor={theme.warningDecorative}
            >
              <Text
                fontSize={16 * responsiveSizeMultiplier}
                appearance="errorText"
                weight="semiBold"
                style={{ lineHeight: 20 }}
                onPress={handleRiskCheckboxPress}
              >
                {t('I have read and understood the risks')}
              </Text>
            </Checkbox>
          </Alert>
        ) : (
          <Text
            style={{
              opacity: 0.64,
              marginHorizontal: 'auto'
            }}
            fontSize={14 * responsiveSizeMultiplier}
            weight="medium"
            appearance="tertiaryText"
          >
            {t('Only connect with sites you trust')}
          </Text>
        )}
      </View>
    )
  }

export default React.memo(DAppConnectBody)
