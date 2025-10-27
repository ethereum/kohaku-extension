import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { TransferController } from '@ambire-common/controllers/transfer/transfer'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { findAccountDomainFromPartialDomain } from '@ambire-common/utils/domains'
import AccountsFilledIcon from '@common/assets/svg/AccountsFilledIcon'
import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import SettingsIcon from '@common/assets/svg/SettingsIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import WalletFilledIcon from '@common/assets/svg/WalletFilledIcon'
import AddressInput from '@common/components/AddressInput'
import { AddressValidation } from '@common/components/AddressInput/AddressInput'
import { InputProps } from '@common/components/Input'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useAddressBookControllerState from '@web/hooks/useAddressBookControllerState'
import useDomainsControllerState from '@web/hooks/useDomainsController/useDomainsController'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import AddressBookContact from '@common/components/AddressBookContact'
import { SectionedSelect } from '@common/components/Select'
import {
  RenderSelectedOptionParams,
  SectionedSelectProps,
  SelectValue
} from '@common/components/Select/types'
import TitleAndIcon from '@common/components/TitleAndIcon'
import AddContactBottomSheet from '@common/components/Recipient/AddContactBottomSheet'
import ConfirmAddress from '@common/components/Recipient/ConfirmAddress'
import styles from '@common/components/Recipient/styles'
import useAccountsList from '@common/hooks/useAccountsList'
import { zeroAddress } from 'viem'

interface Props extends InputProps {
  setAddress: (text: string) => void
  address: string
  ensAddress: string
  addressValidationMsg: string
  isRecipientHumanizerKnownTokenOrSmartContract: boolean
  isRecipientAddressUnknown: boolean
  isRecipientAddressUnknownAgreed: TransferController['isRecipientAddressUnknownAgreed']
  onRecipientCheckboxClick: () => void
  validation: AddressValidation
  isRecipientDomainResolving: boolean
  isSWWarningVisible: boolean
  isSWWarningAgreed: boolean
  recipientMenuClosedAutomaticallyRef: React.MutableRefObject<boolean>
  selectedTokenSymbol?: TokenResult['symbol']
  menuPosition?: 'top' | 'bottom'
}

const ADDRESS_BOOK_VISIBLE_VALIDATION = {
  isError: true, // Don't let the user submit, just in case there is an error
  message: ''
}

const SelectedMenuOption: React.FC<{
  selectRef: React.RefObject<any>
  validation: AddressValidation
  isMenuOpen: boolean
  ensAddress: string
  isRecipientDomainResolving: boolean
  address: string
  setAddress: (text: string) => void
  disabled?: boolean
  toggleMenu: () => void
  isAddressInAddressBook: boolean
  totalAvailableOptions: number
  recipientMenuClosedAutomaticallyRef: React.MutableRefObject<boolean>
}> = ({
  selectRef,
  totalAvailableOptions,
  validation,
  isMenuOpen,
  ensAddress,
  isRecipientDomainResolving,
  address,
  setAddress,
  disabled,
  toggleMenu,
  isAddressInAddressBook,
  recipientMenuClosedAutomaticallyRef
}) => {
  const { theme } = useTheme()

  useEffect(() => {
    if (isMenuOpen && !totalAvailableOptions) {
      toggleMenu()
      // eslint-disable-next-line no-param-reassign
      recipientMenuClosedAutomaticallyRef.current = true
    } else if (
      recipientMenuClosedAutomaticallyRef.current &&
      !isMenuOpen &&
      totalAvailableOptions &&
      // Reopen the menu only if the address is invalid
      // Otherwise we will reopen it while the user is done with this field
      // and wants to proceed
      validation.isError
    ) {
      toggleMenu()
      // eslint-disable-next-line no-param-reassign
      recipientMenuClosedAutomaticallyRef.current = false
    }
  }, [
    address,
    totalAvailableOptions,
    isMenuOpen,
    recipientMenuClosedAutomaticallyRef,
    toggleMenu,
    validation.isError
  ])

  return (
    <AddressInput
      inputBorderWrapperRef={selectRef}
      validation={isMenuOpen ? ADDRESS_BOOK_VISIBLE_VALIDATION : validation}
      containerStyle={styles.inputContainer}
      ensAddress={ensAddress}
      isRecipientDomainResolving={isRecipientDomainResolving}
      label="Add recipient"
      value={address}
      onChangeText={setAddress}
      disabled={disabled}
      onFocus={toggleMenu}
      childrenBeforeButtons={
        <AccountsFilledIcon
          color={theme[isAddressInAddressBook ? 'primary' : 'secondaryText']}
          opacity={isAddressInAddressBook ? 1 : 0.25}
          style={spacings.mrTy}
          width={24}
          height={24}
        />
      }
      button={isMenuOpen ? <UpArrowIcon /> : <DownArrowIcon />}
      buttonProps={{
        onPress: toggleMenu
      }}
      buttonStyle={{ ...spacings.pv0, ...spacings.ph, ...spacings.mr0, ...spacings.ml0 }}
    />
  )
}

