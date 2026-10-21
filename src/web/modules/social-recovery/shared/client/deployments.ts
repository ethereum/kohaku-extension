/**
 * What each recovery chain runs: the scripted stand-in, or a deployed kit and
 * its facts.
 *
 * The committed table names the stand-in for both chains until a public
 * deployment lands; that chain's row then becomes `deployed` here. A
 * developer's build overrides Sepolia through the build-time variable
 * `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT`, a JSON object of the deployment's
 * facts. A malformed value throws at first use with the field it got wrong,
 * and never falls back to the stand-in. With no variable, every chain answers
 * the committed row.
 */
import { isAddress, isAddressEqual, zeroAddress } from 'viem'

import type { Address } from '@kohaku-eth/social-recovery'

import { SEPOLIA_DEPLOYMENT_VARIABLE, sepoliaDeploymentVariable } from './deployment-env'
import type {
  DeployedAuditedAction,
  Deployment,
  DeploymentFacts,
  ParsedDeploymentVariable,
  Publisher,
  RecoveryChain
} from './types'

/**
 * The publishers of the audited actions, as slugs. A slug is data, never
 * copy: a screen renders a publisher's name through its en.json key,
 * `publisherKeyOf`, and this folder ships no string.
 */
export const PUBLISHERS = ['ethereumFoundation'] as const

/** The committed table: what each chain runs in a build that sets no variable. */
export const DEPLOYMENTS: Readonly<Record<RecoveryChain, Deployment>> = {
  sepolia: { kind: 'stand-in' },
  mainnet: { kind: 'stand-in' }
}

const REQUIRED_ADDRESSES = ['manager', 'methodEcdsa', 'methodPasskey', 'action'] as const
const OPTIONAL_ADDRESSES = ['methodAadhaar', 'methodZkpassport'] as const
const FIELDS: readonly string[] = [
  ...REQUIRED_ADDRESSES,
  ...OPTIONAL_ADDRESSES,
  'zkPassportDomain',
  'zkPassportScope',
  'zkPassportTestnetTree',
  'aadhaarNullifierSeed',
  'aadhaarCertificate',
  'deployedAt',
  'digestVersion',
  'managerVersion',
  'auditedActions',
  'explorerUrl'
]
// An identity method's request needs both fields of its pair, so a line names both or neither.
const IDENTITY_PAIRS = [
  ['zkPassportDomain', 'zkPassportScope'],
  ['aadhaarNullifierSeed', 'aadhaarCertificate']
] as const
const AUDITED_ACTION_FIELDS: readonly string[] = ['action', 'publisher']

const refuse = (reason: string): never => {
  throw new Error(`${SEPOLIA_DEPLOYMENT_VARIABLE} is malformed: ${reason}.`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const onlyFields = (record: Record<string, unknown>, fields: readonly string[], where: string) => {
  const unknown = Object.keys(record).find((key) => !fields.includes(key))
  if (unknown !== undefined) {
    refuse(`${where} has the unknown field "${unknown}"`)
  }
}

// The zero address marks an empty slot in the wallet's records, so no
// deployment may name it.
const addressAt = (value: unknown, field: string): Address => {
  if (typeof value !== 'string' || !isAddress(value) || isAddressEqual(value, zeroAddress)) {
    return refuse(`${field} must be a non-zero address`)
  }
  return value
}

const blockAt = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return refuse('deployedAt must be a whole block number of zero or more')
  }
  return value
}

const textAt = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return refuse(`${field} must be a non-empty string`)
  }
  return value
}

const flagAt = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    return refuse(`${field} must be true or false`)
  }
  return value
}

// The seed is an element of the proving curve's scalar field, so it is a
// decimal number below that field's modulus.
const PROVING_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

const nullifierSeedAt = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    return refuse('aadhaarNullifierSeed must be a decimal number')
  }
  if (BigInt(value) >= PROVING_FIELD_MODULUS) {
    return refuse('aadhaarNullifierSeed must be a decimal number below the proving field')
  }
  return value
}

const PEM_BEGIN = '-----BEGIN CERTIFICATE-----'

// One complete PEM block: the begin line, one or more lines of base64, the end line.
const PEM_CERTIFICATE =
  /^-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----$/

const certificateAt = (value: unknown): string => {
  const text = textAt(value, 'aadhaarCertificate')
  if (!text.includes(PEM_BEGIN)) {
    return refuse('aadhaarCertificate must be a PEM certificate')
  }
  if (!PEM_CERTIFICATE.test(text.trim())) {
    return refuse('aadhaarCertificate must be a complete PEM certificate')
  }
  return text
}

const isPublisher = (value: unknown): value is Publisher =>
  PUBLISHERS.some((publisher) => publisher === value)

