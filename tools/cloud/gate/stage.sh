#!/bin/bash
# stage.sh <server dir> [local worktree]
# Read-only: prints the ENFORCED stage of a test directory from server evidence (hash, review records, jobs, results).
# Stages derived here: 改动中/待第1轮 -> 第1轮(需修改) -> 第1轮通过/待第2轮 -> 允许开测 -> 测试中 -> 已出结果.
# Judgment stages (失败处理 / 可交付) are NOT decided here: see the batch entry in docs/PLAN.md.
set -u
G="$(cd "$(dirname "$0")" && pwd)"
DIR=$1; WT=${2:-}
C="$(cd "$G/.." && pwd)"; K=$C/tc_dnd; H="ubuntu@${DND_RUNNER_HOST:?DND_RUNNER_HOST not set}"
T="ssh -i $K -o BatchMode=yes -o IdentitiesOnly=yes $H"
h=$($T hash "$DIR" 2>&1) || { echo "dir=$DIR: $h"; exit 2; }
echo "dir=$DIR server_hash=$h"
if [ -n "$WT" ]; then
  l=$(cd "$WT" && git ls-files -co --exclude-standard -z | python "$G/manifest.py" manifest . --normalize --stdin-list --out /dev/null)
  if [ "$l" = "$h" ]; then echo "local=$WT hash matches"; else echo "local=$WT hash=$l DIFFERS (local edits after upload: re-sync and re-review)"; LOCALDIFF=1; fi
fi
recs=$($T ls "/work/.reviews/$h" 2>/dev/null | grep -o '[^ ]*\.json$')
r1=$(echo "$recs" | grep -c '^r1-'); r2=$(echo "$recs" | grep -c '^r2-')
verdicts=""; for f in $recs; do v=$($T get "/work/.reviews/$h/$f" | python -c "import json,sys;d=json.load(sys.stdin);print(d.get('round'),d.get('verdict'),d.get('reviewer'))"); verdicts="$verdicts
  $f -> $v"; done
echo "records for this hash: r1=$r1 r2=$r2$verdicts"
job=$($T jobs 2>/dev/null | grep -E "(^| )dir=$DIR( |$)" | grep -v ' ended ')
res=$($T tail -n 3 "/work/$DIR.full" 2>/dev/null)
if echo "$verdicts" | grep -q ' changes '; then st="第1/2轮 需修改（同哈希有 changes，否决）"
elif [ "$r2" -gt 0 ] && echo "$verdicts" | grep -q '^ *r2-.* 2 approve '; then st="允许开测（以 gate run 实际判定为准）"
elif [ "$r1" -gt 0 ]; then st="第1轮已提交，待第2轮"
else st="改动中/待第1轮（无本哈希审查记录）"; fi
[ -n "$job" ] && st="测试中: $job"
[ -z "$job" ] && echo "$res" | grep -q FINISHED && grep -q "# hash=$h" <<<"$($T get /work/$DIR.full 2>/dev/null | head -1)" && st="已出结果（本哈希）: 见 /work/$DIR.full"
[ "${LOCALDIFF:-0}" = 1 ] && st="改动中（本地内容已不同于服务器：重新上传并重审）；服务器侧=$st"
echo "STAGE: $st"
echo "注：允许开测以 gate run 的实际判定为准（含审查者独立性检查）；失败处理/可交付见 PLAN 批次条目。"
