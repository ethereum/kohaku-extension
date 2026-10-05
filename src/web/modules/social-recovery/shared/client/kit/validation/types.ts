import type {
  Address,
  ClientConfiguration,
  DeploymentDescriptor
} from '@web/modules/social-recovery/sdk-interfaces'

/** The method addresses of a deployment, which tell a secondary method and price a verify. */
export type DeploymentMethods = Pick<
  DeploymentDescriptor,
  'methodEcdsa' | 'methodPasskey' | 'methodAadhaar' | 'methodZkpassport'
>

/** What the findings over a draft alone read beside the draft. */
export interface DraftFindingsInput {
  /** The account the places' default salts are derived for. */
  account: Address
  descriptor: DeploymentMethods
  /** The timing and cost numbers; each one the configuration leaves out takes the shipped default. */
  config: Pick<ClientConfiguration, 'maximumWait' | 'shortWaitBelow' | 'ruleCostBound'>
  /** The timestamp of the block the wait's field width is judged at. */
  blockTimestamp: number
}

/** One place of the costliest set of credentials that satisfies a rule, with its method's verify cost. */
export interface CostedPlace {
  place: number
  method: Address
  cost: bigint
}
