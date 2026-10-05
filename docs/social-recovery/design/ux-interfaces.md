# UX interfaces

This file names the interfaces the ux chapter consumes from the sdk chapter and the one surface it exposes, written for the sdk author and for a reviewer who never sat in the design conversation. Nothing here is frozen.

Every section is a proposal handed to the sdk chapter, whose author @0xAaCE owns the names and shapes. The D-7 table's "interfaces consumed" column fills from here once the sdk chapter freezes them. Ids mint from the ux chapter's D-300 band. Where a shape below disagrees with the contracts chapter, the contracts chapter wins and the section says so.

Two rules shape every section. The SDK prepares and computes while the extension signs, broadcasts, stores and renders, so no call below broadcasts anything. Every write returns a prepared transaction. The SDK holds no session state, so the setup draft, the recovery session and the backup set live in the extension. The SDK sees them only as arguments.

The sections run in the order the verticals of `ux.md` consume them.

- The client and its host adapters serve the architecture.
- Setup and management and the method lifecycle serve V1, V2 and V4.
- The secrets serve V3.
- The recovery operations serve V5, V6 and V8.
- The approval payloads serve V6 and V7.
- The exposed page serves V7.

## D-370 The recovery client and its host adapters

This section names what the extension hands the client, what it keeps outside the client, and which key sends a prepared call.

The extension creates one client from a configuration, for the one chain the wallet reads. The configuration names that chain, Ethereum mainnet or the test network the demo runs on, the address book of the deployed manager, methods and action, and two host adapters the extension provides. The first adapter is a provider for reads, an `ethers` provider whose `send` may route through a light client and its prover. The second, from the second release, is a sponsor rail that takes a prepared call and returns its inclusion or its refusal, `ux.md` D-312.

The libraries these screens use are the ones the extension already pins: `ethers` 6.13.4 for the provider, `viem` 2.33.3, the Ambire signature validator, and `react-native-qrcode-svg` for the hand-offs and the offline block. The account library the arming save deploys from is the extension's own ambire-common code. The one addition is WalletConnect on the guardian page, `@reown/appkit` 1.8.24, or `@walletconnect/universal-provider` 2.25.0 where the page draws its own connect flow, matched to what ambire-common already imports. WebAuthn is a browser API, and the zkPassport SDK and Anon Aadhaar are registered already.

The SDK stores nothing of its own and holds no signer, so the extension keeps both outside the client and hands neither over. The extension's store never holds a bare boolean or zero, since its own read returns the default for either. The store is the extension's own storage rather than a cache the SDK writes.

The signer signs typed data or raw bytes for a key the keystore holds, addressed by its address and key type. That address and key type are the keystore's own handle. The signer exposes no key export, whatever the keystore's own settings surfaces do.

Whether the extension configured a rail decides which key sends a prepared call. In the first release the extension sends every prepared call from a key the signer holds, the recoverer's own. It sends from that same key whenever it configures no rail or the rail refuses. Whether the rail is an ERC-4337 paymaster the fresh key reaches through an ERC-7702 delegation or another transport is the sdk chapter's to decide. No screen changes with it, `ux.md` D-312.

The client exposes the calls the sections below name. No call of the client takes a progress callback or an abort signal. The sdk chapter puts progress and abort on the method implementations of D-372 alone, `design/offchain/sdk.md` D-206. A long client read therefore draws a wait with no stop action, so no screen offers a cancel the client cannot honour.

## D-371 Setup and management

The extension needs the reads and the writes below for the setup screens and the management overview, and the path check the editor runs before any of them. Every write returns one or more prepared transactions the holder signs and the extension broadcasts.

- The setup read returns one of four states: not configured, sealed, shape readable with values withheld, or fully readable. Whether a setup exists it reads from the commitment in the manager's storage, which I-28 rests on. The body it reads from the setup event the manager emits, contracts D-103. It reads that event at the block the setup record's `setupCommittedAtBlock` field names, a block number every manager read returns, so a fresh device scans no log range and needs no fallback.

  The two withheld states depend on the recovery password. At the default privacy level it returns sealed until the recovery password arrives. The two withheld states render as different screens, so the caller must tell them apart. A bundle the build cannot unpack is its own error, distinct from a wrong password and from a read of that event which fails.

