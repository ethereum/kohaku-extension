/** The policy manager's ABI. */
export const POLICY_MANAGER_ABI = [
  {
    type: 'function',
    name: 'cancelByOwner',
    inputs: [{ name: '_action', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'cancelByProofs',
    inputs: [
      {
        name: '_request',
        type: 'tuple',
        internalType: 'struct IPolicyManager.CancelRequest',
        components: [
          { name: 'account', type: 'address', internalType: 'address' },
          { name: 'action', type: 'address', internalType: 'address' },
          { name: 'attemptId', type: 'uint64', internalType: 'uint64' },
          { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'setupBody', type: 'bytes', internalType: 'bytes' },
          { name: 'validUntil', type: 'uint48', internalType: 'uint48' },
          {
            name: 'proofs',
            type: 'tuple[]',
            internalType: 'struct IPolicyManager.ProofPlace[]',
            components: [
              { name: 'place', type: 'uint256', internalType: 'uint256' },
              { name: 'method', type: 'address', internalType: 'address' },
              { name: 'config', type: 'bytes', internalType: 'bytes' },
              { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
              { name: 'proof', type: 'bytes', internalType: 'bytes' }
            ]
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'cancelByVeto',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_action', type: 'address', internalType: 'address' },
      { name: '_attemptId', type: 'uint64', internalType: 'uint64' },
      { name: '_method', type: 'address', internalType: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'clearSetup',
    inputs: [{ name: '_action', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'commitSetup',
    inputs: [
      { name: '_action', type: 'address', internalType: 'address' },
      { name: '_setupCommitment', type: 'bytes32', internalType: 'bytes32' },
      { name: '_nonce', type: 'uint64', internalType: 'uint64' },
      { name: '_publicMetadata', type: 'bytes', internalType: 'bytes' },
      { name: '_privateMetadata', type: 'bytes', internalType: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'consume',
    inputs: [
      { name: '_action', type: 'address', internalType: 'address' },
      { name: '_attemptId', type: 'uint64', internalType: 'uint64' },
      { name: '_payloadHash', type: 'bytes32', internalType: 'bytes32' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'eip712Domain',
    inputs: [],
    outputs: [
      { name: '_fields', type: 'bytes1', internalType: 'bytes1' },
      { name: '_name', type: 'string', internalType: 'string' },
      { name: '_version', type: 'string', internalType: 'string' },
      { name: '_chainId', type: 'uint256', internalType: 'uint256' },
      { name: '_verifyingContract', type: 'address', internalType: 'address' },
      { name: '_salt', type: 'bytes32', internalType: 'bytes32' },
      { name: '_extensions', type: 'uint256[]', internalType: 'uint256[]' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'hashApproval',
    inputs: [
      {
        name: '_request',
        type: 'tuple',
        internalType: 'struct IPolicyManager.AttemptRequest',
        components: [
          { name: 'account', type: 'address', internalType: 'address' },
          { name: 'action', type: 'address', internalType: 'address' },
          { name: 'attemptId', type: 'uint64', internalType: 'uint64' },
          { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'setupBody', type: 'bytes', internalType: 'bytes' },
          { name: 'payload', type: 'bytes', internalType: 'bytes' },
          {
            name: 'order',
            type: 'tuple',
            internalType: 'struct IPolicyManager.PaymentOrder',
            components: [
              { name: 'token', type: 'address', internalType: 'address' },
              { name: 'amount', type: 'uint256', internalType: 'uint256' },
              { name: 'payee', type: 'address', internalType: 'address' }
            ]
          },
          { name: 'validUntil', type: 'uint48', internalType: 'uint48' },
          {
            name: 'proofs',
            type: 'tuple[]',
            internalType: 'struct IPolicyManager.ProofPlace[]',
            components: [
              { name: 'place', type: 'uint256', internalType: 'uint256' },
              { name: 'method', type: 'address', internalType: 'address' },
              { name: 'config', type: 'bytes', internalType: 'bytes' },
              { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
              { name: 'proof', type: 'bytes', internalType: 'bytes' }
            ]
          }
        ]
      },
      { name: '_place', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [{ name: '_digest', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'hashCancel',
    inputs: [
      {
        name: '_request',
        type: 'tuple',
        internalType: 'struct IPolicyManager.CancelRequest',
        components: [
          { name: 'account', type: 'address', internalType: 'address' },
          { name: 'action', type: 'address', internalType: 'address' },
          { name: 'attemptId', type: 'uint64', internalType: 'uint64' },
          { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'setupBody', type: 'bytes', internalType: 'bytes' },
          { name: 'validUntil', type: 'uint48', internalType: 'uint48' },
          {
            name: 'proofs',
            type: 'tuple[]',
            internalType: 'struct IPolicyManager.ProofPlace[]',
            components: [
              { name: 'place', type: 'uint256', internalType: 'uint256' },
              { name: 'method', type: 'address', internalType: 'address' },
              { name: 'config', type: 'bytes', internalType: 'bytes' },
              { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
              { name: 'proof', type: 'bytes', internalType: 'bytes' }
            ]
          }
        ]
      },
      { name: '_place', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [{ name: '_digest', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '_managerName', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  },
  {
    type: 'function',
    name: 'startAttempt',
    inputs: [
      {
        name: '_request',
        type: 'tuple',
        internalType: 'struct IPolicyManager.AttemptRequest',
        components: [
          { name: 'account', type: 'address', internalType: 'address' },
          { name: 'action', type: 'address', internalType: 'address' },
          { name: 'attemptId', type: 'uint64', internalType: 'uint64' },
          { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'setupBody', type: 'bytes', internalType: 'bytes' },
          { name: 'payload', type: 'bytes', internalType: 'bytes' },
          {
            name: 'order',
            type: 'tuple',
            internalType: 'struct IPolicyManager.PaymentOrder',
            components: [
              { name: 'token', type: 'address', internalType: 'address' },
              { name: 'amount', type: 'uint256', internalType: 'uint256' },
              { name: 'payee', type: 'address', internalType: 'address' }
            ]
          },
          { name: 'validUntil', type: 'uint48', internalType: 'uint48' },
          {
            name: 'proofs',
            type: 'tuple[]',
            internalType: 'struct IPolicyManager.ProofPlace[]',
            components: [
              { name: 'place', type: 'uint256', internalType: 'uint256' },
              { name: 'method', type: 'address', internalType: 'address' },
              { name: 'config', type: 'bytes', internalType: 'bytes' },
              { name: 'salt', type: 'bytes32', internalType: 'bytes32' },
              { name: 'proof', type: 'bytes', internalType: 'bytes' }
            ]
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'stateOf',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_action', type: 'address', internalType: 'address' }
    ],
    outputs: [
      {
        name: '_state',
        type: 'tuple',
        internalType: 'struct IPolicyManager.ActionState',
        components: [
          { name: 'setupCommitment', type: 'bytes32', internalType: 'bytes32' },
          { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
          { name: 'nextAttemptId', type: 'uint64', internalType: 'uint64' },
          { name: 'setupCommittedAtBlock', type: 'uint48', internalType: 'uint48' },
          {
            name: 'attempt',
            type: 'tuple',
            internalType: 'struct IPolicyManager.Attempt',
            components: [
              { name: 'attemptId', type: 'uint64', internalType: 'uint64' },
              { name: 'setupNonce', type: 'uint64', internalType: 'uint64' },
              { name: 'consumableAfter', type: 'uint48', internalType: 'uint48' },
              { name: 'state', type: 'uint8', internalType: 'enum IPolicyManager.AttemptState' },
              { name: 'ignoresPause', type: 'bool', internalType: 'bool' },
              { name: 'payloadHash', type: 'bytes32', internalType: 'bytes32' },
              {
                name: 'order',
                type: 'tuple',
                internalType: 'struct IPolicyManager.PaymentOrder',
                components: [
                  { name: 'token', type: 'address', internalType: 'address' },
                  { name: 'amount', type: 'uint256', internalType: 'uint256' },
                  { name: 'payee', type: 'address', internalType: 'address' }
                ]
              },
              { name: 'usedMethods', type: 'address[]', internalType: 'address[]' }
            ]
          }
        ]
      }
    ],
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
    name: 'version',
    inputs: [],
    outputs: [{ name: '_managerVersion', type: 'string', internalType: 'string' }],
    stateMutability: 'pure'
  },
  {
    type: 'event',
    name: 'AttemptCancelled',
    inputs: [
      { name: '_account', type: 'address', indexed: true, internalType: 'address' },
      { name: '_action', type: 'address', indexed: true, internalType: 'address' },
      { name: '_attemptId', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: '_canceller', type: 'address', indexed: false, internalType: 'address' },
      { name: '_stoppedMethod', type: 'address', indexed: false, internalType: 'address' },
      { name: '_setupNonce', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: '_usedPlaces', type: 'uint256[]', indexed: false, internalType: 'uint256[]' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'AttemptConsumed',
    inputs: [
      { name: '_account', type: 'address', indexed: true, internalType: 'address' },
      { name: '_action', type: 'address', indexed: true, internalType: 'address' },
      { name: '_attemptId', type: 'uint64', indexed: false, internalType: 'uint64' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'AttemptStarted',
    inputs: [
      { name: '_account', type: 'address', indexed: true, internalType: 'address' },
      { name: '_action', type: 'address', indexed: true, internalType: 'address' },
      { name: '_attemptId', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: '_setupNonce', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: '_setupBody', type: 'bytes', indexed: false, internalType: 'bytes' },
      { name: '_usedPlaces', type: 'uint256[]', indexed: false, internalType: 'uint256[]' },
      { name: '_usedMethods', type: 'address[]', indexed: false, internalType: 'address[]' },
      { name: '_payload', type: 'bytes', indexed: false, internalType: 'bytes' },
      {
        name: '_order',
        type: 'tuple',
        indexed: false,
        internalType: 'struct IPolicyManager.PaymentOrder',
        components: [
          { name: 'token', type: 'address', internalType: 'address' },
          { name: 'amount', type: 'uint256', internalType: 'uint256' },
          { name: 'payee', type: 'address', internalType: 'address' }
        ]
      },
      { name: '_consumableAfter', type: 'uint48', indexed: false, internalType: 'uint48' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'SetupCleared',
    inputs: [
      { name: '_account', type: 'address', indexed: true, internalType: 'address' },
      { name: '_action', type: 'address', indexed: true, internalType: 'address' },
      { name: '_nonce', type: 'uint64', indexed: false, internalType: 'uint64' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'SetupCommitted',
    inputs: [
      { name: '_account', type: 'address', indexed: true, internalType: 'address' },
      { name: '_action', type: 'address', indexed: true, internalType: 'address' },
      { name: '_nonce', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: '_setupCommitment', type: 'bytes32', indexed: false, internalType: 'bytes32' },
      { name: '_publicMetadata', type: 'bytes', indexed: false, internalType: 'bytes' },
      { name: '_privateMetadata', type: 'bytes', indexed: false, internalType: 'bytes' }
    ],
    anonymous: false
  },
  {
    type: 'error',
    name: 'PolicyManager_AttemptAlreadyActive',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_action', type: 'address', internalType: 'address' },
      { name: '_attemptId', type: 'uint64', internalType: 'uint64' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_AttemptIgnoresPause',
    inputs: [{ name: '_attemptId', type: 'uint64', internalType: 'uint64' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_CredentialMismatch',
    inputs: [
      { name: '_place', type: 'uint256', internalType: 'uint256' },
      { name: '_recomputed', type: 'bytes32', internalType: 'bytes32' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_InvalidCommitment',
    inputs: [{ name: '_supplied', type: 'bytes32', internalType: 'bytes32' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_MethodNotStopped',
    inputs: [{ name: '_method', type: 'address', internalType: 'address' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_MethodNotUsed',
    inputs: [
      { name: '_attemptId', type: 'uint64', internalType: 'uint64' },
      { name: '_method', type: 'address', internalType: 'address' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_MethodStopped',
    inputs: [
      { name: '_place', type: 'uint256', internalType: 'uint256' },
      { name: '_method', type: 'address', internalType: 'address' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_MethodVetoedSpend',
    inputs: [{ name: '_method', type: 'address', internalType: 'address' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_NoActiveAttempt',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_action', type: 'address', internalType: 'address' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_NoSetup',
    inputs: [
      { name: '_account', type: 'address', internalType: 'address' },
      { name: '_action', type: 'address', internalType: 'address' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_PlaceOutOfRange',
    inputs: [
      { name: '_place', type: 'uint256', internalType: 'uint256' },
      { name: '_count', type: 'uint256', internalType: 'uint256' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_PlacesNotStrictlyIncreasing',
    inputs: [{ name: '_place', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_ProofRejected',
    inputs: [
      { name: '_place', type: 'uint256', internalType: 'uint256' },
      { name: '_method', type: 'address', internalType: 'address' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_RequestExpired',
    inputs: [
      { name: '_blockTimestamp', type: 'uint48', internalType: 'uint48' },
      { name: '_validUntil', type: 'uint48', internalType: 'uint48' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_RuleUnsatisfied',
    inputs: [{ name: '_clause', type: 'uint256', internalType: 'uint256' }]
  },
  {
    type: 'error',
    name: 'PolicyManager_SetupCommitmentMismatch',
    inputs: [
      { name: '_recomputed', type: 'bytes32', internalType: 'bytes32' },
      { name: '_committed', type: 'bytes32', internalType: 'bytes32' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_StaleAttempt',
    inputs: [
      { name: '_judgedUnder', type: 'uint64', internalType: 'uint64' },
      { name: '_currentNonce', type: 'uint64', internalType: 'uint64' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_WaitNotOver',
    inputs: [
      { name: '_blockTimestamp', type: 'uint48', internalType: 'uint48' },
      { name: '_consumableAfter', type: 'uint48', internalType: 'uint48' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_WrongAttemptId',
    inputs: [
      { name: '_supplied', type: 'uint64', internalType: 'uint64' },
      { name: '_expected', type: 'uint64', internalType: 'uint64' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_WrongPayload',
    inputs: [
      { name: '_supplied', type: 'bytes32', internalType: 'bytes32' },
      { name: '_committed', type: 'bytes32', internalType: 'bytes32' }
    ]
  },
  {
    type: 'error',
    name: 'PolicyManager_WrongSetupNonce',
    inputs: [
      { name: '_supplied', type: 'uint64', internalType: 'uint64' },
      { name: '_expected', type: 'uint64', internalType: 'uint64' }
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
