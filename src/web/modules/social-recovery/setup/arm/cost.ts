/**
 * The save's cost line: one transaction the account's key pays, and for an
 * account with no code yet, that the same transaction deploys it and costs
 * more gas.
 */
const COST_LINES = 'socialRecovery.costLines'

/** The key of the cost line, by whether the account has code on the chain. */
export const costLineKeyOf = (deployed: boolean): string =>
  deployed ? `${COST_LINES}.save` : `${COST_LINES}.saveDeploys`
