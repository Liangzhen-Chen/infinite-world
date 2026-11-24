#!/bin/bash
# Usage: review-submit.sh <round 1|2> <worktree> <server dir> <approve|changes> <reviewer id> <implementer,ids> <round1 id|-> <scope file> <findings file>
# Refuses unless local manifest hash == server hash of <server dir>; then submits through the tc_review key.
set -eu
ROUND=$1; WT=$2; DIR=$3; VERDICT=$4; REVIEWER=$5; IMPL=$6; R1=$7; SCOPE=$8; FIND=$9
G="$(cd "$(dirname "$0")" && pwd)"; C="$(cd "$G/.." && pwd)"
H="ubuntu@${DND_RUNNER_HOST:?DND_RUNNER_HOST not set}"
KH="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${DND_KNOWN_HOSTS:-$C/known_hosts}"
RU=ubuntu; [ -f "$G/review-user" ] && RU=$(cat "$G/review-user")   # set by deploy.sh harden
HR=$RU@$DND_RUNNER_HOST
lh=$(bash "$G/manifest.sh" "$WT")
sh=$(ssh -i $C/tc_dnd -o BatchMode=yes -o IdentitiesOnly=yes $KH $H hash "$DIR")
[ "$lh" = "$sh" ] || { echo "REFUSED: local hash $lh != server hash $sh (sync first, review exactly what is on the server)"; exit 4; }
python - "$ROUND" "$lh" "$VERDICT" "$REVIEWER" "$IMPL" "$R1" "$SCOPE" "$FIND" <<'PY' | ssh -i $C/tc_review -o BatchMode=yes -o IdentitiesOnly=yes $KH $HR review
import sys, json
r, h, v, who, impl, r1, sc, fi = sys.argv[1:9]
print(json.dumps({"round": int(r), "hash": h, "verdict": v, "reviewer": who,
  "implementers": [x for x in impl.split(",") if x], "round1": None if r1 == "-" else r1,
  "scope": open(sc, encoding="utf-8").read(), "findings": open(fi, encoding="utf-8").read()}))
PY
