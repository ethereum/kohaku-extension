import { SignAccountOpController } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { Sponsor } from '@ambire-common/libs/erc7677/types'
import { FeePaymentOption } from '@ambire-common/libs/estimate/interfaces'
import { TokenResult } from '@ambire-common/libs/portfolio'
import { SelectValue } from '@common/components/Select/types'

type FeeOption = Pick<SelectValue, 'value' | 'label' | 'disabled'> &
  Pick<FeePaymentOption, 'paidBy'> & {
    token: TokenResult | null
  }

type Props = {
  signAccountOpState: SignAccountOpController | null
  disabled: boolean
  hasEstimation: boolean
  slowRequest: boolean
  isViewOnly: boolean
  isSponsored: boolean
  sponsor: Sponsor | undefined
  updateType: 'Main' | 'Swap&Bridge' | 'Transfer&TopUp' | 'PrivacyPools'
  bundlerNonceDiscrepancy?: {
    id: string
    title: string
  }
}

export type { FeeOption, Props }
