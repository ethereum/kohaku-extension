import type { scriptedChain } from '@web/modules/social-recovery/watcher/__fixtures__/harness'

/** A cut in the chain's time: its name and how it changes the chain. */
export type TimeCut = { name: string; cut: (chain: ReturnType<typeof scriptedChain>) => void }

/** The props of the probe: the sources it watches. */
export type SourcesProps<Sources> = { sources: Sources }
