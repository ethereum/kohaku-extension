/**
 * The table of the kit's audited actions with their publishers is the
 * extension's own and is the only source of the action a screen offers or
 * names, and of each descriptor's audited set. The two deployment descriptors
 * are plain data with named placeholder addresses.
 */
import * as fs from 'fs'
import * as path from 'path'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import {
  AUDITED_ACTIONS,
  auditedActionOf,
  auditedActionsOn,
  CHAIN_IDS,
  deploymentDescriptor,
  isAuditedAction,
  MAINNET,
  PLACEHOLDER_ADDRESSES,
  publisherKeyOf,
  RECOVERY_CHAINS,
  SEPOLIA,
  UNKNOWN_ACTION
} from './harness'

const ABSENT = '0x9999999999999999999999999999999999999999' as Address

const en: unknown = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../../../../common/config/localization/translations/en.json'),
    'utf8'
  )
)

const translation = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)

describe('the audited-actions table', () => {
  it('holds a well-formed address for every audited action', () => {
    AUDITED_ACTIONS.forEach((row) => {
      expect(row.action).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })
  })

  it('names each publisher through an en.json key that holds its name', () => {
    AUDITED_ACTIONS.forEach((row) => {
      const key = publisherKeyOf(row)
      expect(key).toBe(`socialRecovery.display.publishers.${row.publisher}`)
      const name = translation(key)
      expect(typeof name).toBe('string')
      expect((name as string).length).toBeGreaterThan(0)
    })
  })

  it('answers the table row for an address in the table, whatever its letter case', () => {
    AUDITED_ACTIONS.forEach((row) => {
      const upper = `0x${row.action.slice(2).toUpperCase()}`
      const lower = `0x${row.action.slice(2).toLowerCase()}`
      expect(upper).not.toBe(lower)
      expect(auditedActionOf(row.action)).toEqual({ ...row })
      expect(auditedActionOf(upper, row.chain)).toEqual({ ...row })
      expect(auditedActionOf(lower, row.chain)).toEqual({ ...row })
      expect(isAuditedAction(upper, row.chain)).toBe(true)
    })
  })

  it('answers the explicit unknown-action value for an address absent from the table', () => {
    expect(UNKNOWN_ACTION).toEqual({ kind: 'unknown-action' })
    expect(auditedActionOf(ABSENT)).toBe(UNKNOWN_ACTION)
    expect(auditedActionOf(undefined)).toBe(UNKNOWN_ACTION)
    expect(isAuditedAction(ABSENT)).toBe(false)
  })

  it('answers unknown for an action audited on another chain than the one named', () => {
    expect(auditedActionOf(PLACEHOLDER_ADDRESSES.sepolia.action, 'mainnet')).toBe(UNKNOWN_ACTION)
    expect(auditedActionOf(PLACEHOLDER_ADDRESSES.mainnet.action, 'sepolia')).toBe(UNKNOWN_ACTION)
  })

  it('hands a screen copies, so no screen can edit the table through a lookup', () => {
    const offered = auditedActionsOn('sepolia')
    ;(offered[0] as { publisher: string }).publisher = 'someoneElse'
    expect(auditedActionsOn('sepolia')[0].publisher).toBe('ethereumFoundation')
    const found = auditedActionOf(PLACEHOLDER_ADDRESSES.sepolia.action) as { publisher: string }
    found.publisher = 'someoneElse'
    expect(
      (auditedActionOf(PLACEHOLDER_ADDRESSES.sepolia.action) as { publisher: string }).publisher
    ).toBe('ethereumFoundation')
  })

  it('is the one source of each descriptor action and audited set', () => {
    RECOVERY_CHAINS.forEach((chain) => {
      const d = deploymentDescriptor(chain)
      expect(d.auditedActions).toEqual(auditedActionsOn(chain).map((row) => row.action))
      expect(auditedActionOf(d.action, chain)).not.toBe(UNKNOWN_ACTION)
    })
  })
})

describe('the deployment descriptors', () => {
  it('carries one descriptor for Sepolia and one for Ethereum mainnet', () => {
    expect(deploymentDescriptor('sepolia').chainId).toBe(SEPOLIA)
    expect(deploymentDescriptor('mainnet').chainId).toBe(MAINNET)
    expect(CHAIN_IDS).toEqual({ sepolia: SEPOLIA, mainnet: MAINNET })
  })

  it('names the four method modules of each descriptor as its shipped methods', () => {
    RECOVERY_CHAINS.forEach((chain) => {
      const d = deploymentDescriptor(chain)
      expect(d.shippedMethods.map((a) => a.toLowerCase()).sort()).toEqual(
        [d.methodEcdsa, d.methodPasskey, d.methodAadhaar, d.methodZkpassport]
          .map((a) => a.toLowerCase())
          .sort()
      )
    })
  })

  it('answers a fresh record every call, so no caller moves the shipped data', () => {
    const first = deploymentDescriptor('sepolia')
    first.auditedActions.push(ABSENT)
    expect(deploymentDescriptor('sepolia').auditedActions).not.toContain(ABSENT)
  })

  it('uses distinct placeholder addresses on the two chains', () => {
    const all = RECOVERY_CHAINS.flatMap((chain) =>
      Object.values(PLACEHOLDER_ADDRESSES[chain]).map((a) => a.toLowerCase())
    )
    expect(new Set(all).size).toBe(all.length)
  })
})
