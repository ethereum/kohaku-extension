/**
 * The ABI fragments the SDK does not carry: the recovery action's immutables
 * the deployment checks read, the Ambire account's `privileges` view the
 * removed-key read asks, and the one error the SDK's tables leave out.
 * Data only.
 */
export const ACTION_IMMUTABLES_ABI = [
  {
    type: 'function',
    name: 'AMBIRE_IMPLEMENTATION',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'BINDING',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'KEY_VALUE',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'KIT_SLOT',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'MANAGER',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
] as const

export const ACCOUNT_PRIVILEGES_ABI = [
  {
    type: 'function',
    name: 'privileges',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view'
  }
] as const

/** The error the SDK's `decodeRevert` does not know, named as deployed. */
export const UNTABLED_ERRORS_ABI = [
  {
    type: 'error',
    name: 'SafeCastOverflowedUintDowncast',
    inputs: [
      { name: 'bits', type: 'uint8' },
      { name: 'value', type: 'uint256' }
    ]
  }
] as const