- The attempt read returns the running or ended attempt, or none where the account never had one. It returns the attempt's id and its status among none, pending, ready, cancelled and executed. It returns who cancelled it when cancelled, and the stopped method where a security stop authorized that cancel.

  The read returns seven more fields. It returns whether the attempt's setup ignores stops. It returns the used places the opening event publishes and the distinct methods that event publishes beside them, so the triage of `ux.md` D-307 can name the satisfied places. The stopped countdown and the cancelled terminal's reason line each name a method, and a watched address holds no path to derive one from. It returns the handover with the new key and the removed authority, the payment order, when it opened and when it can execute.

  The wallet composes that read from the three sources the sdk chapter keeps apart. The first is the attempt record `recoveryState()` returns. The second is the opening notification the event manager fetches for the payload and the places the accepted set filled. The third is the status description D-205 computes from both and no class exposes. Every screen that draws a running attempt composes it that way, so the wallet renders the three failure modes itself and never one of them as no attempt, I-28.

  Of the five statuses only ready is the wallet's own to compute. The wallet computes it from the record's `consumableAfter` against the timestamp of the block the record pins, `design/offchain/sdk.md` D-202. The opening time is the block time of the `AttemptStarted` log rather than a field, so the wallet reads that block through its own provider.

  The manager's own views answer the residue FR15-CHAIN-SOURCES. The manager's `stateOf` view and its `AttemptStarted` and `AttemptCancelled` events carry every other field under the manager's own names. The opening time is the one field no sdk member holds.

  Beside it a stop read returns three things for each method the path names. It returns whether that method is stopped, from its own `paused()`, which the review reads in every release and the recovery surfaces read from the second. It returns the parties that method declares from `trustedParties`, the key admin and the party that can stop it, with the address one acceptance away from each role. It returns that method's `Paused`, `Unpaused` and `TrustedKeysUpdated` events the overview watches, contracts D-104. The notice of D-309 for moved keys reads from the last of the three that a method now trusts a different key.

  The manager and the action carry no pause and no owner, contracts D-111, so the read asks neither for one and nothing reads `owner()`. An authorization read returns whether the account still authorizes the action, `isAuthorized`, so the readout can show a dormant setup. A key read returns whether the account holds an address the wallet holds as a key, `isAuthority`, contracts D-105. The account step of `ux.md` D-306 runs that read to tell its three readers apart. That step offers its cancel exit only to a reader who holds the account's key.

- Prepare setup takes the encrypted path from the secrets call of D-375 and the waiting period. It returns one batch for one holder confirmation, which the account signs to itself. That batch writes the kit's authorization into the account's privilege table where it is not yet written, and commits the setup at the policy manager under that action.

  The body it commits carries the waiting period, the rule and one pause choice for the whole setup. The wallet's draft sets the opt-out in the first release, so no security stop on a method reaches this holder's attempts, contracts D-111 and `ux.md` D-319. From the second release that choice is the holder's own on the review. There is one door and no variant that takes a plain path.

  The SDK re-derives the commitment it committed and reads the authorization back through the action's `isAuthorized` before the screen reports a saved setup, contracts D-108. A disagreement is its own failure after a landed transaction, so the screen never reports a dead setup as saved, D-319. The SDK checks the digest version the manager publishes through its domain when the wallet builds the client. It refuses the client before anything is prepared, so that disagreement is drawn at the account step and never after a landed save, D-319.

  Before it builds the batch the SDK checks the action fits the account through `supportsAccount`. It also asks the action whether this release recovers this account and which key a recovery would remove. The ux side asks the sdk chapter to name that read over the privilege stream of contracts D-108, since `isAuthority` answers about one key and returns false for the kit's own slot and the account's code entries, `ux.md` D-312.

  A refusal returns a code with its names and values and never a sentence. The wallet writes the string the screen renders from that code, which also keeps a third-party module's text off the screen.

  The extension estimates the save's gas and reads the paying key's balance through its own provider, since the SDK's provider reads no native balance and estimates nothing. A save the account cannot pay is the wallet's own error naming the shortfall and the address that pays.

  For an account that has never transacted the extension prepends the deployment from its own account library, `ux.md` D-312. The SDK's batch carries no deployment and its fit check refuses an address that holds no code. The ux side asks the sdk chapter, as the residue FR13-ARMING-BATCH, to run `supportsAccount` against the code the account will carry, contracts D-102. Then the fit check refuses no save on a fresh account before the batch is built. The key a recovery would remove is the derived controlling key of contracts D-105, which the same read names.

