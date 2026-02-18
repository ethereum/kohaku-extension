import { useCallback, useMemo, useRef, useState } from 'react'

import { Contract, formatUnits } from 'ethers'

import { Network } from '@ambire-common/interfaces/network'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import { Contact } from '@ambire-common/controllers/addressBook/addressBook'
import useAddressBookControllerState from '@web/hooks/useAddressBookControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { getRpcProviderForUI } from '@web/services/provider/getRpcProviderForUI'

export interface SimulationLogInput {
  name: string
  type: string
  value: string
}

export interface SimulationLogRaw {
  address: string
  data: string
  topics: string[]
}

export interface SimulationLog {
  name: string
  inputs: SimulationLogInput[]
  raw: SimulationLogRaw
}

export interface SimulationRawResult {
  gasUsed: string
  logs: SimulationLog[]
  status: string
  returnValue: string
}

export interface EnrichedLogInput {
  name: string
  type: string
  rawValue: string
  displayValue: string
  addressBookName?: string
}

export interface EnrichedLog {
  name: string
  contractAddress: string
  contractAddressBookName?: string
  inputs: EnrichedLogInput[]
  raw: SimulationLogRaw
  isTokenEvent: boolean
  tokenSymbol?: string
  tokenName?: string
  tokenDecimals?: number
}

export interface EnrichedSimulationResult {
  gasUsed: string
  gasUsedDecimal: string
  logs: EnrichedLog[]
  status: string
  statusLabel: 'success' | 'reverted'
  returnValue: string
}

export interface ColibriSimulationState {
  isLoading: boolean
  result: EnrichedSimulationResult | null
  error: string | null
  isColibriAvailable: boolean
}

const TOKEN_EVENTS = new Set(['Deposit', 'Transfer', 'Mint', 'Burn', 'Withdrawal'])

const ERC20_METADATA_ABI = [
  'function name() view returns(string)',
  'function symbol() view returns(string)',
  'function decimals() view returns(uint8)'
]

function resolveAddressBookName(address: string, contacts: Contact[]): string | undefined {
  return contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatInputValue(input: SimulationLogInput, contacts: Contact[]): EnrichedLogInput {
  const { name, type, value } = input

  if (type === 'address') {
    const bookName = resolveAddressBookName(value, contacts)
    return {
      name,
      type,
      rawValue: value,
      displayValue: bookName ? `${bookName} (${shortenAddress(value)})` : shortenAddress(value),
      addressBookName: bookName
    }
  }

  if (/^u?int\d*$/.test(type)) {
    try {
      return { name, type, rawValue: value, displayValue: BigInt(value).toString() }
    } catch {
      return { name, type, rawValue: value, displayValue: value }
    }
  }

  if (type === 'bool') {
    return { name, type, rawValue: value, displayValue: value === '0x1' ? 'true' : value }
  }

  return { name, type, rawValue: value, displayValue: value }
}

async function fetchTokenMetadata(
  contractAddress: string,
  provider: any
): Promise<{ tokenName: string | null; tokenSymbol: string | null; tokenDecimals: number | null }> {
  try {
    const contract = new Contract(contractAddress, ERC20_METADATA_ABI, provider)
    const [tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
      contract.name().catch(() => null),
      contract.symbol().catch(() => null),
      contract.decimals().catch(() => null)
    ])
    return {
      tokenName: tokenName ?? null,
      tokenSymbol: tokenSymbol ?? null,
      tokenDecimals: tokenDecimals != null ? Number(tokenDecimals) : null
    }
  } catch {
    return { tokenName: null, tokenSymbol: null, tokenDecimals: null }
  }
}

function formatTokenAmount(
  inputs: EnrichedLogInput[],
  decimals: number | null,
  symbol: string | null
): EnrichedLogInput[] {
  if (decimals == null || symbol == null) return inputs

  return inputs.map((input) => {
    if (/^u?int\d*$/.test(input.type) && ['wad', 'amount', 'value', 'tokens'].includes(input.name.toLowerCase())) {
      try {
        const formatted = formatUnits(BigInt(input.rawValue), decimals)
        return { ...input, displayValue: `${formatted} ${symbol}` }
      } catch {
        return input
      }
    }
    return input
  })
}

