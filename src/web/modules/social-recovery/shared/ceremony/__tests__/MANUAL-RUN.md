# Manual run with a real authenticator

The tests in this folder mock `navigator.credentials`. The checks below need a real authenticator in Chrome. Run them by hand and record each result.

## Set-up

- Mount a `CeremonySourceProvider` above the ceremony route that hands the tab an orchestrator, a passkey method and a request. Without one, every call reports not supported. Record which provider the run used.
- Build the extension (`yarn build:web:webkit`) with the manifest key of the release builds. Load it unpacked in a Chrome profile with no other Kohaku build, and keep one Kohaku tab open. Write down the extension id.
- Compute the expected rp id hash: `printf 'chrome-extension://<id>' | shasum -a 256`.
- Have a synced platform authenticator (Touch ID with iCloud Keychain), a hardware security key with no sync, and an Android phone with Google Password Manager. 1Password on a phone is optional.

## Checks

1. Open the ceremony from the action popup. It redirects to `tab.html#/social-recovery/ceremony`, and the popup closes. The ceremony never starts in the popup or in an action window.
2. Enroll with iCloud Keychain. The tab shows "Not tested" and "Synced passkey · Apple". The authenticator data has BE set, and its rp id hash equals the hash from the set-up, not `sha256("<id>")`. Record the AAGUID: a zeroed one reads "your password manager" instead.
3. Enroll with the security key. The line reads "Device-bound passkey · this device" ("this Mac" for a device-bound platform passkey on a Mac).
4. Test access with the credential of check 2: the tab shows "Tested" and "check … · passed just now". Test access with the other credential's record: the tab shows "Test failed" with its cause, never "Not tested".
5. Create a claim for one place of a request. The assertion's `rpId` is the extension id, and the method receives the signature.
6. Repeat check 5 with the phone over hybrid until an assertion has `s > n/2`. The method receives `n - s`, and a verifier that rejects high `s` accepts it.
7. Cancel the browser prompt at enroll, test access and create claim. Enroll and create claim show "Cancelled · you cancelled the prompt, the row is unchanged" and no chip. Test access shows "Test failed", `NotAllowedError` and "This method may never work." The method never runs.
8. Let the browser refuse (cancel the security key's PIN prompt, or deny the platform prompt). Enroll reads cancelled or refused, never failed. Record the error name.
9. Start test access with the phone hand-off, and switch to another tab before you approve on the phone. While the tab is hidden, the extension's storage holds nothing under `socialRecoveryCeremonyResult:<id>`. Return after more than ten minutes: the tab shows "Tested", and the report appears in storage then, with a `reportedAt` of the time you returned.
10. Start the hand-off at enroll and at test access, and never scan the code. After the prompt's 180 seconds, both read unreachable with Try again. Close the prompt early instead: enroll reads cancelled, test access reads test failed with `NotAllowedError`. Try again starts a new hand-off.
11. Create the passkey in 1Password over hybrid. A `SecurityError` reads the provider-refused note. Record the error name Chrome gives: a `NotAllowedError` reads cancelled instead.
12. Enroll with one build, then load a build with another manifest key (another extension id) and run test access with the stored record. It reads test failed with `NotAllowedError`, never passed and never the relying-party mismatch note.
13. Open the health check. It reports not supported with no retry, and no prompt appears.
14. On a Safari or Firefox build, the tab reads "Passkeys need Kohaku on Chrome."

Record the iPhone hybrid routes and a second Apple device as untested when the run skips them.
