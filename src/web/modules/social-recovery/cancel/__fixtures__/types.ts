import type { Banner } from '@ambire-common/interfaces/banner'
import type { Address } from '@kohaku-eth/social-recovery'

/** The props of the stand-in banner: the banner the dashboard hands it. */
export type BannerStubProps = { banner: Banner }

/** Who a scripted cancel names and which places it used; each member has a default. */
export type CancelLogOptions = { emitter?: Address; canceller?: Address; usedPlaces?: bigint[] }

/** What the cancel screen's mocked hooks answer; a test sets each member. */
export type CancelScreenMocks = {
  navigate: jest.Mock
  dispatch: jest.Mock
  selected: string | null
  client: Record<string, unknown>
  facts: Record<string, unknown>
  reads: unknown
  storage: unknown
}

/** The props of a stand-in that renders only its children. */
export type ChildrenProps = { children: unknown }

/** A key the keystore lists: its address and its type. */
export type KeystoreKey = { addr: Address; type: string }

/** The props of the probe: the account it reads, or none. */
export type AccountProbeProps = { account: Address | null }