- The privilege read returns the account's other doors, the code entries and any key beside the one a recovery removes. Contracts D-108 derives that list in three steps: the privileges of the verified creation code, the privilege change events over them and a current read for each address that list ends with. The review of D-317 renders what it returns. The read reports a derivation that cannot complete as unavailable, and the review renders that as the line that the wallet cannot see every door with the save still enabled.

  I-37's gate names the declared parties, the committed action and each method's stop state and not this read, D-319. The same stream serves the read that names the key a recovery would remove, which the save does wait on. The two reads of one derivation therefore run under two failure policies, and D-319 states the reason once.

- Prepare update takes the next path and reads the current setup from the chain itself, never from a client copy. An edit during a wait cancels the running attempt.

- Prepare remove returns the batch that clears the setup and zeroes the action's authorization in the privilege table. It always pairs the two where the account can revoke the authorization, which Kohaku's account can. Either write alone leaves a dormant setup or a dead authorization.

- Prepare re-authorize is prepare setup again over the same body, `ux.md` D-312. The SDK never returns the arming write `setAddrPrivilege(KIT_SLOT, binding)` without the commit beside it, contracts D-108. It takes the encrypted path the same way prepare setup does. The dormant warning of D-309 therefore asks the holder for the recovery password where this device cannot read the path, shows the trust list first and saves the paired batch under one confirmation.

  The re-commit moves the setup nonce and retires any attempt running against the old setup, which I-42 requires. The wallet offers the action only while no attempt is open on the account, pending or ready. The wallet keeps the cancel and the repair apart, so a holder cancels first and re-authorizes after, and the refusal states that reason, `ux.md` D-312.

  Prepare clear returns `clearSetup` alone, that warning's other action, for a holder who wants the setup gone rather than revived. Prepare remove the authorization returns the reversed privilege write alone, `setAddrPrivilege(KIT_SLOT, 0)`, which the mirror warning sends where the account holds an authorization with no setup behind it. The three calls exist because each repairs a setup and an authorization already out of step, which prepare remove cannot do. I-35's pairing therefore has an interface behind it, and the overview of D-309 renders no action the SDK cannot prepare.

- Validate path checks the shape the contract never checks. It checks that the path holds at least one clause, and that every threshold sits within its members. It checks that no threshold is higher than the two hundred fifty-five its own field can count, contracts D-103. It checks that one enrolled credential appears once across the path, that the waiting period sits inside the field's width, and that a block can evaluate the rule.

  Instance uniqueness is wallet policy and the extension never relaxes it. One key at two places of a group would let one signer fill both, and the copy never claims the chain refuses a duplicate.

Beside the reads the SDK returns the metadata a wallet grades a configuration with. That metadata carries each credential's type and each method module's declaration of trusted parties as data. The SDK distinguishes an empty declaration on a kit method from the absence of one on a third-party module. It reports a read that fails as unavailable rather than as empty.

Two values the screens render stay outside that metadata. The SDK's passkey implementation answers a device kind through `deviceBinding` and names no platform. The extension therefore records whether the credential is synced or device bound from the flags the ceremony it runs itself returns at enrollment. The kind line reads what the authenticator's own flags report and never names a platform from the browser or the operating system it runs on, `ux.md` D-305 and D-372.

The SDK's provider makes no code read, so no member says whether a guardian's address is a contract or a plain key. The caveat that whoever controls a smart account can approve for it renders on every guardian row instead, `ux.md` D-311, the weaker disclosure I-37 allows. The table of the kit's audited actions and their authors is the extension's own. The SDK names the action's address and `name`. It returns no verdict on the rule's quality, `ux.md` D-312.

## D-372 The method lifecycle

Every method the kit ships answers the same four calls, and the extension chooses which JavaScript context hosts them. The four calls are enroll, test access, create claim and health check.

