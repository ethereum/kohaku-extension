/** An identity row's returned ceremony: its own stored requests, under the kind's slug. */
import { identityRequestOf } from './identity'
import type { IdentityReportInput, RowReport, IdentityCeremonyRequest } from './types'
import useRowReport from './useRowReport'

const useIdentityReport = ({
  kind,
  account,
  chainId,
  book,
  ...input
}: IdentityReportInput): RowReport<IdentityCeremonyRequest> =>
  useRowReport({
    ...input,
    slug: kind,
    askedOf: (record) =>
      identityRequestOf(record, kind, { account, chainId, methodAddress: book.methods[kind] })
  })

export default useIdentityReport
