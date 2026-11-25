#!/bin/bash
# Retired: the old whole-tree upload+run bypassed the review gate.
# Host from DND_RUNNER_HOST (no hardcoded IP); key paths relative to this script's directory (no absolute local paths).
H=${DND_RUNNER_HOST:?DND_RUNNER_HOST not set}
D="$(cd "$(dirname "$0")" && pwd)"
echo "rt.sh is retired. Use:  sh $D/sync.sh <worktree> <base> <dir>   then   ssh -i $D/tc_dnd ubuntu@$H run <dir> <P> <tests...|--all>"
echo "(run is refused until two independent reviews approve the exact hash; see $D/gate/README.md)"
exit 2
