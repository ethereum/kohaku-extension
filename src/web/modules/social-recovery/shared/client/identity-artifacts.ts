/**
 * Where the installed Aadhaar prover fetches its circuit's files: the Anon
 * Aadhaar project's hosted v2 artifacts, the proving key in chunks the prover
 * fetches once and keeps in the browser's IndexedDB.
 */
import type { AnonAadhaarArtifacts } from '@kohaku-eth/social-recovery/recovery-methods'

const ARTIFACTS_BASE = 'https://anon-aadhaar-artifacts.s3.eu-central-1.amazonaws.com/v2.0.0'

export const AADHAAR_ARTIFACTS: AnonAadhaarArtifacts = {
  wasmURL: `${ARTIFACTS_BASE}/aadhaar-verifier.wasm`,
  zkeyURL: `${ARTIFACTS_BASE}/chunked_zkey`,
  vkeyURL: `${ARTIFACTS_BASE}/vkey.json`,
  artifactsOrigin: 'chunked'
}