Enroll registers one credential for the path and returns it with its metadata. Test access runs the local check every enrollment row offers and the wallet never enforces, and doubles as the dry run when asked for a rehearsal. Enroll, test access and create claim each report progress, abort and failure, so the extension renders cancelled, refused and failed states with retry. Create claim produces the proof for one place of a request, running the prover or collecting the signature, with progress and cancellation. Health check is the unattended access test, D-309, and ships with the management surfaces that carry it.

The extension calls the authenticator itself, `navigator.credentials.create` at enrollment and `navigator.credentials.get` at a claim. It hands the result to the method, which packages it into the proof. The rule that a ceremony runs in a full tab is therefore the extension's own to keep, `ux.md` D-392.

A claim that fails comes back as one of the method's typed causes. An enrollment that fails inside the method comes back as its enrollment failure, a bad key or a mismatched relying-party hash. A ceremony the holder dismisses or the browser refuses returns before the method runs, so the extension reads that one case from the browser's own error.

- The passkey method creates the credential and reports its device kind, signs a test challenge, and signs the place's digest as a WebAuthn assertion the on-chain verifier reads. The extension reads the synced or device-bound fact from the ceremony itself, since the method answers the kind alone. The relying party is the extension's own origin, a dependency D-314 records. The passkey method's config commits the hash of the full origin string the extension serves, `chrome-extension://` followed by its id, beside the credential's public key, `ux.md` D-310. The wallet hands the SDK that origin string as the relying party id.
- The wallet method validates an address, resolves a name, and warns where the address shares a seed the wallet holds. It detects no contract, since the SDK's provider makes no code read. Its access test, a test challenge the key signs, runs at setup for any guardian row and as the health check for any guardian later. Its claim is the typed data of D-374, signed in the guardian's own wallet.
- The Aadhaar method decodes an uploaded QR image and tests it against the pinned authority key the deployed method holds, never the authority's current key. It produces the full proof with progress. Every test reports one of four verdicts: passed, failed with its cause, unavailable where a node or a service did not answer, and not supported where the method cannot serve the document. The screens of D-305 render four states and never fold a failure into a skip.
- The zkPassport method follows the same lifecycle with the inputs and proof budget its research settles, and it needs no secret of the wallet's, per the verified claim of D-375. The ux side asks the sdk chapter to pin and record the four facts the passport identifier of D-375 depends on: the verifier's domain, the scope string with any policy version it locks to, the non-salted identifier type and the SDK version. A change to any one turns a committed value into one the same passport no longer reproduces.

## D-375 Secrets and the privacy levels

The setup screen offers three privacy levels and the SDK encodes them over the two metadata fields of the setup event.

- Private, the default, puts the shape and the values encrypted into the private field and nothing readable into the public one.
- Shape visible puts the shape in the clear into the public field and the values encrypted into the private one.
- Public puts everything in the clear and sets no recovery password.

The contract defines no levels and reads neither field, so the encoding is the SDK's and the extension's alone. Whether the sdk chapter adopts the middle level is a question that chapter answers.

Encrypt config values takes the path, the password or none at Public, and the level, and returns the one object prepare setup accepts. The SDK pads the private field it returns to a fixed size, contracts D-107. The field's length therefore does not sort accounts by how many members and methods the rule holds, which is what the Private level's line on the privacy step of `ux.md` D-318 claims.

The sdk chapter answers the residue FR21-PADDING with a padding to a fixed size. It leaves open whether that size is one for every backup or one of a small set of buckets, waiting on measured costs per method. The ux chapter needs the one-size branch, since a bucket tells a reader roughly how wide the rule is. D-318's Private line stays true under either branch until the sdk chapter picks.

Decrypt config values reverses it and fails on a wrong password. At the two hidden levels a failed decrypt blocks the recovery rather than degrading it.

The extension derives no salt and the SDK derives every one. This release supplies none of its own. Each place's salt is the default `keccak256(account, place)` the sdk chapter calls public by design. The wallet does hold salts, since each place's salt sits inside the gathering record the extension stores and one place's salt travels on that place's request to its approver. A later release that adds a salt the holder supplies therefore inherits no sentence that says otherwise.

