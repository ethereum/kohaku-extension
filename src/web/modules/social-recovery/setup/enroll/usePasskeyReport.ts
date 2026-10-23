/** The passkey row's returned ceremony: its own stored requests, under the passkey slug. */
import { passkeyRequestOf, PASSKEY_SLUG } from './passkey'
import type { PasskeyReport, PasskeyReportInput } from './types'
import useRowReport from './useRowReport'

const usePasskeyReport = ({
  account,
  chainId,
  book,
  ...input
}: PasskeyReportInput): PasskeyReport =>
  useRowReport({
    ...input,
    slug: PASSKEY_SLUG,
    askedOf: (record) =>
      passkeyRequestOf(record, { account, chainId, methodAddress: book.methods.passkey })
  })

export default usePasskeyReport
