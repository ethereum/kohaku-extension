/**
 * The two members of the Ambire account the wallet reads to list who holds a
 * privilege on a deployed account: the `privileges` view and the
 * `LogPrivilegeChanged` event every privilege write emits. Data only.
 */
export const AMBIRE_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'privileges',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'LogPrivilegeChanged',
    inputs: [
      { name: 'addr', type: 'address', indexed: true, internalType: 'address' },
      { name: 'priv', type: 'bytes32', indexed: false, internalType: 'bytes32' }
    ],
    anonymous: false
  }
] as const