These screens do not offer the advanced path of the idea draft's D-5, a salt per credential the holder supplies and the SDK takes as given, `ux.md` D-312. The only passwords the wallet handles are the extension password and the recovery password.

The one fact the wallet needs from zkPassport is that the method stores no wallet secret, verified against the sources on 2026-09-04 and carried in the paragraph after this one. The derivation itself and the four facts it depends on are the sdk chapter's to pin, as D-372 asks.

Pack and unpack backup set turn what a fresh device needs beyond the setup event into one bundle under the recovery password and back. The bundle holds the configuration values the wallet holds for its own methods. Both are pure. The extension collects, stores and re-imports the bundle, and the setup event's private field is its carrier, per D-310.

A zkPassport identity method stores no wallet secret: the identifier is Poseidon2 over the passport's own DG1, eContent and SOD signature, hashed again with the SHA256 hashes of the verifier's domain and the kit's scope string, so the same document reproduces it on any device. It holds only while the kit keeps that domain, that scope and the non-salted identifier type at a pinned SDK version. [verified V-2 on 2026-09-04]

## D-373 Recovery operations

The recovery flow needs computation over the claims the extension stores, four chain reads and three prepared transactions.

Evaluate progress takes the path, the stored claims, the current time, the attempt id the session predicted, the setup nonce the request was built against and the account's current setup nonce. From the second release it also takes every named method's stop state. It returns each required row's state, each group's count against its threshold, the claims that no longer count and the request's death where one occurred.

The wallet makes every fresh read in that list itself through its own provider: the account's attempt, its setup nonce and, from the second release, each named method's `paused()`. The SDK's arithmetic reads no chain and judges the record it was handed. The three deaths are therefore the wallet's own reads: the passed deadline against the time the wallet reads, another attempt against the id the session predicted, and a setup write against the nonce the request was built under.

From the second release the wallet reads a method stopped after the gathering opened the same way. The stop state the gathering copied at its start goes stale for the whole deadline otherwise, so that release's checklist of `ux.md` D-392 polls each named method's stop state rather than the record's copy of it. A claim stamped with a different attempt id is void, since another attempt opened in between and the whole gathering died with it. A claim built under an earlier setup nonce is void the same way, since a setup write cancels every approval given under the old setup.

Verify approvals is a call the wallet makes per pasted reply, running the claim through the method's own verify view, the static call the manager runs at submission. The checklist's complete therefore means verified before any gas is spent. The sdk chapter dispatches no verify today, and the ux side asks it for that member, FR23-SDK-VERIFY.

The request carries one validity window every claim signs, so a claim never expires on its own and the session expires as a whole. One window for the whole request is a change from the imported design, which gave each claim its own countdown.

The wallet runs the action's fit check itself, calling the recovery action's `supportsAccount` through its own provider at the account step. It runs the check against the account the recoverer named and before any approval is gathered. The SDK's recovery client runs that check inside no operation of its own. The wallet writes the refusal and its reason itself where the check answers false. That refusal is the state the readout of D-306 renders, this release cannot recover this account yet.

The check runs here because it is the only thing that keeps the kit out of an address delegating to this implementation under EIP-7702, contracts D-105 and `ux.md` D-306. Running it at the account step costs one chain read before the gathering and saves a recoverer the whole set, the whole wait and two transactions.

Prepare initiate takes the account, the request with its predicted attempt id, the handover naming the new key and the removed authority, the payment order the helpers approved, and the claims. It returns the `startAttempt` call. The recoverer's own key sends that call in the first release, the sponsor rail sends it by default from the second, and any funded key can send it instead.

It carries the smallest set of claims that satisfies the rule rather than every claim it was handed. The first release leaves out nothing for a stop, since the body it commits ignores stops. From the second release it leaves out the proofs of every method whose stop is on when the request is built, contracts D-103, on a setup that keeps stops in force; on a setup that ignores stops it leaves nothing out. Among the equally small sets that remain it prefers the one naming the fewest methods that carry a stop. It reports the claims it left out, so the checklist marks those rows not needed.

A payment quote, second release, returns from the sponsor rail the order a request should carry: the token, an amount priced for the wait and the payee. It returns the words no payment for a request the recoverer sends themselves, which is every request of the first release. It runs before the helpers sign, since the order is inside the digest.

