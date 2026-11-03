# PT-039 The shared write states and the gas step

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-6 |
| Round | 2 |
| Module (cut) | `ux/shared/writes` |
| Module (this repository) | `src/web/modules/social-recovery/shared/writes/` |
| Size | half-day |
| Risk | medium |
| Risk reason | Every owner-signed write and both recovery calls inherit these states, and a failed state that misreads a revert as a call never sent has the holder retry a call that cannot land. |
| Depends on | PT-036, PT-038 |
| Interfaces | none |
| Invariants | none |
| Design refs | D-303, D-307, D-312, D-319, D-373, D-393 |
| Readiness | free |
| Mock-first | completes against the SDK doubles alone |

## Done

Checks:

- check: build

Judgments:

- the submitting state and the failed state exist once and every write of the chapter renders them, the failed state carrying its two readings, nothing reached the chain and the account stands as it did, or the call reverted with the cause the receipt carries and its gas gone
- the gas step estimates the transaction's own gas through the extension's provider, reads the sending key's balance and, for a write the account's controlling key sends on the account's behalf, the account's balance too, passing on either (the owner's ruling of 2026-11-03), names the sending key's address, the amount and the network, says the account can pay the fee itself once it holds the amount, offers a transfer from another account this wallet holds and a deposit from outside, and says a transfer out of the account that key operates is itself an operation that key must pay for; after the sign screen read every fee option short, the check runs again on the key's balance alone, that step names the key alone, and a retry keeps the key-only reading
- the step states that the execution after the waiting period is a second funding asked for again at the fee of that day and promises nowhere that one funding covers both, and it renders no faucet link

## Body

Write `src/web/modules/social-recovery/shared/writes/`, the submitting and failed states every write of the chapter shares and the gas check with its deposit step. D-319 states the two readings of the failed state once and every write inherits both. A call the wallet never sent reads that nothing reached the chain and the account stands as it did. A call that reached the chain and reverted reads as a revert, names the cause the receipt carries and says the gas it spent is gone. D-307 adds the reverted cancel's reading, that the attempt is already gone, with the account's controller as it now stands.

The gas check runs before every call a key the wallet holds sends. It estimates that transaction's own gas through the extension's provider and reads the sending key's balance the same way, since the SDK estimates nothing, D-373; for a write the account's controlling key sends on the account's behalf (the save, an edit, a removal, a cancel) it reads the account's balance too and passes when either reaches the bar, since the wallet's sign screen offers the account's own balance as the fee route and picks it first (the owner's ruling of 2026-11-03; the recovery calls read the key alone). Where neither holds enough, the deposit step shows rather than a failed transaction, with a note that the account can pay the fee itself once it holds the amount. After the sign screen read every fee option short at its own fee and nothing was sent, the check runs again on the key's balance alone at the amount asked, that step names the key alone with no account note, Continue and the retry keep the key-only reading, and a read of that check that fails lands in the read error with retry. The step names the key as the sending key, shows its address and the estimated amount, names the network the key must be funded on, and offers both routes that fill it, a transfer from another account this wallet holds and a deposit from outside into the address it shows, with the sentence that a transfer out of the account the key operates is itself an operation that key must send and pay for, so a key at zero cannot take the first route alone. The fast track's step says that the account cannot pay for itself until it is recovered and that the execution is a second funding asked for again at execution due at the fee of that day, D-303 and D-393, and no copy promises that one funding covers both. The step offers no faucet link on a test network, D-312, and it is skipped when the key already holds enough.

## Deltas against the chapter at `bd8780f`

- None found.
