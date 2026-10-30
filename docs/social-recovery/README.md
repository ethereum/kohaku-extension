# Social recovery

The design and the task split of the social recovery feature of the Kohaku extension, copied into this repository so the people and the agents that implement it read the text beside the code.

## Where the text comes from

The design was written in `defi-wonderland/mast-social-recovery-2`. That repository stays the design tool. The implementation runs on the Wonderland fork `defi-wonderland/kohaku-extension`, on the branch `dev/wonderland`, one pull request per task. At the end `dev/wonderland` goes upstream to `ethereum/kohaku-extension` as one pull request. Changes to the account library go the same way through `defi-wonderland/kohaku-commons`.

The fork's branch `wonderland/recovery-v0` (June 2026) holds an earlier recovery prototype, an in-extension activate and recover GUI with account-library changes for a recovery controller. It is evidence for the proof of concept D-316 schedules and for the create door, the arming save and the signing repair. It is not a base for this work.

Every file under `design/` is a verbatim copy from branch `dev` of the design repository at commit `bd8780f7ad59a451035b15920c00015a2eee6e9b` (2026-09-24), with two exceptions. `design/ux.md` carries one extra paragraph in D-316, the proof-of-concept paragraph of pull request #54 of that repository, which was open at the time of the copy. `design/live-frame-strings.md` is that repository's `design-context/spec-v1/ux/research/live-frame-strings-2026-09-22-r30.md`, renamed. The design is frozen at that commit. A correction to the design is a change in that repository first and a fresh copy here second, so this folder never drifts silently.

