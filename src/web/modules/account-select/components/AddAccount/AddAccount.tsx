import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

// import AddCircularIcon from '@common/assets/svg/AddCircularIcon'
import AddFromCurrentRecoveryPhraseIcon from '@common/assets/svg/AddFromCurrentRecoveryPhraseIcon'
// import HWIcon from '@common/assets/svg/HWIcon'
// import ImportAccountIcon from '@common/assets/svg/ImportAccountIcon'
// import ImportJsonIcon from '@common/assets/svg/ImportJsonIcon'
// import LatticeMiniIcon from '@common/assets/svg/LatticeMiniIcon'
// import LedgerMiniIcon from '@common/assets/svg/LedgerMiniIcon'
// import PrivateKeyIcon from '@common/assets/svg/PrivateKeyIcon'
// import SeedPhraseIcon from '@common/assets/svg/SeedPhraseIcon'
// import TrezorMiniIcon from '@common/assets/svg/TrezorMiniIcon'
// import ViewOnlyIcon from '@common/assets/svg/ViewOnlyIcon'
import BottomSheet from '@common/components/BottomSheet'
import Option from '@common/components/Option'
import { PanelBackButton, PanelTitle } from '@common/components/Panel/Panel'
import useTheme from '@common/hooks/useTheme'
// import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
// import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
// import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import SavedSeedPhrases from '@web/modules/account-select/components/SavedSeedPhrases'

// import ExpandableOptionSection from './ExpandableOptionSection'
import getStyles from './styles'

const AddAccount = ({ handleClose }: { handleClose: () => void }) => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  // const { dispatch } = useBackgroundService()
  // const { goToNextRoute /* , setTriggeredHwWalletFlow */ } = useOnboardingNavigation()
  const { seeds } = useKeystoreControllerState()

  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()

  // const optionsHW = useMemo(() => {
  //   return [
  //     {
  //       key: 'trezor',
  //       text: t('Trezor'),
  //       icon: TrezorMiniIcon,
  //       onPress: () => {
  //         setTriggeredHwWalletFlow('trezor')
  //         dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_TREZOR' })
  //       },
  //       testID: 'trezor-option'
  //     },
  //     {
  //       key: 'ledger',
  //       text: t('Ledger'),
  //       icon: LedgerMiniIcon,
  //       onPress: () => {
  //         goToNextRoute(WEB_ROUTES.ledgerConnect)
  //       },
  //       testID: 'ledger-option'
  //     },

  //     {
  //       key: 'lattice',
  //       text: t('GridPlus'),
  //       icon: LatticeMiniIcon,
  //       onPress: () => {
  //         setTriggeredHwWalletFlow('lattice')
  //         dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_LATTICE' })
  //       },
  //       testID: 'lattice-option'
  //     }
  //   ]
  // }, [dispatch, goToNextRoute, setTriggeredHwWalletFlow, t])

  // const optionsImportAccount = useMemo(() => {
  //   return [
  //     {
  //       key: 'recovery-phrase',
  //       text: t('Recovery phrase'),
  //       icon: SeedPhraseIcon,
  //       onPress: () => goToNextRoute(WEB_ROUTES.importSeedPhrase),
  //       testID: 'import-recovery-phrase'
  //     }
  // {
  //   key: 'private-key',
  //   text: t('Private key'),
  //   icon: PrivateKeyIcon,
  //   onPress: () => goToNextRoute(WEB_ROUTES.importPrivateKey),
  //   testID: 'import-private-key'
  // },
  // {
  //   key: 'json-backup-file',
  //   text: t('JSON backup file'),
  //   icon: ImportJsonIcon,
  //   onPress: () => goToNextRoute(WEB_ROUTES.importSmartAccountJson),
  //   testID: 'import-json-backup-file'
  // }
  //   ]
  // }, [goToNextRoute, t])

  return (
    <>
      <View style={spacings.ptSm}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbLg]}>
          <PanelBackButton onPress={handleClose} style={spacings.mrSm} />
          <PanelTitle title={t('Add an account')} style={text.left} />
        </View>
        <View style={styles.optionsWrapper}>
          <Option
            text={t('Add from stored recovery phrases')}
            disabled={!seeds.length}
            icon={AddFromCurrentRecoveryPhraseIcon}
            onPress={openBottomSheet as any}
            iconProps={{ width: 32, height: 32 }}
            testID="add-from-current-recovery-phrase"
          />
          {/* <Option
            text={t('Create new recovery phrase')}
            icon={AddCircularIcon}
            onPress={() => goToNextRoute(WEB_ROUTES.createSeedPhrasePrepare)}
            testID="create-new-recovery-phrase"
          /> */}
        </View>
        {/* <View style={styles.optionsWrapper}>
          <ExpandableOptionSection
            dropdownText={t('Import an account')}
            dropdownIcon={ImportAccountIcon}
            dropdownTestID="import-account"
            options={optionsImportAccount}
          />
        </View> */}
        {/* <View style={styles.optionsWrapper}>
          <ExpandableOptionSection
            dropdownText={t('Connect a hardware wallet')}
            dropdownIcon={HWIcon}
            dropdownTestID="connect-hardware-wallet"
            options={optionsHW}
            icons={optionsHW.map(({ key, icon: Icon }) => ({
              key,
              component: Icon
            }))}
          />
        </View>
        <View>
          <Option
            text={t('Watch an address')}
            icon={ViewOnlyIcon}
            iconProps={{ width: 30, height: 30, strokeWidth: '2.75' }}
            onPress={() => goToNextRoute(WEB_ROUTES.viewOnlyAccountAdder)}
            testID="connect-hardware-wallet"
          />
        </View> */}
      </View>
      <BottomSheet
        id="seed-phrases-bottom-sheet"
        sheetRef={sheetRef}
        adjustToContentHeight={false}
        containerInnerWrapperStyles={{ flex: 1 }}
        isScrollEnabled={false}
        closeBottomSheet={closeBottomSheet}
      >
        <SavedSeedPhrases handleClose={closeBottomSheet as any} />
      </BottomSheet>
    </>
  )
}

export default React.memo(AddAccount)
