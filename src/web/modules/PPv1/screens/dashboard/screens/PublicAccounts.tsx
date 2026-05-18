import Text from '@common/components/Text/Text'
import Tooltip from '@common/components/Tooltip'
import spacings, { SPACING_MD } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { FlatList, Pressable, TextInput, View } from 'react-native'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { Account } from '@ambire-common/interfaces/account'
import { useState } from 'react'
import CopyText from '@common/components/CopyText'
import { useModalize } from 'react-native-modalize'
import BottomSheet from '@common/components/BottomSheet'
import Avatar from '@common/components/Avatar'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import useTheme from '@common/hooks/useTheme'
import PinIcon from '@common/assets/svg/PinIcon'
import useToast from '@common/hooks/useToast'
import { ExtendedAccountPreferences } from '@web/interfaces/account-preferences'

const MAX_LIST_ACCOUNTS = 8

interface PublicAccountsProps {
  isLoadingPublicBalances: boolean
  selectedAccount?: string
  balanceCache: {
    [addr: string]: number
  }
}

interface PublicAccountsModalProps extends PublicAccountsProps {
  accounts: Account[]
  selectAccount: (addr: string) => void
  togglePin: (addr: string, currentlyPinned: boolean) => void
}

const sortWithPinned = (accounts: Account[]) =>
  [...accounts].sort((a, b) => {
    const aPinned = (a.preferences as ExtendedAccountPreferences).pinnedAt ?? 0
    const bPinned = (b.preferences as ExtendedAccountPreferences).pinnedAt ?? 0
    return bPinned - aPinned
  })