export default function useColibriSimulation(
  network: Network | undefined,
  accountOp: AccountOp | undefined
) {
  const { dispatch } = useBackgroundService()
  const { contacts } = useAddressBookControllerState()
  const [state, setState] = useState<ColibriSimulationState>({
    isLoading: false,
    result: null,
    error: null,
    isColibriAvailable: false
  })

  const providerRef = useRef<any>(null)

  const isColibriAvailable = useMemo(
    () => network?.rpcProvider === 'colibri',
    [network?.rpcProvider]
  )

  const enrichLogs = useCallback(
    async (logs: SimulationLog[], provider: any): Promise<EnrichedLog[]> => {
      const tokenMetadataCache = new Map<
        string,
        { tokenName: string | null; tokenSymbol: string | null; tokenDecimals: number | null }
      >()

      const enrichedLogs: EnrichedLog[] = []

      for (const log of logs) {
        const isTokenEvent = TOKEN_EVENTS.has(log.name)
        const contractAddr = log.raw.address
        const contractAddressBookName = resolveAddressBookName(contractAddr, contacts)

        let enrichedInputs = log.inputs.map((input) => formatInputValue(input, contacts))

        if (isTokenEvent) {
          let meta = tokenMetadataCache.get(contractAddr.toLowerCase())
          if (!meta) {
            // eslint-disable-next-line no-await-in-loop
            meta = await fetchTokenMetadata(contractAddr, provider)
            tokenMetadataCache.set(contractAddr.toLowerCase(), meta)
          }

          enrichedInputs = formatTokenAmount(enrichedInputs, meta.tokenDecimals, meta.tokenSymbol)

          enrichedLogs.push({
            name: log.name,
            contractAddress: contractAddr,
            contractAddressBookName,
            inputs: enrichedInputs,
            raw: log.raw,
            isTokenEvent: true,
            tokenSymbol: meta.tokenSymbol ?? undefined,
            tokenName: meta.tokenName ?? undefined,
            tokenDecimals: meta.tokenDecimals ?? undefined
          })
        } else {
          enrichedLogs.push({
            name: log.name,
            contractAddress: contractAddr,
            contractAddressBookName,
            inputs: enrichedInputs,
            raw: log.raw,
            isTokenEvent: false
          })
        }
      }

      return enrichedLogs
    },
    [contacts]
  )

  const simulate = useCallback(async () => {
    if (!network || !accountOp || !accountOp.calls.length) {
      setState((prev) => ({ ...prev, error: 'No transaction to simulate' }))
      return
    }

    if (!isColibriAvailable) {
      setState((prev) => ({
        ...prev,
        error: 'Simulation is only available when Colibri is selected as the RPC provider. You can change this in the network settings.'
      }))
      return
    }

    setState({ isLoading: true, result: null, error: null, isColibriAvailable: true })

    try {
      if (!providerRef.current) {
        providerRef.current = getRpcProviderForUI(network, dispatch)
      }
      const provider = providerRef.current

      const call = accountOp.calls[0]
      const txParams = {
        from: accountOp.accountAddr,
        to: call.to,
        data: call.data || '0x',
        value: call.value ? `0x${call.value.toString(16)}` : '0x0'
      }

      const rawResult: SimulationRawResult = await provider.send('colibri_simulateTransaction', [
        txParams,
        'latest'
      ])

      const enrichedLogs = await enrichLogs(rawResult.logs || [], provider)

      const gasUsedDecimal = BigInt(rawResult.gasUsed).toString()

      const enrichedResult: EnrichedSimulationResult = {
        gasUsed: rawResult.gasUsed,
        gasUsedDecimal,
        logs: enrichedLogs,
        status: rawResult.status,
        statusLabel: rawResult.status === '0x1' ? 'success' : 'reverted',
        returnValue: rawResult.returnValue
      }

      setState({ isLoading: false, result: enrichedResult, error: null, isColibriAvailable: true })
    } catch (e: any) {
      setState({
        isLoading: false,
        result: null,
        error: e.message || 'Simulation failed',
        isColibriAvailable: true
      })
    }
  }, [network, accountOp, isColibriAvailable, dispatch, enrichLogs])

  const clear = useCallback(() => {
    setState({ isLoading: false, result: null, error: null, isColibriAvailable })
  }, [isColibriAvailable])

  return {
    ...state,
    isColibriAvailable,
    simulate,
    clear
  }
}
