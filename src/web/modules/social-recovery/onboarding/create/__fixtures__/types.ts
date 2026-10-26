import type {
  AccountOnPage,
  ImportStatus as ImportStatusType
} from '@ambire-common/interfaces/account'

/** The addresses the mocked usage check finds used. */
export type UsedAddressesMock = { usedAddrs: string[] }

/** What a stand-in takes: one address. */
export type AddressArgs = { address: string }

/** The props of the stand-in tooltip: the anchor's id and the content. */
export type TooltipProps = { id: string; content: string }

/** How a test builds one account on the page; each member has a default. */
export type AccountOnPageOptions = {
  slot?: number
  index?: number
  importStatus?: ImportStatusType
}

/** The props a test renders the list with. */
export type ListProps = {
  accountsOnPage: AccountOnPage[]
  selectedAccounts?: AccountOnPage[]
  shouldSelectSmartAccountAutomatically?: boolean
}
