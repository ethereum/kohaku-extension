/** The one view a module that can be stopped answers: whether it is stopped. */
export const PAUSABLE_ABI = [
  {
    type: 'function',
    name: 'paused',
    inputs: [],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view'
  }
] as const
