# PT-064 The approval page's signing and reply

Provisional id from the cut at `352f91a` (PR #47). The chapter copy under `../design/` is the rule where this text and the chapter differ.

## Header

| Field | Value |
| --- | --- |
| Milestone | M-9 |
| Round | 3 |
| Module (cut) | `ux/guardian-page` |
| Module (this repository) | `src/web/modules/social-recovery/guardian-page/` |
| Size | half-day |
| Risk | high |
| Risk reason | I-27, I-39 and I-40 are decided on one button, and a sign action enabled before the values, the deadline and the guardian's own call have landed is the act a phisher's page copies. |
| Depends on | PT-063 |
| Interfaces | `IMethodsOrchestrator` |
| Invariants | I-27, I-39, I-40 |
| Design refs | D-103, D-206, D-302, D-308, D-374, D-376 |
| Readiness | blocked |
| Mock-first | needs the real thing beyond the doubles |

## Done

Checks:

- check: build
- check: fuzz, budget: deep

Judgments:

- the sign action stays disabled until the account being recovered, the new key, the key being removed and the words no payment have rendered, until the request's deadline has rendered beside them, and until the guardian ticks the acknowledgment, I called the owner on a number I already had and they confirmed this, or I am the owner
- beside the acknowledgment the page says a call the guardian received does not answer it whatever the caller named themselves, the page compares the connected wallet's address with the credential the row fills and disables sign on a mismatch with the reason that the connected wallet is not the address this row names, and it carries the call instruction and the acknowledgment on every row whoever holds its key
- the guardian signs the signingInput in their own wallet, injected or over WalletConnect, or offline through the block that carries the raw payload out by QR or file and takes the signature back, the signing step and the offline block each rendering the value block and the deadline with the sentence that anyone holding the request can submit it until the deadline passes, and the block's add action gated by the same acknowledgment
- the page offers decline and asks the guardian to tell the owner anyway, tells a guardian who signed and regrets it to tell the owner and the person who asked, says a hardware wallet without a descriptor shows two hashes and the text is what to compare, and packages the material into one line through replyFrom

## Body

Write the signing half of the approval page of D-308 in `src/web/modules/social-recovery/guardian-page/`, after PT-063. Three axioms gate the sign button together. It stays disabled until the account being recovered, the new key, the key being removed and the payment, or the words no payment, have rendered, I-27, until the request's deadline has rendered beside them, I-40, and until the guardian ticks the acknowledgment, I called the owner on a number I already had and they confirmed this, or I am the owner, I-39, since a holder may be their own guardian. The guardian places the call and never the link's sender. The tick is a pause rather than an enforcement, and beside it the page says that a call the guardian received does not answer it, whatever the caller named themselves. The page compares the connected wallet's address with the credential the row fills and disables sign on a mismatch with the reason that the connected wallet is not the address this row names, asking the guardian to connect that address, since the comparison knows only that the two differ, D-374. The page carries the call instruction and the acknowledgment on every row whoever holds that row's key, since the page renders whatever its link says and a flag the sender set would remove the one pause I-39 imposes.

The guardian signs the `signingInput` in their own wallet, injected or over WalletConnect, or offline by carrying the raw payload out by QR or file, signing air-gapped and pasting the signature back, the one way a signature returns from that route. The signing step renders the value block the lead carries and the request's deadline beside it with the sentence that anyone holding the request can submit it until the deadline passes, and the offline block renders the same block, the same deadline and the same sentence, its add action disabled under the same acknowledgment as the sign action since a signature made off the page is still an approval this page hands over. A software wallet's prompt shows the account, the attempt number and the payment in the clear and the handover only as bytes, contracts D-103, so the page is the one place where the two keys read as fields, and a hardware wallet without a descriptor shows two hashes and asks for blind signing, which the page says, telling the guardian to compare the account and the key it shows with what the owner read on the call. The page offers decline and asks the guardian to tell the owner anyway, since off-chain gathering is invisible on chain, and tells a guardian who signed and regrets it to tell the owner and the person who asked. The material is packaged into the reply through `replyFrom`, one line the guardian sends back.

## Deltas against the chapter at `bd8780f`

- The proof of concept found no injected provider on an extension page; MetaMask signs through its externally connectable port, which is the injected route in practice (D-312, 2026-09-23). Typed data over that port and WalletConnect from an extension origin are untested (FR31-IMPL-CHECKS).
- No WalletConnect or `@reown` package is a dependency of the extension; ambire-common carries only `@walletconnect/client` v1 as a peer.
- MetaMask's prompt shows the raw `chrome-extension://` origin; the guardian's call stays the check (I-39).