Before helpers sign, the extension derives the new authority at the account's index plus the extension's offset, contracts D-105. It certifies that key and hands the request builder the candidate with its public key and that certification. The SDK holds no seed and cannot tell a key derived at the offset from one derived elsewhere. The wallet checks that the candidate is a key its own keystore holds, that it is not already a key of the account and that the two differ, I-43 and D-370.

The request builder then decides whether this release recovers the account and names the removed authority through the read D-371 asks for. It checks that the new key holds no privilege at all through the recovery action's own `holdsAnyPrivilege`, the refusal the action itself enforces, contracts D-105 and D-108. That refusal is broader than what `isAuthority` reports, contracts D-102.

The request builder returns a refusal where the account is not one this release recovers, and a separate refusal where a check on the new key fails, so the screen renders each where it belongs, `ux.md` D-306. That refusal is a code with its names and values and never a sentence. The wallet writes the string the screen renders, counts nothing itself and renders no text the SDK supplied.

The release that carries an order renders a warning about the payment order's payee rather than a refusal, contracts D-110. This release names no order at all. The residue FR13-OPEN-PAYEE is answered for what an open payee is, an order naming none, where `executeHandover` encodes its own caller as the payee. It stays open for whether the SDK can refuse a payee that cannot receive. The start call never runs as an operation of the recovered account, since proof verification cannot run in the account's validation phase.

Prepare execute returns the recovery action's `executeHandover` call. The recoverer's own key sends it from the execute now action in the first release, the sponsor sends it by default from the second, and any funded key can send it. The payment order inside its batch pays the approved payee back from the account. A revert because the account cannot cover the order is reported with the amount.

The request's validity window is the wallet's own default of 24 hours, counted from the moment the request is created, and no screen asks the recoverer for it. The wallet sets the width entry of the client configuration to that same value, so the SDK's window check never fires under it, sdk D-205. The wallet shows the window at the first row.

The extension estimates the gas of each deposit step itself and reads the sending key's balance through its own provider, one estimate for the submission and one for the execution. The SDK's provider answers four reads, and neither a native balance nor an estimate is among them. The execution is a second funding the wallet asks for again at execution due at the fee of that day. No screen promises that one funding covers both, D-303.

Prepare cancel returns the holder's `cancelByOwner` call, an operation of the account itself, whose gas the account's own key pays in the first release. In that release the extension sends every call from a key the signer holds.

The cancel by proofs, a set signed under the cancel purpose, uses the same claim machinery and ships in a later milestone. Whoever submits it pays for it. From the second release a cancel a security stop authorized needs no preparation at all, contracts D-103 and D-111. That release's wallet reads that cancel back from the attempt and renders its reason line.

The extension owns watching. It polls the attempt read or the manager's events on a timer, and the authorization read of D-371 for every account with a setup so that the banner takes the dormant reading of `ux.md` D-319, on the one deployment its address book names, for every account it holds and, from the second release, every address the holder asked it to watch. It drives the banner, the notification and the badge. It reports a failed poll as such and never as no attempt.

During a wait the recoverer's countdown polls three reads besides. It polls the account's authorization of the action through `isAuthorized` and the action's fit through `supportsAccount`. It polls the handover against the account, whose removed authority still holds a key value through `isAuthority` and whose new key still holds nothing through the recovery action's own `holdsAnyPrivilege`, contracts D-108. The first two are the reads the gathering checklist already polls, so the countdown reads each of the three causes the fifth ending of D-393 draws during the wait, and no holder spends gas to learn of them.

The extension reads the payee once, when the request is built, and never polls it during the wait, since neither code at an address nor a call that returns tells a refusing payee from a paying one, contracts D-110. The first release names no payment order at all.

## D-374 Guardian approval payloads

The SDK builds what a guardian signs and parses what comes back, and the extension never assembles a digest itself. This section names the request, the payload, the reply and the typed data under all three.

The recoverer's own recovery client builds one request per place through `getApproverRequests`, each carrying that place's method, config and salt and no other place's. The recoverer sends that request to the approver as the page's link. The page turns the request it holds into what it renders and into what the connected wallet signs, through the methods orchestrator's `describeRequest` and `signingInput`. Neither call holds a provider and neither reads a chain.

