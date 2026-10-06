/** The passkey method's ABI. */
export const PASSKEY_METHOD_ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '_moduleName', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'supportsInterface',
    inputs: [{ name: '_interfaceId', type: 'bytes4', internalType: 'bytes4' }],
    outputs: [{ name: '_supported', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'trustedParties',
    inputs: [],
    outputs: [
      { name: '_admin', type: 'address', internalType: 'address' },
      { name: '_pendingAdmin', type: 'address', internalType: 'address' },
      { name: '_trustedKeys', type: 'bytes32[]', internalType: 'bytes32[]' },
      { name: '_pauseHolder', type: 'address', internalType: 'address' },
      { name: '_pendingPauseHolder', type: 'address', internalType: 'address' }
    ],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'verify',
    inputs: [
      { name: '_config', type: 'bytes', internalType: 'bytes' },
      { name: '_digest', type: 'bytes32', internalType: 'bytes32' },
      { name: '_proof', type: 'bytes', internalType: 'bytes' }
    ],
    outputs: [{ name: '_magicValue', type: 'bytes4', internalType: 'bytes4' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'version',
    inputs: [],
    outputs: [{ name: '_moduleVersion', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  }
] as const
