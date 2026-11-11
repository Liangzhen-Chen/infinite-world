#!/bin/sh
# usage: sh acc-unchanged.sh <worktree>
T="${1:-F:/dnd-wt/GUARD}"
export TEMP=F:/dnd-tmp TMP=F:/dnd-tmp
fail=0
d=$(git -C "$T" diff master --stat -- server-plugin world tests)
if [ -n "$d" ]; then echo "FAIL: server-plugin/world/tests 有改动:"; echo "$d"; fail=1; else echo "PASS: server-plugin/world/tests 与 master 无差异"; fi
cd "$T" || exit 3
node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs tests/advance-registry.test.mjs > F:/dnd-tmp/k8-acc/unchanged-tests.log 2>&1
rc=$?
grep -E "^# (tests|pass|fail)" F:/dnd-tmp/k8-acc/unchanged-tests.log
if [ $rc -ne 0 ]; then echo "FAIL: 测试未全部通过 (rc=$rc)"; fail=1; else echo "PASS: 四个测试文件全部通过"; fi
exit $fail