Every file under `tasks/` comes from `design-context/spec-v1/cut-provisional.yaml` at commit `352f91a` (pull request #47 of that repository). The ids `PT-035` to `PT-070` and `PT-075` are provisional. The cut was never materialized, so a task is named by its id and its title together.

Only the files the implementation reads are here. The personas, the requirements, the stories, the scenarios, the PRD and the research notes stay in the design repository; the ux owner replays the persona journeys by hand once per milestone from there.

## How to read it

1. `design/ux.md` is the ux chapter, sections D-300 to D-399. D-312 is the decision record with dated entries. Where any other text and the chapter differ, the chapter is the rule.
2. `design/ux-interfaces.md` (D-370 to D-376) names what the extension consumes from the SDK. `design/sdk.md` (D-200s) is the SDK design those interfaces rest on; its D-201 declares the twelve SDK interfaces the doubles imitate. `design/contracts.md` (D-100s) is the contract design the tasks cite as D-102 to D-111.
3. `design/invariants.yaml` holds the ux invariants I-23 to I-48 the tasks list, and `design/open-questions.yaml` the questions that still gate a task (Q-13 for the watcher, Q-22 for the identity methods).
4. `design/ux-copy.md` is the copy rulebook every shipped string follows.
5. `design/frame-register.md` lists every wireframe with its code and band, and `design/live-frame-strings.md` holds every string of every frame, which is where a screen's copy comes from. The wireframe file itself is not copied. Where a frame and a chapter sentence differ, the chapter is the rule.
6. `tasks/README.md` lists the 37 tasks by start round and the open questions with their owners. Each task file holds the header, the done entries and the body verbatim, with `src/ux/...` rewritten to `src/web/modules/social-recovery/...`, and ends with the deltas found against the chapter at the commit above.

## Rules the implementation keeps

- The extension consumes the SDK as the package `@kohaku-eth/social-recovery`, its runtime through the extension's own client layer, and keeps a fake node in that layer for a chain with no deployment and for the unit tests.
- The committed deployment table (`shared/client/deployments.ts`) names the published Sepolia deployment for Sepolia and the stand-in over the fake node for mainnet. The build-time variable `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` overrides the Sepolia row; a malformed value stops the build's first recovery read and never falls back.
- Until the package is published, the build needs it from a local checkout of `defi-wonderland/kohaku` on its branch `wonderland/dev` (at 616efa1): `pnpm install --filter @kohaku-eth/social-recovery...` and `pnpm --filter @kohaku-eth/social-recovery build` in that checkout, then `pnpm pack` in `packages/social-recovery` and the tarball's contents extracted into this repository's `node_modules/@kohaku-eth/social-recovery` (a packed copy, not a symlink: Jest's transform and Babel resolve a symlink to its real path). `package.json` names the placeholder version 0.0.1 until the alpha is on npm. When it is, swap the version in `package.json` and `yarn.lock` and remove this note.
- Records live in the extension's local storage and never in a background controller (D-310).
- Ceremonies that die on focus loss run in a full tab, never in the action popup (D-316).
- Every holder-facing build carries one manifest public key (D-312, 2026-09-23), since the passkey relying party is the extension's own origin.
- Every shipped string follows `design/ux-copy.md`.

## Manual test on Sepolia

A tester with this repository, a Mac, a phone and some Sepolia ETH can run the two identity walks against the real contracts. Use throwaway wallets only. Never put a seed phrase, a private key, a password or an RPC key in this repository, in a pull request or in a report.

### 1. The build

1. Copy `.env-sample` to `.env`.
2. Fill the two variables the validator refuses empty. `BROWSER_EXTENSION_PUBLIC_KEY` takes a fresh key: `openssl genrsa 2048 2>/dev/null | openssl rsa -pubout -outform DER 2>/dev/null | base64`. `REACT_APP_PIMLICO_API_KEY` takes any placeholder text; the walks send no bundler operation.
3. Set `RPC_PROVIDER="rpc"`.
4. Set `SEPOLIA_RPC_URL` to a Sepolia node that serves `eth_getLogs` over 10,000-block ranges and answers `eth_getCode` at old blocks. The public gateway `https://sepolia.gateway.tenderly.co` did on 2026-10-29. A node that prunes history fails the manager's log reads.
5. Set `SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES=5`, so the setup accepts a waiting period of 5 minutes.
6. Leave `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` empty to use the committed deployment below.
7. Install the SDK from the local checkout, as the rule on the package above says.
8. Run `yarn build:web:webkit`.
9. Load `build/webkit-prod` unpacked in Chrome or Chromium (`chrome://extensions`, developer mode, Load unpacked).
10. Keep exactly one Kohaku tab open during onboarding; two tabs race the onboarding state.
11. A reused Chromium profile keeps the old background script: before you load a new build, quit the browser and delete `Default/Service Worker` in the profile folder.

### 2. The committed Sepolia deployment

The contracts of the published record [ethereum/kohaku-contracts#15](https://github.com/ethereum/kohaku-contracts/pull/15) of 2026-10-29, read back from the chain on 2026-10-29. A build with no deployment variable uses them.

| Contract | Address |
| --- | --- |
| Recovery manager (deployed at block 12019037) | `0xF7Fd795C47025abda8dC4264Bf4Cdec22aC56A62` |
| Guardian (ECDSA) method | `0x87AcC5584c2aAd5Ede60c2a4730765C0d015b907` |
| Passkey method | `0x342B1e6CeB3f6ADD8122862FA3095D127DDecAc9` |
| Anon Aadhaar method | `0x12982d4764ecc891c846088Dc6e9ce5fDb81e7b3` |
| zkPassport method | `0x7eFbe568CAc60CDa42E3e2B978e13aeA66cEca1D` |
| Recovery action | `0x445C094570362885dE43aD8FeDE2bA25C04B8A7a` |

The identity parameters are this wallet's own and never change on a chain that holds credentials:

- zkPassport domain `social-recovery.kohaku.test`, scope `kohaku-social-recovery`, on the testnet certificate tree (the Sepolia root registry accepts that tree, which holds every real certificate).
- Aadhaar nullifier seed `11155111`, and UIDAI's offline e-KYC signing certificate "DS UIDAI 06" (valid 2026-02-03 to 2029-02-03), whose key the Aadhaar method trusts.

To point a build at another deployment, set `SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` in `.env` to one JSON object on one line, and build again. Write the value unquoted or in single quotes, never in double quotes: in double quotes the env loader turns each `\n` into a line break and the JSON no longer parses, so the build refuses the variable as malformed. Part 5 shows one complete line. The fields:

| Field | Type | Required |
| --- | --- | --- |
| `manager`, `methodEcdsa`, `methodPasskey`, `action` | non-zero address | yes |
| `methodAadhaar`, `methodZkpassport` | non-zero address | no; a method left out is not offered |
| `deployedAt` | whole block number, the manager's deployment block | yes |
| `digestVersion`, `managerVersion` | non-empty string (`"1"`, `"1.0.0"`) | yes |
| `auditedActions` | list of `{ "action": <address>, "publisher": "ethereumFoundation" }` | yes |
| `zkPassportDomain`, `zkPassportScope` | non-empty string; both or neither | no |
| `zkPassportTestnetTree` | `true` or `false` | no (false) |
| `aadhaarNullifierSeed` | decimal string below the BN254 scalar field; given with the certificate | no |
| `aadhaarCertificate` | one complete PEM certificate, line breaks as `\n`; given with the seed | no |
| `aadhaarTestMode` | `true` or `false`; true only for a module that trusts Anon Aadhaar's test key | no (false) |
| `explorerUrl` | http or https URL of the block explorer | no |

An unknown field, a zero or malformed address, or one field of a pair without the other stops the build's first recovery read with a message that names the field.

### 3. The wallets

- Make two wallets from throwaway seeds, never a real one: the holder, who sets up recovery, and the recoverer, a second profile that claims the account back. Use one Chromium profile for each.
- In the holder wallet, pick the smart account when the account picker opens at creation; the recovery setup is for that smart account.
- Fund both wallets with Sepolia ETH yourself. The holder's controlling key pays the save. The recoverer's key pays the submission of the claim and the execution, so give it enough for two transactions. Send it from a faucet or another Sepolia wallet; the walks use no balance override on the node.
- What the screens show and how long it took on the earlier walks: the save lands about 15 s after you press Sign, then the setup card reads saved; the submission and the execution each land in one block; the waiting period of 5 minutes runs on the wait screen with its countdown, and Execute opens when it ends.

### 4. The zkPassport walk

You need the zkPassport app on the phone and a real passport. The committed row asks for the testnet certificate tree, which holds every real certificate. The app's fake passport enrolls on the phone, but every claim with it reverts on chain, so use a real document.

1. In the holder wallet, open the recovery setup and add the passport row. Scan the code with the zkPassport app and follow the phone through its steps; the row shows the enrollment.
2. Run the access test on the row. The chain judges it through the method's verify view; the row shows the test passed.
3. Save the setup and sign. Wait for the saved state.
4. In the recoverer wallet, start the recovery of the holder's account, and claim with the passport row through the same app.
5. Submit the claim and sign. The wait screen opens with the waiting period.
6. When the wait ends, press Execute and sign. The done screen opens.

The module accepts the app's circuit version 0.21.1 today. When the app ships a newer circuit, the access test reverts until the contracts team moves the trusted keys; record the app version and stop there.

### 5. The Aadhaar walk

The committed Aadhaar method trusts UIDAI's current key, so a tester with a real Aadhaar QR code runs the walk on the committed row. The wallet's own check reads not judged, and the chain decides at the access test and at the claim.

For a test with no real Aadhaar, point the build at the test-only module with the override variable. Copy every field of the committed row from the table above, then change three:

- `methodAadhaar`: `0xFc9D2C88C6F1050F520F67081aa982F86D11D2C4`, the test-only module. It runs the same code as the real module but trusts Anon Aadhaar's public test key, whose private half is published. Never use it for a real account, and never mix it with the real module in one setup.
- `aadhaarTestMode`: `true`.
- `aadhaarCertificate`: Anon Aadhaar's test certificate, `testCertificate.pem`, as one JSON string.

The complete line for `.env`, in single quotes, with the test certificate already in it:

```
SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT='{"manager":"0xF7Fd795C47025abda8dC4264Bf4Cdec22aC56A62","methodEcdsa":"0x87AcC5584c2aAd5Ede60c2a4730765C0d015b907","methodPasskey":"0x342B1e6CeB3f6ADD8122862FA3095D127DDecAc9","action":"0x445C094570362885dE43aD8FeDE2bA25C04B8A7a","methodAadhaar":"0xFc9D2C88C6F1050F520F67081aa982F86D11D2C4","methodZkpassport":"0x7eFbe568CAc60CDa42E3e2B978e13aeA66cEca1D","zkPassportDomain":"social-recovery.kohaku.test","zkPassportScope":"kohaku-social-recovery","zkPassportTestnetTree":true,"aadhaarNullifierSeed":"11155111","aadhaarCertificate":"-----BEGIN CERTIFICATE-----\r\nMIID6jCCAtKgAwIBAgIBATANBgkqhkiG9w0BAQsFADBpMRQwEgYDVQQDEwtleGFt\r\ncGxlLm9yZzELMAkGA1UEBhMCVVMxETAPBgNVBAgTCFZpcmdpbmlhMRMwEQYDVQQH\r\nEwpCbGFja3NidXJnMQ0wCwYDVQQKEwRUZXN0MQ0wCwYDVQQLEwRUZXN0MB4XDTI0\r\nMDMwMTE2MTc0MFoXDTI1MDMwMTE2MTc0MFowaTEUMBIGA1UEAxMLZXhhbXBsZS5v\r\ncmcxCzAJBgNVBAYTAlVTMREwDwYDVQQIEwhWaXJnaW5pYTETMBEGA1UEBxMKQmxh\r\nY2tzYnVyZzENMAsGA1UEChMEVGVzdDENMAsGA1UECxMEVGVzdDCCASIwDQYJKoZI\r\nhvcNAQEBBQADggEPADCCAQoCggEBAJXoH3UGWVzCYq3c/d012AQFWyrfRtxxnFa1\r\nju4ZmZXvoaMlRxBiCseAHpdvROO+RU2w8ZDj99TjWYlyEXNE3lL894JvhJSIqVmn\r\ns9Iett0DRRZi6og+7u/eiJoUmbmkf5UExfCWwmK5bSPRl1AzLZ6X62FB0mHel5lN\r\nTEFjypy+PgdyIbRCU9z4FglCi2g1HuPptg0rNR/apu6MKKhFI5+X3nzA/l0UTkdI\r\nE/tD7Fg/gbTuMowiFnM0iY0hC6AXom7GiUDwXfIr2cyGu8OkNUOSNy1WYWd2m3Nb\r\noSyjWA+RnBvYunDEwqsKzysJvC+umB88ApWm4enySPUAcwlP+vECAwEAAaOBnDCB\r\nmTAMBgNVHRMEBTADAQH/MAsGA1UdDwQEAwIC9DA7BgNVHSUENDAyBggrBgEFBQcD\r\nAQYIKwYBBQUHAwIGCCsGAQUFBwMDBggrBgEFBQcDBAYIKwYBBQUHAwgwEQYJYIZI\r\nAYb4QgEBBAQDAgD3MCwGA1UdEQQlMCOGG2h0dHA6Ly9leGFtcGxlLm9yZy93ZWJp\r\nZCNtZYcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEAjDnIK8R7ruSiJpdUeZ2ZxaGI\r\newf020sAc0ENw6x3jaKKFINNLnMqEKLntZzIg7WbjnKLhtUhb/SLHP59mfT2OJVS\r\nYMW7uRmnajfEd0MzfrXIUKBwCeWTCyP/bcdlJOT4u24ngFnkUyWaEKnqH3YuI8cw\r\nBKWQ26Lq7ODq6e6Otxf0KOtWTeVSzlCL66MGBvQ36LF1g8PLEZ9hvvX06ieaE99W\r\nHDK9/pGSuobx6Fi7ufzqymirT/GOuxslquB4mleCu4ArCg2qAVC2wDjQymgvq8FS\r\nbVukYnC6XdwqYhvIuTPnEys4gGdeirY+UPGQeqxMrNm+ZpKPTS0NwzxHwlhutw==\r\n-----END CERTIFICATE-----","aadhaarTestMode":true,"deployedAt":12019037,"digestVersion":"1","managerVersion":"1.0.0","auditedActions":[{"action":"0x445C094570362885dE43aD8FeDE2bA25C04B8A7a","publisher":"ethereumFoundation"}],"explorerUrl":"https://sepolia.etherscan.io"}'
```

To turn another PEM file into a JSON string for the line, print it with node (the anon-aadhaar files have CRLF line breaks, which the parser accepts):

```
node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(process.argv[1], 'utf8').trim()))" <path>/testCertificate.pem
```

The test key files live in the [anon-aadhaar/anon-aadhaar](https://github.com/anon-aadhaar/anon-aadhaar) repository under `packages/circuits/assets/`: `testPrivateKey.pem`, `testPublicKey.pem` and `testCertificate.pem`. Download them outside this repository. Make a fresh test QR code with the generator in this folder:

```
node docs/social-recovery/manual-test/gen-test-qr.js --key <path>/testPrivateKey.pem --cert <path>/testCertificate.pem --out /tmp/qr-enroll
```

It writes `/tmp/qr-enroll.txt`, the number the upload field takes, and `/tmp/qr-enroll.png`, the image. `--other` makes the code of one fixed other identity, for the mismatch test: its nullifier differs from the plain code's and stays the same on every run. `AADHAAR_TEST_PRIVATE_KEY` and `AADHAAR_TEST_CERTIFICATE` can name the two paths instead of the flags.

The method refuses a QR code signed more than 24 hours before the chain's latest block. Make a fresh code for the enrollment, and another fresh one at recovery, since the holder presents a fresh code at every claim. The steps are those of the zkPassport walk, with the Aadhaar row and the code in place of the phone.

### 6. What to record

For each step, record the screen you saw (a screenshot), the time from Sign to the landed state, and the block of each landed transaction as the explorer shows it. Record any line that differs from the steps above, with the build's commit and the SDK's commit. Keep the wallets' secrets out of the report.
