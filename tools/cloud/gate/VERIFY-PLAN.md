# Gate verification plan (run after deploy, on a fake dir; no real test work is touched)
Setup: `mkdir /tmp/fk/tests`, one file tests/t.test.mjs containing a one-assert node:test; sync it as dir `gate-fake`
(`sh sync.sh <fakewt> <any existing base> gate-fake`). T="ssh -i tc_dnd ubuntu@$DND_RUNNER_HOST". Let H = `$T hash gate-fake`.
Reviewers R1, R2 are fresh ids; implementer id I.

1. No record: `$T run gate-fake 1 tests/t.test.mjs` -> `REFUSED: no review records for hash H`, exit 3, log line REFUSED, no /work/gate-fake.full.
2. Round 1 only: submit round 1 (approve) by R1 -> prints `H/r1-...`; run again -> `REFUSED: only round 1 present ... a round-2 approve is required`, exit 3.
3. Round 2 reviewer is an implementer: submit round 2 with reviewer=I, implementers=I -> review-put prints `REJECTED: reviewer is among implementers` (nothing stored).
   Also: round 2 by R1 again -> `REJECTED: ... same reviewer`; round 2 with round1 id missing -> `REJECTED: round1 record does not exist`. run still REFUSED.
4. Approved then modify: submit valid round 2 by R2 (approve, round1=R1's id) -> run prints `STARTED ... hash=H`, /work/gate-fake.full ends with FINISHED and `pass=1 fail=0`.
   Edit one file locally, sync again (prep recreates the dir) -> new hash H2 != H; run -> `REFUSED: no review records for hash H2`, exit 3. Same for editing the test file or a probe script.
5. Both rounds, same version: with H2 reviewed by R1 (r1) and R2 (r2 approve, round1=r1) -> `run` STARTED, .full contains `# hash=H2` and result line; `run-script gate-fake probe.mjs` also STARTED; `jobs` lists it with hash; `kill gate-fake` stops it.
6. Bypass attempts with the tc_dnd key: `$T node -v` -> `DENIED: unknown verb`, exit 2; `$T` (no command) -> `DENIED: interactive shell not allowed`;
   `scp -i tc_dnd x.txt ubuntu@$DND_RUNNER_HOST:/tmp/` -> fails (`scp -t` is not a verb -> DENIED); `sftp -i tc_dnd ...` -> fails; `$T get /work/../etc/passwd` -> DENIED bad path;
   `$T put ../x.tgz`, `$T prep gate-fake ..`, `$T rm nm` -> DENIED. Every attempt appears in /work/.gate/log.
Also: with the key tc_review, any command only reads stdin as a record (garbage -> `REJECTED: not JSON`). The int-m / c-fuel3 jobs keep running throughout (check `ps` before/after).

Additional cases (from round-1 review):
7. Multi-document JSON: pipe `{"x":1}{<valid round-2 record>}` into `ssh -i tc_review ... review` -> `REJECTED: input must be exactly one JSON object`; also a hash with a newline or `../`, `{"round":2.5}`, `{"round":"2"}`, `{"round":true}` -> `REJECTED: schema check failed`; nothing appears under /work/.reviews. A valid record with `"round":2.0` is NOT rejected: it is normalised and stored as round 2 (`r2-...` file name), exactly like `"round":2`.
8. Concurrent apply vs run: start `run` on an approved dir with a long test; meanwhile `prep`/`apply`/`rm`/second `run` on the same dir -> `DENIED: ... locked ...` until the job ends. Race run against sync with a `sleep` inserted in `dhash`: apply must be refused or the job must abort with `ABORTED: tree hash changed`.
9. Concurrent put during apply: loop `put <dir>.stale` with `../x` lines while `apply` runs -> apply only uses its private copy; nothing outside the dir is deleted.
10. Tarball members `./node_modules/x.js`, `./.out/a`, `a/../b`, symlinks, hardlinks -> `DENIED: apply.py rejected tarball`; node_modules afterwards is the symlink to /work/nm.
11. Round 2 whose round1 is a same-hash `changes` record -> REJECTED by review-put (and REFUSED by the gate if forged into the store).
12. `kill <dir>` with a stale job file whose pid belongs to another dir's runjob -> `no running gate job`; other dirs' jobs survive.
13. After `deploy.sh harden`: `ssh tc_review` as reviewer accepts records; a job run via `run` shows `runner` as owner in `ps`; `sudo -u runner touch /work/.reviews/x /home/ubuntu/gate/x` fails; `kill` and `jobs` still work.
14. Snapshot repo (after apply, via `run-script` of a probe that prints `git branch` / `git log --oneline --all`): branches `master` (one commit holding only world/actions/*.json from the real master) and `snapshot` (HEAD, the synced tree) exist; `git show master:world/actions/core.json` succeeds. Content hash before and after this change is identical for the same worktree (manifest excludes .git).
15. Job git trust: a `run` job (also as runner after harden) can run `git show master:world/actions/core.json` with no "dubious ownership" error; `git config --global --get safe.directory` on the server stays empty.
16. Upload size: sync prints `master_bytes=` (about 27 KB for 5 files); with no `master` ref in the worktree repo it is an empty archive and overfit-guard #2 fails with "the master catalog must be readable" (honest failure, not a pass).
17. Local CRLF guard: `deploy.sh install|update` refuses while any pushed script contains a CR byte (`tr -cd '\r' < f | wc -c` non-zero).

## Plant-a-synonym check (proves overfit-guard #2 really compares with master; steps only, run on the cloud after sync)
1. In a scratch copy of the worktree, pick a sentence from tests/fixtures/a3-intents*.json of 4+ characters that is not already a synonym in master.
2. Add it to the `synonyms` array of any action in world/actions/core.json (this is the planted copy). Do not touch the allowlist.
3. `sh sync.sh <scratch worktree> <base> plant-1`; after two-round approval of that hash, `ssh ... run plant-1 1 tests/overfit-guard.test.mjs`.
4. Expected: test 2 FAILS listing `world/actions (<id>):0  <the planted sentence>`; tests 1 and 3 pass. Removing the line and re-syncing makes test 2 pass.
5. Control: planting a synonym that master already has, or one of 3 characters, must not fail test 2.
18. Malicious `.master` upload: `put <dir>.master` with an archive containing a symlink member, a `../x` member, an absolute path, and a `.git/config` member (one archive each) followed by `apply` -> `DENIED: apply.py rejected master file`; no `master` ref built from it, nothing outside the dir touched, and `/work/.inbox/<dir>.master|.tgz|.stale` are all removed after the failure.
19. Master trace: `sync.sh` prints `master_tree=<sha>` and `master tree match: <sha>`; the gate log line for `apply` carries the same `master_tree=`. Swapping the `.master` archive between sync and apply (e.g. a hand-made put) makes sync exit 5 with `MASTER TREE MISMATCH`.
20. Preflight on a server with git older than 2.31 -> `git >= 2.31 required`, install/update stop before restricting anything.
