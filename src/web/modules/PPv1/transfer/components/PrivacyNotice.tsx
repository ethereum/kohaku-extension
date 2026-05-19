import Alert from '@common/components/Alert'
import spacings from '@common/styles/spacings'
import Text from '@common/components/Text'
import { Linking } from 'react-native'
import { useTranslation } from '@common/config/localization'

const PrivacyNotice = ({ msgs, learnMoreLink }: { msgs: string[]; learnMoreLink: string }) => {
  const { t } = useTranslation()
  const totalMsg = msgs.length

  return (
    <Alert
      type="warning"
      title={t('Privacy notice')}
      size="sm"
      style={{
        ...spacings.mbSm,
        backgroundColor: '#FFA50014',
        borderColor: '#FFA50066',
        borderRadius: 8
      }}
    >
      <Alert.Text size="sm" type="warning">
        {msgs.map((msg, index) => (
          <>
            {msg}
            {index === totalMsg - 1 ? `${' '}` : '\n\n'}
          </>
        ))}
        <Text
          fontSize={12}
          weight="semiBold"
          appearance="warningText"
          onPress={() => Linking.openURL(learnMoreLink)}
        >
          {t('Learn more')}
        </Text>
      </Alert.Text>
    </Alert>
  )
}

export default PrivacyNotice