Together they give the approval page's payload. The payload names the account, the new key, the key being removed, the payment order with its amount and its payee or the words no payment, the deadline, the setup number and the attempt number. It carries the publication line and the instruction to compare the account and the new key with what the owner read on the call. Every row carries that instruction, I-39 and `ux.md` D-308.

The payload carries the typed data inside it for the wallet the page connects, and that typed data alone as JSON and as a QR or file for the page's offline block. The guardian row carries the page's link, and D-392's field list is the one the page shows.

The payload carries the hash of the setup body and never the body, so nothing of the rule travels with the link. The page derives the digest from the values it renders and that hash, contracts D-103 making `setupBodyHash` the digest's one pre-hashed member. The ux owner ruled on 2026-09-17 that the link carries the hash, against a link that would show every guardian the whole path before any recovery published it.

The page packages the guardian's material into the reply through the orchestrator's `replyFrom`. The recoverer's own client files that reply through `addApproverReply`, which produces the claim and throws one of three errors: malformed, unmatched or expired. It tries the two verification paths in turn for every credential, the signer `ecrecover` returns first and the credential's own `isValidSignature`, a chain read, after. It never branches on a detection of code at the address, and takes the order the wallet method itself takes, contracts D-104. An ordinary key that began delegating and a smart account that has not yet transacted are therefore both read the way the chain would read them.

It throws unmatched where neither path answers for that credential. A wrong recovery is no error of its own, since the returned artifact is a bare signature carrying no field of the request it signed. A signature over another request's digest recovers some other address and returns unmatched like any other, D-308.

The extension adds a fourth error on its own, already in the list. It adds no warning for an address that holds no code, since the check tries both paths for that address anyway and no chain read tells an undeployed smart account from a wrong signer. Every approval counts or fails on paste, contracts D-104.

The typed data is the policy manager's EIP-712 digest of the contracts chapter, one per place. It carries the account, the attempt and the payment order in the clear and the handover payload as bytes. The SDK derives it locally, and the page holds the body's hash alone, so the cross-check against `hashApproval` cannot run from the link in the shape contracts D-103 declares.

The sdk chapter answers the residue FR19-LINK-HASH and it closes here. The manager's `hashApproval` and `hashCancel` are cross-checks a caller with chain access compares its own derivation against, and never the source a proof is gathered from. The page therefore runs no cross-check at all. Where the page can read the chain it reads the manager's `eip712Domain()` instead, and it refuses a request whose domain disagrees with the one the typed data carries. That domain check is the one check the page can make from the link it holds.

The SDK also decodes the payload in the committed action's layout, for the approval page and for any other surface that renders the new key and the key being removed as fields. The watcher's banner of `ux.md` D-307 is one of those surfaces. A hardware wallet without a descriptor for this domain shows two hashes, so such a guardian compares the text instead. The ux side asks the sdk chapter what descriptor the deployment can register.

## D-376 What the UX exposes

The one surface the ux side exposes is the guardian approval page, and the one role it keeps is the watcher.

The extension serves the guardian approval page from the first release, at a relative path opened in a browser that has the extension, and never from a hosted domain. The guardian row of D-392 carries its link.

The page consumes the methods orchestrator's three calls: `describeRequest`, `signingInput` and `replyFrom`. It makes three chain reads through the provider: the attempt's state, the setup number and whether the account still authorizes the action. Those reads let it render the three deaths and the dormant reading `ux.md` D-319 gives every screen that would draw a dormant setup and a running attempt together. It reads no `paused()`, since the method a guardian row fills carries no pause.

The page renders what its link says, so it is never a trust anchor: the guardian's own wallet prompt and a call to the owner are. 

The extension also owns the whole watcher role, polling the manager's events and turning them into the banner, the system notification and the badge, since the kit ships no watcher service. The sdk chapter answers the residue FR11-POLL-PERIOD by assignment rather than by a number. The sdk chapter fixes no schedule and puts the whole of it on the integrator, so the wallet's own alarm of one minute stands, `ux.md` D-307 and I-29.