const Recipient: React.FC<Props> = ({
  setAddress,
  address,
  ensAddress,
  addressValidationMsg,
  isRecipientAddressUnknownAgreed,
  onRecipientCheckboxClick,
  isRecipientHumanizerKnownTokenOrSmartContract,
  isRecipientAddressUnknown,
  validation,
  isRecipientDomainResolving,
  disabled,
  isSWWarningVisible,
  isSWWarningAgreed,
  selectedTokenSymbol,
  recipientMenuClosedAutomaticallyRef
}) => {
  const { account } = useSelectedAccountControllerState()
  const actualAddress = ensAddress || address
  const { navigate } = useNavigation()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const { contacts } = useAddressBookControllerState()

  const flatlistRef = useRef(null)
  const { accounts } = useAccountsList({ flatlistRef })
  const { domains } = useDomainsControllerState()
  const [bindManageBtnAnim, manageBtnAnimStyle] = useHover({
    preset: 'opacityInverted'
  })

  const myWalletAccounts = accounts.filter((contact) => contact.addr !== zeroAddress)

  const onManagePress = useCallback(() => {
    navigate(ROUTES.addressBook)
  }, [navigate])

  const isAddressInAddressBook = contacts.some((contact) => {
    return (
      actualAddress.toLowerCase() === contact.address.toLowerCase() ||
      myWalletAccounts.some(
        (myWalletAccount) => myWalletAccount.addr.toLowerCase() === actualAddress.toLowerCase()
      )
    )
  })

  const filteredContacts = useMemo(
    () =>
      contacts.filter((contact) => {
        if (!actualAddress) return true

        const lowercaseActualAddress = actualAddress.toLowerCase()
        const lowercaseName = contact.name.toLowerCase()
        const lowercaseAddress = contact.address.toLowerCase()
        const doesDomainMatch = findAccountDomainFromPartialDomain(
          contact.address,
          actualAddress,
          domains
        )

        return (
          lowercaseAddress.includes(lowercaseActualAddress) ||
          lowercaseName.includes(lowercaseActualAddress) ||
          doesDomainMatch
        )
      }),
    [contacts, actualAddress, domains]
  )

  const setAddressWrapped = useCallback(
    ({ value: newAddress }: Pick<SelectValue, 'value'>) => {
      if (typeof newAddress !== 'string') return

      const correspondingDomain = domains[newAddress]?.ens

      setAddress(correspondingDomain || newAddress)
    },
    [domains, setAddress]
  )

  const walletAccountsSourcedContactOptions = useMemo(
    () =>
      myWalletAccounts.map(({ addr }, index) => ({
        value: addr,
        label: (
          <AddressBookContact
            avatarSize={32}
            testID={`address-book-my-wallet-contact-${index + 1}`}
            key={addr}
            style={{
              borderRadius: 0,
              ...spacings.ph0,
              ...spacings.pv0
            }}
            address={addr}
            name={`Address #${index + 1}`}
          />
        )
      })),
    [myWalletAccounts]
  )

  const manuallyAddedContactOptions = useMemo(
    () =>
      filteredContacts
        .filter((contact) => !contact.isWalletAccount)
        .map((contact) => ({
          value: contact.address,
          label: (
            <AddressBookContact
              avatarSize={32}
              key={contact.address}
              style={{
                borderRadius: 0,
                ...spacings.ph0,
                ...spacings.pv0
              }}
              address={contact.address}
              name={contact.name}
            />
          )
        })),
    [filteredContacts]
  )

  const selectedOption = useMemo(
    () =>
      walletAccountsSourcedContactOptions.find((contact) => contact.value === address) ||
      manuallyAddedContactOptions.find((contact) => contact.value === address),
    [walletAccountsSourcedContactOptions, manuallyAddedContactOptions, address]
  )

  const sections = useMemo(() => {
    if (!walletAccountsSourcedContactOptions.length && !manuallyAddedContactOptions.length)
      return []

    return [
      {
        data: walletAccountsSourcedContactOptions,
        key: 'my-wallets'
      },
      {
        data: manuallyAddedContactOptions,
        key: 'contacts'
      }
    ]
  }, [walletAccountsSourcedContactOptions, manuallyAddedContactOptions])

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionedSelectProps['sections'][0] }) => {
      if (section.data.length === 0) return null

      return section.key === 'contacts' ? (
        <TitleAndIcon title={t('Address Book')} icon={AccountsFilledIcon}>
          <AnimatedPressable
            style={[flexbox.directionRow, flexbox.alignCenter, manageBtnAnimStyle]}
            onPress={onManagePress}
            {...bindManageBtnAnim}
          >
            <SettingsIcon width={18} height={18} color={theme.secondaryText} />
            <Text fontSize={14} style={spacings.mlMi} appearance="secondaryText">
              {t('Manage contacts')}
            </Text>
          </AnimatedPressable>
        </TitleAndIcon>
      ) : (
        <TitleAndIcon title={t('My wallets')} icon={WalletFilledIcon} />
      )
    },
    [bindManageBtnAnim, manageBtnAnimStyle, onManagePress, t, theme.secondaryText]
  )

  const renderSelectedOption = useCallback(
    ({ toggleMenu, isMenuOpen, selectRef }: RenderSelectedOptionParams) => {
      const totalAvailableOptions =
        walletAccountsSourcedContactOptions.length + manuallyAddedContactOptions.length
      return (
        <SelectedMenuOption
          toggleMenu={toggleMenu}
          selectRef={selectRef}
          totalAvailableOptions={totalAvailableOptions}
          isMenuOpen={isMenuOpen}
          validation={isMenuOpen ? ADDRESS_BOOK_VISIBLE_VALIDATION : validation}
          ensAddress={ensAddress}
          isRecipientDomainResolving={isRecipientDomainResolving}
          address={address}
          setAddress={setAddress}
          disabled={disabled}
          isAddressInAddressBook={isAddressInAddressBook}
          recipientMenuClosedAutomaticallyRef={recipientMenuClosedAutomaticallyRef}
        />
      )
    },
    [
      walletAccountsSourcedContactOptions.length,
      manuallyAddedContactOptions.length,
      validation,
      ensAddress,
      isRecipientDomainResolving,
      address,
      setAddress,
      disabled,
      isAddressInAddressBook,
      recipientMenuClosedAutomaticallyRef
    ]
  )

  return (
    <>
      <SectionedSelect
        value={selectedOption}
        setValue={setAddressWrapped}
        sections={sections}
        headerHeight={32}
        menuOptionHeight={54}
        withSearch={false}
        renderSectionHeader={renderSectionHeader}
        renderSelectedOption={renderSelectedOption}
        emptyListPlaceholderText={t('No contacts found')}
        menuPosition="bottom"
      />
      <View style={styles.inputBottom}>
        <ConfirmAddress
          onRecipientCheckboxClick={onRecipientCheckboxClick}
          isRecipientHumanizerKnownTokenOrSmartContract={
            isRecipientHumanizerKnownTokenOrSmartContract
          }
          isRecipientAddressUnknown={isRecipientAddressUnknown}
          isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed}
          isRecipientAddressSameAsSender={actualAddress === account?.addr}
          addressValidationMsg={addressValidationMsg}
          onAddToAddressBook={openBottomSheet}
          isSWWarningVisible={isSWWarningVisible}
          isSWWarningAgreed={isSWWarningAgreed}
          selectedTokenSymbol={selectedTokenSymbol}
        />
      </View>
      <AddContactBottomSheet
        sheetRef={sheetRef}
        address={ensAddress || address}
        closeBottomSheet={closeBottomSheet}
      />
    </>
  )
}

export default React.memo(Recipient)
