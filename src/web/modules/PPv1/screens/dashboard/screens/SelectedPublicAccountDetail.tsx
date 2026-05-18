import CopyText from '@common/components/CopyText'
import Text from '@common/components/Text/Text'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { Pressable, View } from 'react-native'
import AddIcon from '@common/assets/svg/AddIcon'
import ReceiveIcon from '@common/assets/svg/ReceiveIcon'
import KohakuLogo from '@common/components/HokahuLogo'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import { useMemo } from 'react'
// import useBalanceAffectingErrors from '@common/modules/dashboard/hooks/useBalanceAffectingErrors'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useTheme from '@common/hooks/useTheme'
import Avatar from '@common/components/Avatar'
import { isSmartAccount } from '@ambire-common/libs/account/account'

const buttons = [
  { label: 'Send', Icon: AddIcon, onPress: () => {} },
  { label: 'Receive', Icon: ReceiveIcon, onPress: () => {} }
]

interface Props {
  openReceiveModal: (dest?: 'top' | 'default' | undefined) => void
}

const NewSelectedPublicAccountDetail = ({ openReceiveModal }: Props) => {
  const { theme } = useTheme()
  const { navigate } = useNavigation()
  const { account, dashboardNetworkFilter, portfolio } = useSelectedAccountControllerState()

  const totalPortfolioAmount = useMemo(() => {
    if (!dashboardNetworkFilter) return portfolio?.totalBalance || 0

    if (!account) return 0

    return Number(portfolio.balancePerNetwork[dashboardNetworkFilter.toString()]) || 0
  }, [portfolio, dashboardNetworkFilter, account])

  const [totalPortfolioAmountInteger, totalPortfolioAmountDecimal] = formatDecimals(
    totalPortfolioAmount,
    'value'
  ).split('.')

  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.center,
        spacings.phSm,
        {
          borderColor: '#D9D6CB',
          borderWidth: 1,
          borderRadius: 16,
          paddingVertical: 6,
          marginVertical: 28
        }
      ]}
    >
      {/* <Text
        color="#000000"
        fontSize={12.8}
        style={[
          spacings.mrSm,
          flexbox.directionRow,
          flexbox.center,
          {
            display: 'flex',
            width: 32,
            height: 32,
            borderWidth: 1.6,
            borderColor: theme.accent,
            borderRadius: 999,
            backgroundColor: theme.warning,
            textAlign: 'center'
          }
        ]}
      >
        {account?.addr?.slice(0, 3)}
      </Text> */}
      {account && (
        <Avatar pfp={account.preferences.pfp} size={30} isSmart={isSmartAccount(account)} />
      )}
      <View style={{ marginRight: 'auto' }}>
        {/* <Text color="#000000">{account?.preferences.label || ''}</Text> */}
        <Text color="#F9F6E9">{account?.preferences.label || ''}</Text>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Text fontSize={11} appearance="muted">
            ({shortenAddress(account?.addr || '', 13)})
          </Text>
          {true && (
            <CopyText
              text={account?.addr || ''}
              iconColor={theme.muted}
              style={{
                ...spacings.mlMi
              }}
            />
          )}
        </View>
      </View>
      <View style={[flexbox.directionRow, { alignItems: 'baseline', marginHorizontal: 'auto' }]}>
        <Text
          fontSize={24}
          weight="number_bold"
          shouldScale={false}
          // appearance="primaryText"
          color="#F9F6E9"
        >
          {totalPortfolioAmountInteger}
        </Text>
        {totalPortfolioAmountDecimal && (
          <Text
            fontSize={16}
            weight="number_bold"
            shouldScale={false}
            appearance="muted"
            color="#7F7F7F"
          >
            .{totalPortfolioAmountDecimal}
          </Text>
        )}
      </View>
      <View style={[flexbox.directionRow, flexbox.center]}>
        <Pressable
          onPress={() => navigate(WEB_ROUTES.pp1Deposit)}
          style={[
            flexbox.directionRow,
            spacings.mrSm,
            spacings.pvMi,
            spacings.phTy,
            {
              backgroundColor: '#032839',
              borderWidth: 1,
              borderColor: '#05425C',
              borderRadius: 20
            }
          ]}
        >
          <KohakuLogo width={19.58} height={20} />
          <Text color="#FFFFFF" style={[spacings.mlMi]}>
            Shield
          </Text>
        </Pressable>
        {buttons.map((btn, index) => (
          <Pressable
            key={btn.label}
            onPress={() => {
              if (btn.label === 'Send') return navigate(WEB_ROUTES.transfer)

              openReceiveModal()
            }}
            style={[flexbox.directionRow, flexbox.center, index > 0 && spacings.mlSm]}
          >
            <View
              style={[
                flexbox.center,
                {
                  backgroundColor: '#F9F6E9',
                  display: 'flex',
                  width: 32,
                  height: 32,
                  borderWidth: 1,
                  borderColor: '#021B26',
                  borderRadius: 999
                }
              ]}
            >
              {/* <btn.Icon width={16} height={16} color={String(theme.kohakuAccent)} /> */}
              <btn.Icon width={16} height={16} color="#000000" />
            </View>
            <Text
              fontSize={16}
              weight="regular"
              appearance="secondaryText"
              // color="#000000"
              color="#F9F6E9"
              style={[spacings.mlMi, { textAlign: 'center' }]}
            >
              {btn.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

export default NewSelectedPublicAccountDetail
