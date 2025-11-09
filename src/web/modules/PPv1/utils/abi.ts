import { Abi } from 'viem'

export const assetConfig = [
  {
    type: 'function',
    name: 'assetConfig',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      }
    ],
    outputs: [
      {
        name: '_pool',
        type: 'address',
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_minimumDepositAmount',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: '_vettingFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  }
] as const

export const privacyPoolAbi = [
  {
    type: 'function',
    name: 'ASSET',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'ENTRYPOINT',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IEntrypoint'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'MAX_TREE_DEPTH',
    inputs: [],
    outputs: [{ name: '', type: 'uint32', internalType: 'uint32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'RAGEQUIT_VERIFIER',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IVerifier' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'ROOT_HISTORY_SIZE',
    inputs: [],
    outputs: [{ name: '', type: 'uint32', internalType: 'uint32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'SCOPE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'WITHDRAWAL_VERIFIER',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IVerifier' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'currentRoot',
    inputs: [],
    outputs: [{ name: '_root', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'currentRootIndex',
    inputs: [],
    outputs: [{ name: '', type: 'uint32', internalType: 'uint32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'currentTreeDepth',
    inputs: [],
    outputs: [{ name: '_depth', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'currentTreeSize',
    inputs: [],
    outputs: [{ name: '_size', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'dead',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: '_depositor', type: 'address', internalType: 'address' },
      { name: '_value', type: 'uint256', internalType: 'uint256' },
      {
        name: '_precommitmentHash',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [{ name: '_commitment', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'depositors',
    inputs: [{ name: '_label', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '_depositooor', type: 'address', internalType: 'address' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'nullifierHashes',
    inputs: [
      {
        name: '_nullifierHash',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [{ name: '_spent', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'ragequit',
    inputs: [
      {
        name: '_proof',
        type: 'tuple',
        internalType: 'struct ProofLib.RagequitProof',
        components: [
          {
            name: 'pA',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pB',
            type: 'uint256[2][2]',
            internalType: 'uint256[2][2]'
          },
          {
            name: 'pC',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pubSignals',
            type: 'uint256[4]',
            internalType: 'uint256[4]'
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'roots',
    inputs: [{ name: '_index', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '_root', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'windDown',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      {
        name: '_withdrawal',
        type: 'tuple',
        internalType: 'struct IPrivacyPool.Withdrawal',
        components: [
          {
            name: 'processooor',
            type: 'address',
            internalType: 'address'
          },
          { name: 'data', type: 'bytes', internalType: 'bytes' }
        ]
      },
      {
        name: '_proof',
        type: 'tuple',
        internalType: 'struct ProofLib.WithdrawProof',
        components: [
          {
            name: 'pA',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pB',
            type: 'uint256[2][2]',
            internalType: 'uint256[2][2]'
          },
          {
            name: 'pC',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pubSignals',
            type: 'uint256[8]',
            internalType: 'uint256[8]'
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      {
        name: '_depositor',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_commitment',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_label',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_merkleRoot',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'LeafInserted',
    inputs: [
      {
        name: '_index',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_leaf',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_root',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  { type: 'event', name: 'PoolDied', inputs: [], anonymous: false },
  {
    type: 'event',
    name: 'Ragequit',
    inputs: [
      {
        name: '_ragequitter',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_commitment',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_label',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      {
        name: '_processooor',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_spentNullifier',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_newCommitment',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  { type: 'error', name: 'ContextMismatch', inputs: [] },
  { type: 'error', name: 'IncorrectASPRoot', inputs: [] },
  { type: 'error', name: 'InvalidCommitment', inputs: [] },
  { type: 'error', name: 'InvalidProcessooor', inputs: [] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'InvalidTreeDepth', inputs: [] },
  { type: 'error', name: 'LeafAlreadyExists', inputs: [] },
  { type: 'error', name: 'LeafCannotBeZero', inputs: [] },
  {
    type: 'error',
    name: 'LeafGreaterThanSnarkScalarField',
    inputs: []
  },
  { type: 'error', name: 'MaxTreeDepthReached', inputs: [] },
  { type: 'error', name: 'NotYetRagequitteable', inputs: [] },
  { type: 'error', name: 'NullifierAlreadySpent', inputs: [] },
  { type: 'error', name: 'OnlyEntrypoint', inputs: [] },
  { type: 'error', name: 'OnlyOriginalDepositor', inputs: [] },
  { type: 'error', name: 'PoolIsDead', inputs: [] },
  { type: 'error', name: 'ScopeMismatch', inputs: [] },
  { type: 'error', name: 'UnknownStateRoot', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] }
] as const

export const entrypointAbiBatch = [
  {
    inputs: [{ internalType: 'uint256', name: '_maxRelayFeeBPS', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  { inputs: [], name: 'EmptyProofs', type: 'error' },
  { inputs: [], name: 'InvalidBatchSize', type: 'error' },
  { inputs: [], name: 'InvalidRelayFeeBPS', type: 'error' },
  { inputs: [], name: 'InvalidTotalValue', type: 'error' },
  { inputs: [], name: 'NativeAssetTransferFailed', type: 'error' },
  { inputs: [], name: 'ReentrancyGuardReentrantCall', type: 'error' },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'SafeERC20FailedOperation',
    type: 'error'
  },
  { inputs: [], name: 'ZeroAddress', type: 'error' },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'contract IPrivacyPool', name: '_pool', type: 'address' },
      { indexed: true, internalType: 'address', name: '_recipient', type: 'address' },
      { indexed: true, internalType: 'address', name: '_feeRecipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: '_amountAfterFees', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: '_fee', type: 'uint256' }
    ],
    name: 'BatchRelayed',
    type: 'event'
  },
  {
    inputs: [],
    name: 'MAX_RELAY_FEE_BPS',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'contract IPrivacyPool', name: '_pool', type: 'address' },
      {
        components: [
          { internalType: 'address', name: 'processooor', type: 'address' },
          { internalType: 'bytes', name: 'data', type: 'bytes' }
        ],
        internalType: 'struct IPrivacyPool.Withdrawal',
        name: '_withdrawal',
        type: 'tuple'
      },
      {
        components: [
          { internalType: 'uint256[2]', name: 'pA', type: 'uint256[2]' },
          { internalType: 'uint256[2][2]', name: 'pB', type: 'uint256[2][2]' },
          { internalType: 'uint256[2]', name: 'pC', type: 'uint256[2]' },
          { internalType: 'uint256[8]', name: 'pubSignals', type: 'uint256[8]' }
        ],
        internalType: 'struct ProofLib.WithdrawProof[]',
        name: '_proofs',
        type: 'tuple[]'
      }
    ],
    name: 'batchRelay',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  { stateMutability: 'payable', type: 'receive' }
]

export const entrypointAbi = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    name: 'DEFAULT_ADMIN_ROLE',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'UPGRADE_INTERFACE_VERSION',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'assetConfig',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      }
    ],
    outputs: [
      {
        name: 'pool',
        type: 'address',
        internalType: 'contract IPrivacyPool'
      },
      {
        name: 'minimumDepositAmount',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'vettingFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'maxRelayFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'associationSets',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'root', type: 'uint256', internalType: 'uint256' },
      { name: 'ipfsCID', type: 'string', internalType: 'string' },
      { name: 'timestamp', type: 'uint256', internalType: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      },
      { name: '_value', type: 'uint256', internalType: 'uint256' },
      {
        name: '_precommitment',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [{ name: '_commitment', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      {
        name: '_precommitment',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [{ name: '_commitment', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'getRoleAdmin',
    inputs: [{ name: 'role', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'grantRole',
    inputs: [
      { name: 'role', type: 'bytes32', internalType: 'bytes32' },
      { name: 'account', type: 'address', internalType: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'hasRole',
    inputs: [
      { name: 'role', type: 'bytes32', internalType: 'bytes32' },
      { name: 'account', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'initialize',
    inputs: [
      { name: '_owner', type: 'address', internalType: 'address' },
      { name: '_postman', type: 'address', internalType: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'latestRoot',
    inputs: [],
    outputs: [{ name: '_root', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'proxiableUUID',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'registerPool',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      },
      {
        name: '_pool',
        type: 'address',
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_minimumDepositAmount',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: '_vettingFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: '_maxRelayFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'relay',
    inputs: [
      {
        name: '_withdrawal',
        type: 'tuple',
        internalType: 'struct IPrivacyPool.Withdrawal',
        components: [
          {
            name: 'processooor',
            type: 'address',
            internalType: 'address'
          },
          { name: 'data', type: 'bytes', internalType: 'bytes' }
        ]
      },
      {
        name: '_proof',
        type: 'tuple',
        internalType: 'struct ProofLib.WithdrawProof',
        components: [
          {
            name: 'pA',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pB',
            type: 'uint256[2][2]',
            internalType: 'uint256[2][2]'
          },
          {
            name: 'pC',
            type: 'uint256[2]',
            internalType: 'uint256[2]'
          },
          {
            name: 'pubSignals',
            type: 'uint256[8]',
            internalType: 'uint256[8]'
          }
        ]
      },
      { name: '_scope', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'removePool',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'renounceRole',
    inputs: [
      { name: 'role', type: 'bytes32', internalType: 'bytes32' },
      {
        name: 'callerConfirmation',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'revokeRole',
    inputs: [
      { name: 'role', type: 'bytes32', internalType: 'bytes32' },
      { name: 'account', type: 'address', internalType: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'rootByIndex',
    inputs: [{ name: '_index', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '_root', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'scopeToPool',
    inputs: [{ name: '_scope', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '_pool',
        type: 'address',
        internalType: 'contract IPrivacyPool'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'supportsInterface',
    inputs: [{ name: 'interfaceId', type: 'bytes4', internalType: 'bytes4' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'updatePoolConfiguration',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      },
      {
        name: '_minimumDepositAmount',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: '_vettingFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: '_maxRelayFeeBPS',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'updateRoot',
    inputs: [
      { name: '_root', type: 'uint256', internalType: 'uint256' },
      { name: '_ipfsCID', type: 'string', internalType: 'string' }
    ],
    outputs: [{ name: '_index', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      {
        name: 'newImplementation',
        type: 'address',
        internalType: 'address'
      },
      { name: 'data', type: 'bytes', internalType: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'usedPrecommitments',
    inputs: [
      {
        name: '_precommitment',
        type: 'uint256',
        internalType: 'uint256'
      }
    ],
    outputs: [{ name: '_used', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'windDownPool',
    inputs: [
      {
        name: '_pool',
        type: 'address',
        internalType: 'contract IPrivacyPool'
      }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdrawFees',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        internalType: 'contract IERC20'
      },
      { name: '_recipient', type: 'address', internalType: 'address' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      {
        name: '_depositor',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_pool',
        type: 'address',
        indexed: true,
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_commitment',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'FeesWithdrawn',
    inputs: [
      {
        name: '_asset',
        type: 'address',
        indexed: false,
        internalType: 'contract IERC20'
      },
      {
        name: '_recipient',
        type: 'address',
        indexed: false,
        internalType: 'address'
      },
      {
        name: '_amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'Initialized',
    inputs: [
      {
        name: 'version',
        type: 'uint64',
        indexed: false,
        internalType: 'uint64'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PoolConfigurationUpdated',
    inputs: [
      {
        name: '_pool',
        type: 'address',
        indexed: false,
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_asset',
        type: 'address',
        indexed: false,
        internalType: 'contract IERC20'
      },
      {
        name: '_newMinimumDepositAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_newVettingFeeBPS',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_newMaxRelayFeeBPS',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PoolRegistered',
    inputs: [
      {
        name: '_pool',
        type: 'address',
        indexed: false,
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_asset',
        type: 'address',
        indexed: false,
        internalType: 'contract IERC20'
      },
      {
        name: '_scope',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PoolRemoved',
    inputs: [
      {
        name: '_pool',
        type: 'address',
        indexed: false,
        internalType: 'contract IPrivacyPool'
      },
      {
        name: '_asset',
        type: 'address',
        indexed: false,
        internalType: 'contract IERC20'
      },
      {
        name: '_scope',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PoolWindDown',
    inputs: [
      {
        name: '_pool',
        type: 'address',
        indexed: false,
        internalType: 'contract IPrivacyPool'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'RoleAdminChanged',
    inputs: [
      {
        name: 'role',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'previousAdminRole',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'newAdminRole',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'RoleGranted',
    inputs: [
      {
        name: 'role',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'sender',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'RoleRevoked',
    inputs: [
      {
        name: 'role',
        type: 'bytes32',
        indexed: true,
        internalType: 'bytes32'
      },
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'sender',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'RootUpdated',
    inputs: [
      {
        name: '_root',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_ipfsCID',
        type: 'string',
        indexed: false,
        internalType: 'string'
      },
      {
        name: '_timestamp',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'Upgraded',
    inputs: [
      {
        name: 'implementation',
        type: 'address',
        indexed: true,
        internalType: 'address'
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'WithdrawalRelayed',
    inputs: [
      {
        name: '_relayer',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_recipient',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: '_asset',
        type: 'address',
        indexed: true,
        internalType: 'contract IERC20'
      },
      {
        name: '_amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      },
      {
        name: '_feeAmount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256'
      }
    ],
    anonymous: false
  },
  { type: 'error', name: 'AccessControlBadConfirmation', inputs: [] },
  {
    type: 'error',
    name: 'AccessControlUnauthorizedAccount',
    inputs: [
      { name: 'account', type: 'address', internalType: 'address' },
      { name: 'neededRole', type: 'bytes32', internalType: 'bytes32' }
    ]
  },
  {
    type: 'error',
    name: 'AddressEmptyCode',
    inputs: [{ name: 'target', type: 'address', internalType: 'address' }]
  },
  { type: 'error', name: 'AssetMismatch', inputs: [] },
  { type: 'error', name: 'AssetPoolAlreadyRegistered', inputs: [] },
  {
    type: 'error',
    name: 'ERC1967InvalidImplementation',
    inputs: [
      {
        name: 'implementation',
        type: 'address',
        internalType: 'address'
      }
    ]
  },
  { type: 'error', name: 'ERC1967NonPayable', inputs: [] },
  { type: 'error', name: 'EmptyRoot', inputs: [] },
  { type: 'error', name: 'FailedCall', inputs: [] },
  { type: 'error', name: 'InvalidEntrypointForPool', inputs: [] },
  { type: 'error', name: 'InvalidFeeBPS', inputs: [] },
  { type: 'error', name: 'InvalidIPFSCIDLength', inputs: [] },
  { type: 'error', name: 'InvalidIndex', inputs: [] },
  { type: 'error', name: 'InvalidInitialization', inputs: [] },
  { type: 'error', name: 'InvalidPoolState', inputs: [] },
  { type: 'error', name: 'InvalidProcessooor', inputs: [] },
  { type: 'error', name: 'InvalidWithdrawalAmount', inputs: [] },
  { type: 'error', name: 'MinimumDepositAmount', inputs: [] },
  { type: 'error', name: 'NativeAssetNotAccepted', inputs: [] },
  { type: 'error', name: 'NativeAssetTransferFailed', inputs: [] },
  { type: 'error', name: 'NoRootsAvailable', inputs: [] },
  { type: 'error', name: 'NotInitializing', inputs: [] },
  { type: 'error', name: 'PoolIsDead', inputs: [] },
  { type: 'error', name: 'PoolNotFound', inputs: [] },
  { type: 'error', name: 'PrecommitmentAlreadyUsed', inputs: [] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'RelayFeeGreaterThanMax', inputs: [] },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [{ name: 'token', type: 'address', internalType: 'address' }]
  },
  { type: 'error', name: 'ScopePoolAlreadyRegistered', inputs: [] },
  { type: 'error', name: 'UUPSUnauthorizedCallContext', inputs: [] },
  {
    type: 'error',
    name: 'UUPSUnsupportedProxiableUUID',
    inputs: [{ name: 'slot', type: 'bytes32', internalType: 'bytes32' }]
  },
  { type: 'error', name: 'ZeroAddress', inputs: [] }
] as const

export const depositEventAbi =
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)'

export const withdrawEventAbi =
  'event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)'

export const ragequitEventAbi =
  'event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)'

export const scope = [
  {
    type: 'function',
    name: 'SCOPE',
    inputs: [],
    outputs: [{ name: '_scope', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  }
] as Abi

export const leafInserted = {
  type: 'event',
  name: 'LeafInserted',
  inputs: [
    {
      name: '_index',
      type: 'uint256',
      indexed: false,
      internalType: 'uint256'
    },
    {
      name: '_leaf',
      type: 'uint256',
      indexed: false,
      internalType: 'uint256'
    },
    {
      name: '_root',
      type: 'uint256',
      indexed: false,
      internalType: 'uint256'
    }
  ],
  anonymous: false
}
