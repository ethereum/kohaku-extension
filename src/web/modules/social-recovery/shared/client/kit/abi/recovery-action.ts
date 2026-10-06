/** The Ambire recovery action's ABI. */
export const RECOVERY_ACTION_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_manager', type: 'address', internalType: 'contract IPolicyManager' },
      { name: '_ambireImplementation', type: 'address', internalType: 'address' }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'AMBIRE_IMPLEMENTATION',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'BINDING',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'KEY_VALUE',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'KIT_SLOT',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'MANAGER',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IPolicyManager' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'executeHandover',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_payload', type: 'bytes', internalType: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'holdsAnyPrivilege',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_candidate', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '_reserved', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'isAuthority',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_authority', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '_holds', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'isAuthorized',
    inputs: [{ name: '_account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '_authorized', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '_actionName', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'supportsAccount',
    inputs: [{ name: '_account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '_supported', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'supportsInterface',
    inputs: [{ name: '_interfaceId', type: 'bytes4', internalType: 'bytes4' }],
    outputs: [{ name: '_supported', type: 'bool', internalType: 'bool' }],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'validateSig',
    inputs: [
      { name: '', type: 'bytes', internalType: 'bytes' },
      { name: '', type: 'bytes', internalType: 'bytes' },
      {
        name: '_calls',
        type: 'tuple[]',
        internalType: 'struct IAmbireRecoveryAction.Transaction[]',
        components: [
          { name: 'to', type: 'address', internalType: 'address' },
          { name: 'value', type: 'uint256', internalType: 'uint256' },
          { name: 'data', type: 'bytes', internalType: 'bytes' }
        ]
      }
    ],
    outputs: [
      { name: '_isValidSignature', type: 'bool', internalType: 'bool' },
      { name: '_timestampValidAfter', type: 'uint256', internalType: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'version',
    inputs: [],
    outputs: [{ name: '_actionVersion', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  },
  {
    type: 'error',
    name: 'RecoveryAction_AlreadyPrivileged',
    inputs: [{ name: '_authority', type: 'address', internalType: 'address' }]
  },
  {
    type: 'error',
    name: 'RecoveryAction_BatchNotApproved',
    inputs: [{ name: '_callIndex', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'error',
    name: 'RecoveryAction_MalformedHandover',
    inputs: [{ name: '_payload', type: 'bytes', internalType: 'bytes' }]
  },
  {
    type: 'error',
    name: 'RecoveryAction_NotAKey',
    inputs: [{ name: '_authority', type: 'address', internalType: 'address' }]
  },
  {
    type: 'error',
    name: 'RecoveryAction_NotConsumable',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_state', type: 'uint8', internalType: 'enum IPolicyManager.AttemptState' },
      { name: '_consumableAfter', type: 'uint48', internalType: 'uint48' },
      { name: '_committedPayloadHash', type: 'bytes32', internalType: 'bytes32' }
    ]
  },
  {
    type: 'error',
    name: 'SafeCastOverflowedUintDowncast',
    inputs: [
      { name: 'bits', type: 'uint8', internalType: 'uint8' },
      { name: 'value', type: 'uint256', internalType: 'uint256' }
    ]
  }
] as const
