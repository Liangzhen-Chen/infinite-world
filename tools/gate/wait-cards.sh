#!/bin/sh
# usage: wait-cards.sh <name>... — returns when every card is DONE/ENDED/STALL(15min idle)/TIMECAP(start+minutes+15)
L=/f/dnd/logs/sessions
# On hand-in, SUBMIT the card gate to the machine-wide scheduler and wait for its result (no test pool is started here).
T=$(cd "$(dirname "$0")" && pwd)
gate(){ n=$1; [ -f $L/$n.wt ] || return; node "$T/card-gate.mjs" "$(cat $L/$n.wt)" "$(cat $L/$n.base 2>/dev/null || echo master)" "$n" > $L/$n.gate.log 2>&1; }
w(){ n=$1; set -- $(cat $L/$n.start 2>/dev/null || echo "$(date +%s) 90"); s=$1; cap=$(( ($2+15)*60 ));
  while :; do [ -s $L/$n.last.txt ] && { echo "$n DONE"; gate $n; return; }; grep -qx "tokens used" $L/$n.log 2>/dev/null && { echo "$n ENDED"; gate $n; return; }
  age=$(( $(date +%s) - $(stat -c %Y $L/$n.log 2>/dev/null || date +%s) )); [ $age -gt 900 ] && { echo "$n STALL ${age}s"; return; }
  [ $(( $(date +%s)-s )) -gt $cap ] && { echo "$n TIMECAP"; return; }; sleep 60; done; }
for n in "$@"; do w $n & done; wait
for n in "$@"; do echo "== $n"; head -c 700 $L/$n.last.txt 2>/dev/null; echo; grep -a "tokens used" -A1 $L/$n.log 2>/dev/null | tail -1; [ -f $L/$n.gate.md ] && cat $L/$n.gate.md; done