function PublicAccountsListModal({
  isLoadingPublicBalances,
  selectedAccount,
  balanceCache,
  accounts,
  selectAccount,
  togglePin
}: PublicAccountsModalProps) {
  const [search, setSearch] = useState('')
  const { theme } = useTheme()

  const filteredAccounts = search
    ? accounts.filter((account) => {
        return (
          account.addr.toLowerCase().includes(search.toLowerCase()) ||
          account.preferences.label.toLowerCase().includes(search.toLowerCase())
        )
      })
    : accounts

  const renderItem = ({ item }: { item: Account }) => {
    const balance = balanceCache[item.addr]

    const isPinned = !!(item.preferences as ExtendedAccountPreferences).pinnedAt

    return (
      <Pressable
        onPress={() => selectAccount(item.addr)}
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          spacings.pvSm,
          { minHeight: 64, gap: 12 }
        ]}
      >
        <Pressable
          onPress={(e) => {
            e.stopPropagation()
            togglePin(item.addr, isPinned)
          }}
        >
          <PinIcon
            color={isPinned ? '#097db2' : undefined}
            pathFill={isPinned ? '#097db2' : undefined}
          />
        </Pressable>
        <Avatar pfp={item.preferences.pfp} size={30} isSmart={isSmartAccount(item)} />

        <View style={[flexbox.flex1]}>
          <View style={[flexbox.directionRow, flexbox.alignCenter, { gap: 8 }]}>
            <Text fontSize={15} weight="number_medium">
              {item.preferences.label}
            </Text>
          </View>
          <View
            style={[
              flexbox.alignCenter,
              flexbox.justifyStart,
              flexbox.directionRow,
              { display: 'flex' }
            ]}
          >
            <Text fontSize={16} color="#7F7F7F">
              {`${item.addr.slice(0, 6)}...${item.addr.slice(-4)}`}
            </Text>
            <CopyText
              text={item.addr}
              iconColor="#7F7F7F"
              style={{
                ...spacings.mlMi
              }}
            />
          </View>
        </View>

        {selectedAccount === item.addr && (
          <Text
            fontSize={11}
            color="#22c55e"
            style={{
              backgroundColor: '#009D121A',
              borderWidth: 1,
              borderColor: '#00AD14',
              borderRadius: 999,
              paddingHorizontal: 6,
              paddingVertical: 2
            }}
          >
            Selected
          </Text>
        )}

        <Text
          fontSize={15}
          weight="semiBold"
          color={isLoadingPublicBalances ? '#7F7F7F' : theme.textPrimary}
          style={[spacings.mrTy]}
        >
          {isLoadingPublicBalances
            ? 'Loading...'
            : balance != null
            ? `$${balance.toFixed(2)}`
            : '-'}
        </Text>
      </Pressable>
    )
  }

  return (
    <View
      style={{
        padding: SPACING_MD,
        backgroundColor: theme.primaryBackground,
        borderWidth: 1,
        borderColor: '#7F7F7F',
        borderRadius: 12,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
        maxHeight: 480
      }}
    >
      <Text weight="number_bold" style={spacings.mbMd}>
        Public Accounts
      </Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search accounts"
        style={[
          spacings.mbSm,
          spacings.ph,
          spacings.pvTy,
          {
            borderWidth: 1,
            borderColor: '#7F7F7F',
            borderRadius: 999,
            color: '#7F7F7F'
          }
        ]}
      />

      <FlatList
        data={filteredAccounts}
        renderItem={renderItem}
        keyExtractor={(item) => item.addr}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center' }} color="#7F7F7F">
            No accounts found
          </Text>
        }
      />
    </View>
  )
}
const NewPublicAccounts = ({ selectedAccount, ...modalProps }: PublicAccountsProps) => {
  const { addToast } = useToast()
  const modal = useModalize()
  const { dispatch } = useBackgroundService()
  const { accounts } = useAccountsControllerState()

  const sortedAccounts = sortWithPinned(accounts)
  const listedAccounts = sortedAccounts.slice(0, MAX_LIST_ACCOUNTS)
  const showMore = accounts.length > MAX_LIST_ACCOUNTS

  const selectAccount = (addr: string) => {
    if (selectedAccount === addr) return

    dispatch({
      type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
      params: { accountAddr: addr }
    })

    modal.close()
  }

  const togglePin = (addr: string, currentlyPinned: boolean) => {
    if (!currentlyPinned) {
      const totalPinned = accounts.filter(
        (a) => !!(a.preferences as ExtendedAccountPreferences).pinnedAt
      ).length

      if (totalPinned >= MAX_LIST_ACCOUNTS) {
        addToast(`You can pin a maximum of ${MAX_LIST_ACCOUNTS} accounts`, { type: 'error' })
        return
      }
    }

    dispatch({
      type: 'ACCOUNTS_CONTROLLER_TOGGLE_PIN_ACCOUNT',
      params: { addr, pinned: !currentlyPinned }
    })
  }

  return (
    <View>
      <Text appearance="muted">Public Accounts</Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtTy]}>
        {/* {listedAccounts.map((account, index) => (
          <Pressable
            key={account.addr}
            onPress={() => selectAccount(account.addr)}
            style={[index > 0 && spacings.mlTy]}
          >
            <Avatar pfp={account.preferences.pfp} size={30} isSmart={isSmartAccount(account)} />
          </Pressable>
        ))} */}
        {listedAccounts.map((account, index) => (
          <Pressable
            key={account.addr}
            onPress={() => selectAccount(account.addr)}
            style={[index > 0 && spacings.mlTy]}
          >
            {/* @ts-ignore */}
            <View dataSet={{ tooltipId: `account-avatar-${account.addr}` }}>
              <Avatar pfp={account.preferences.pfp} size={30} isSmart={isSmartAccount(account)} />
            </View>
            <Tooltip id={`account-avatar-${account.addr}`}>
              <Text fontSize={14} weight="medium" appearance="secondaryText">
                {/* {account.preferences.label || shortenAddress(account.addr)} */}
                {account.preferences.label || account.addr}
              </Text>
            </Tooltip>
          </Pressable>
        ))}
        {showMore && (
          <Pressable onPress={() => modal.open()}>
            <Text color="#097DB2">See all</Text>
          </Pressable>
        )}
      </View>
      <BottomSheet
        id="account-modal"
        type="modal"
        sheetRef={modal.ref}
        backgroundColor="transparent"
        containerInnerWrapperStyles={flexbox.alignCenter}
        closeBottomSheet={modal.close}
      >
        <PublicAccountsListModal
          accounts={sortedAccounts}
          selectedAccount={selectedAccount}
          selectAccount={selectAccount}
          togglePin={togglePin}
          {...modalProps}
        />
      </BottomSheet>
    </View>
  )
}

export default NewPublicAccounts