const auditedActionsAt = (value: unknown): DeployedAuditedAction[] => {
  if (!Array.isArray(value)) {
    return refuse('auditedActions must be a list')
  }
  return value.map((entry: unknown, index) => {
    const where = `auditedActions[${index}]`
    if (!isRecord(entry)) {
      return refuse(`${where} must be an object`)
    }
    onlyFields(entry, AUDITED_ACTION_FIELDS, where)
    if (!isPublisher(entry.publisher)) {
      return refuse(`${where}.publisher must be one of ${PUBLISHERS.join(', ')}`)
    }
    return { action: addressAt(entry.action, `${where}.action`), publisher: entry.publisher }
  })
}

const explorerUrlAt = (value: unknown): string => {
  const text = textAt(value, 'explorerUrl')
  let protocol: string
  try {
    protocol = new URL(text).protocol
  } catch {
    return refuse('explorerUrl must be a URL')
  }
  if (protocol !== 'https:' && protocol !== 'http:') {
    return refuse('explorerUrl must be an http or https URL')
  }
  return text
}

/**
 * The deployment facts a variable's raw value names. Throws, naming the
 * variable and the field, where the value is not a JSON object of exactly the
 * known fields, an address is malformed or zero, the deployment block is not a
 * whole number of zero or more, a version or an identity method's text is
 * empty, the testnet flag is not a boolean, the Aadhaar nullifier seed is not
 * a decimal number below the proving field, the Aadhaar certificate is not one
 * complete PEM block, the line names one field of the zkPassport domain and
 * scope or of the Aadhaar seed and certificate without the other, an audited
 * action names an unknown publisher, or the explorer URL is not an http or
 * https URL.
 */
export const deploymentFactsFrom = (raw: string): DeploymentFacts => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return refuse('the value is not JSON')
  }
  if (!isRecord(parsed)) {
    return refuse('the value must be a JSON object')
  }
  onlyFields(parsed, FIELDS, 'the object')
  const facts: DeploymentFacts = {
    manager: addressAt(parsed.manager, 'manager'),
    methodEcdsa: addressAt(parsed.methodEcdsa, 'methodEcdsa'),
    methodPasskey: addressAt(parsed.methodPasskey, 'methodPasskey'),
    action: addressAt(parsed.action, 'action'),
    deployedAt: blockAt(parsed.deployedAt),
    digestVersion: textAt(parsed.digestVersion, 'digestVersion'),
    managerVersion: textAt(parsed.managerVersion, 'managerVersion'),
    auditedActions: auditedActionsAt(parsed.auditedActions)
  }
  OPTIONAL_ADDRESSES.forEach((field) => {
    if (parsed[field] !== undefined) {
      facts[field] = addressAt(parsed[field], field)
    }
  })
  if (parsed.zkPassportDomain !== undefined) {
    facts.zkPassportDomain = textAt(parsed.zkPassportDomain, 'zkPassportDomain')
  }
  if (parsed.zkPassportScope !== undefined) {
    facts.zkPassportScope = textAt(parsed.zkPassportScope, 'zkPassportScope')
  }
  if (parsed.zkPassportTestnetTree !== undefined) {
    facts.zkPassportTestnetTree = flagAt(parsed.zkPassportTestnetTree, 'zkPassportTestnetTree')
  }
  if (parsed.aadhaarNullifierSeed !== undefined) {
    facts.aadhaarNullifierSeed = nullifierSeedAt(parsed.aadhaarNullifierSeed)
  }
  if (parsed.aadhaarCertificate !== undefined) {
    facts.aadhaarCertificate = certificateAt(parsed.aadhaarCertificate)
  }
  if (parsed.explorerUrl !== undefined) {
    facts.explorerUrl = explorerUrlAt(parsed.explorerUrl)
  }
  IDENTITY_PAIRS.forEach(([first, second]) => {
    if ((facts[first] === undefined) !== (facts[second] === undefined)) {
      refuse(`${first} and ${second} must be given together`)
    }
  })
  return facts
}

let parsedVariable: ParsedDeploymentVariable | undefined

const sepoliaOverride = (): DeploymentFacts | undefined => {
  const raw = sepoliaDeploymentVariable()
  if (raw === undefined) {
    return undefined
  }
  if (parsedVariable?.raw !== raw) {
    parsedVariable = { raw, facts: deploymentFactsFrom(raw) }
  }
  return parsedVariable.facts
}

/**
 * What a chain runs, as a fresh record every call: Sepolia's deployment from
 * the build-time variable where the build sets one, else the committed row.
 * Throws where the variable is malformed.
 */
export const deploymentOf = (chain: RecoveryChain): Deployment => {
  const override = chain === 'sepolia' ? sepoliaOverride() : undefined
  const deployment: Deployment = override
    ? { kind: 'deployed', facts: override }
    : DEPLOYMENTS[chain]
  if (deployment.kind === 'stand-in') {
    return { kind: 'stand-in' }
  }
  const { facts } = deployment
  return {
    kind: 'deployed',
    facts: { ...facts, auditedActions: facts.auditedActions.map((row) => ({ ...row })) }
  }
}
