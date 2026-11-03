# UX copy rulebook

The rules of a ux-track engagement's user-facing strings, minted per engagement rather than shipped filled: the vocabulary bans and required strings are design decisions the interview and the rounds settle, so the entries below are format examples and a new engagement replaces them with its own before the first `drive-renderer` round. `rules/writing.md` beside this file governs the spec's own prose; this file governs the strings a user reads on the rendered surfaces, a different register with a different reader, which is why the two are separate files (SPEC.md, § The track).

Two rule kinds exist and they enforce differently. A ban is mechanical: the `copy-lint` check id greps every banned term over the files the instance's `surfaces` declaration names in `.harness/config.yaml`, and a hit fails the battery. A requirement names a string a surface must carry, and it stays at the prose layer until a ban-shaped hit record shows requirements failing often enough to earn a script, the build-order rule applied to copy. Every mechanical rule carries a stable id (`UXC-<n>`), minted once and never reused, so a design decision, an invariant of kind `copy-lint` and a battery finding all cite the same handle.

Declaring that no bans apply is a legal decision with its own grammar: the exact line `This engagement declares no vocabulary bans.` on its own line in this file, which `copy-lint` accepts in place of ban entries, so an engagement whose interview ruled no terms out records that ruling instead of leaving the check red or minting a ban nobody decided.

The grammar the script reads is one line per ban, exactly this shape, with the banned term in backticks and no leading whitespace. The entries below sit indented so the script never reads them: they show the format and are not this engagement's bans, and a new engagement writes its own unindented with its own terms, since a shipped ban left live would grep this engagement's surfaces for another engagement's words.

    - UXC-1 bans `<term the design ruled out>`
    - UXC-2 bans `<jargon the interview replaced>`

Requirements are prose entries under the same id space, each naming the string, the surface that owes it and the decision behind it, indented here for the same reason:

    - UXC-3 requires the honesty note on the screen that offers a choice between storage methods to state which choice keeps the data on one device only, per the decision that ruled honest floor copy in. Layer, prose.

A term a ban catches inside a design annotation rather than a user-facing string is a false positive to resolve in the surfaces themselves, by keeping annotations in the layer or naming convention the surface tool marks as non-copy, never by weakening the ban: the grep cannot read intent, so the surface files carry the distinction.

## This engagement's rules

Minted from the Kohaku UX decisions the ux chapter validates (`design-context/spec-v1/ux/imports/social-recovery-ux-flows.md`, decisions 5, 14, 33, 42, 57, 61, 93, 99, 100). The bans below sit unindented, so `copy-lint` greps each term over the wireframe file the surfaces declaration names; the requirements stay indented, since they are prose-layer rules the reviewer and the chapter's own strings check apply. Bans hold for user-facing strings only; the banned terms stay legal in spec prose. The grep reads the whole surface file, design annotations and node names included, so an annotation never carries a banned term either.

- UXC-1 bans `policy`
- UXC-2 bans `proof`
- UXC-3 bans `relayer`
- UXC-4 bans `EIP-712`
- UXC-5 bans `atomic`
- UXC-6 bans `Protected`, and the reviewer reads `protect` or `unprotected` as claims about the account the same way, since the recovery status reads set up or not set up in the first releases and Recovery ready once the grading ships: recovery protects against key loss, never key theft.
- UXC-7 bans `your people`, and the reviewer reads `person` as a label the same way; "guardian" is the role in prose and help, "member" the slot inside a group header.
- UXC-9 bans `full wallet password`; the device unlock is the "extension password", distinct from the "recovery password".

    - UXC-8 requires that "signature" appears only inside the offline-signing block, since the artefact a guardian produces is an "approval" on both sides; the block's own strings name the signature the offline signer returns, so the grep cannot hold this rule and the chapter's strings check does. Layer, prose.

    - UXC-10 requires the user-facing feature name "Account recovery", and the three concept names "recovery path", "method" and "waiting period"; "Social Recovery (Kit)" stays an internal name. Layer, prose.
    - UXC-11 requires that no string claims the chain enforces a limit it does not: the 24 hour waiting-period minimum, instance uniqueness, one setup per account and action, and this release's one-key limit are the wallet's or the SDK's own rules. Layer, prose.
    - UXC-13 requires that a method whose access test failed reads "test failed" with the cause the test reported and never "not tested", per the R-53 ruling that a failed test is not a skipped one. Layer, prose.
    - UXC-14 requires the four approval values to keep one name each on every surface, "new key", "key being removed", "payment" or "no payment", and "deadline", and the kit's nouns to keep the screen words D-302 fixes. Layer, prose.
    - UXC-12 requires that no string says a privacy level hides that a recovery setup exists; a level hides what can be read, never the existence. Layer, prose.
