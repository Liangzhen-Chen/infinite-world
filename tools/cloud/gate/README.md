# Review gate for the Tencent test box (gate dir: tools/cloud/gate)
Every use of key tc_dnd runs /home/ubuntu/gate/gate.sh (forced command): only whitelisted verbs, scp/sftp/shell are DENIED.
Executor: `sh tools/cloud/sync.sh <worktree> <base> <dir>` uploads the worktree's actual bytes (uncommitted/untracked
included, text CRLF->LF) and prints local+server hash (must match). Run: `ssh -i tools/cloud/tc_dnd ubuntu@$DND_RUNNER_HOST run <dir> <P> <tests...|--all>`
(probes: `run-script <dir> <rel.mjs> [args]`; results: `get|tail|grep|wc|ls <path>`, `jobs`, `kill <dir>`, `rm <dir>`, `uptime`). Output: /work/<dir>.full.
`run` recomputes the hash of /work/<dir> each time; with no matching approval it prints REFUSED + reason and exits 3.
Reviewer (a fresh agent, never an implementer): read the code at /work/<dir> or the identical worktree, then submit with
`bash tools/cloud/gate/review-submit.sh <round> <worktree> <dir> <approve|changes> <reviewer-id> <implementer,ids> <round1-id|-> <scope.txt> <findings.txt>`
It refuses unless local hash == server hash. Round 1 prints a record id (<hash>/r1-...); round 2 passes that id as round1.
Records are written only via key tc_review (review-put.sh), append-only under /work/.reviews/<hash>/.
Approval -> run: gate finds /work/.reviews/<current hash>/r2-*.json with verdict=approve, whose round1 record exists, and where
both reviewers differ and neither is in either record's implementers. Any change to any file/test/script changes the hash and voids it.
Deploy (not yet done): `bash deploy.sh keys|install|update|rollback` (+ optional `harden` / `unharden`). Audit trail: `get /work/.gate/log`.

## What this does NOT guarantee
- Same Windows user can read tc_dnd, tc_review and tc_admin private keys: a hostile executor can ssh as admin or forge records. Reviewer/implementer ids are free text, unauthenticated. The gate stops accidents and shortcuts only.
- A round-1 record may be for a different hash (any verdict); same-hash round 1 must be approve. Round 2 alone decides the version.
- Outside the hash: top-level node_modules (shared /work/nm), .out, .tmp, .git, file mode bits, and anything outside the dir. Files are hashed by sha256; text CRLF->LF at upload (binary = any NUL byte).
- Without `harden`: approved test code runs as ubuntu, which can write /work/.reviews, /home/ubuntu/gate, authorized_keys and has passwordless sudo, so a reviewed test could still forge approvals. Reviewers must read for that.
- With `harden` (optional, changes users/sudoers/ownership, needs Liangzhen's approval): jobs run as `runner` (no sudo, cannot write reviews/gate); /work/.reviews is owned by `reviewer`, tc_review lives in that account. ubuntu still has its own sudo (gate scripts and keys remain writable through it), tc_admin and key-file readability are unchanged.
- Read verbs (get/ls/tail/grep/wc) can read anything under /work. A run that writes inside the tree (outside .out/.tmp) changes the hash: re-sync and re-review before the next run.
- Running jobs hold a per-dir lock; apply/prep/rm/run on that dir are refused until the job ends (`kill <dir>` first). runjob re-hashes before starting and aborts on a mismatch.
- A `changes` record for the same hash (either round) vetoes that version; otherwise any one valid round-2 approve suffices.
- `prep`/`rm` wipe any valid, non-busy dir under /work, including one whose live job has its cwd elsewhere; check the preflight cwd listing before install that int-m and c-fuel3 jobs sit inside their dirs.
- Any other unrestricted key or console login on the box bypasses the gate (`deploy.sh keys` prints fingerprints for a human to check). `put` leaves .part files in /work/.inbox if a transfer drops.
- Snapshot repo on the server (built by `apply`): branch `master` = the real master's top-level world/actions/*.json (sync.sh uploads them as `<dir>.master`, ~27 KB gz; override ref with MASTER_REF), branch `snapshot` = the synced tree. Needed by tests/overfit-guard (#2 compares catalog synonyms with master). Not part of the content hash. Jobs get `safe.directory=*` through env only.
- Line endings (open): sync converts CRLF->LF for text files so the server matches git's index. A test that hashes raw file bytes frozen from a CRLF checkout (npc-depth-yp reports a source-hash mismatch) needs one of: (A) a list of frozen paths that sync uploads byte-for-byte (same list used by the local manifest, server hashing is raw anyway, so the approval binding is intact); (B) normalise only files that git reports as `i/lf w/crlf` (what a Linux checkout produces) and keep files committed with CRLF or marked -text as they are. First step for either: find which files npc-depth-yp hashes raw and compare sha256 of raw vs LF bytes. No assertion is touched.
- Known limits of the master snapshot (not fixed): (N3) `core.quotePath` makes git print non-ASCII file names quoted, so a non-ASCII top-level name under world/actions/ would make `git archive` fail in sync.sh (sync fails, it does not pass silently); (N4) `.git` is chmod a+rwX, so a job can rewrite the `master` ref inside its own snapshot (same trust level as the job rewriting its own tree; the hash and approval do not cover .git). The uploaded master is traceable through `master_tree=` (printed by sync and logged by apply).
