#!/bin/sh
# usage: wait-cards.sh <name>... — returns when every card is DONE/ENDED/STALL(15min idle)/TIMECAP(start+minutes+15)
# A card that ended on a Codex platform error (capacity / stream disconnected ...) without a last.txt is reported as
# PLATFORM_INTERRUPTED (no gate) and resumed ONCE as <name>-r via resume-card.sh; the new card is then awaited the same way.
# Env (test seams): WAIT_SESSIONS (default /f/dnd/logs/sessions), WAIT_POLL seconds (60), RESUME_CARD (/f/dnd-tools/resume-card.sh).
L=${WAIT_SESSIONS:-/f/dnd/logs/sessions}; POLL=${WAIT_POLL:-60}; RESUME=${RESUME_CARD:-/f/dnd-tools/resume-card.sh}
# On hand-in, SUBMIT the card gate to the machine-wide scheduler and wait for its result (no test pool is started here).
T=$(cd "$(dirname "$0")" && pwd)
gate(){ n=$1; [ -f $L/$n.wt ] || return; node "$T/card-gate.mjs" "$(cat $L/$n.wt)" "$(cat $L/$n.base 2>/dev/null || echo master)" "$n" > $L/$n.gate.log 2>&1; }
# Last real platform error line of the log ("Reconnecting..." is a transient retry, not a verdict). Usage-limit errors are
# platform errors too but resuming cannot help until the quota resets, so they are reported without auto-resume.
platform_err(){ grep -a '^ERROR: ' $L/$1.log 2>/dev/null | grep -av 'Reconnecting\.\.\.' | tail -1; }
resumable(){ echo "$1" | grep -aqiE 'at capacity|stream disconnected|stream closed|overloaded|service unavailable|connection (reset|closed)|error sending request'; }
platform(){ echo "$1" | grep -aqiE 'at capacity|stream disconnected|stream closed|overloaded|service unavailable|connection (reset|closed)|error sending request|usage limit'; }
interrupted(){ n=$1; e=$(platform_err $n | cut -c1-120)
  echo "$n PLATFORM_INTERRUPTED $e"
  if ! resumable "$e"; then echo "$n RESUME_SKIPPED (not retryable now)"; return; fi
  case $n in *-r) echo "$n RESUME_SKIPPED (already a resume)"; return;; esac
  r=$n-r; [ -f $L/$r.start ] && { echo "$n RESUME_SKIPPED ($r already exists)"; return; }
  min=$(cut -d' ' -f2 $L/$n.start 2>/dev/null); [ -n "$min" ] || min=60
  printf '%s\n' "上一轮因平台中断（$e）在中途结束。请从中断处继续：先看 git status 和 git diff 了解已完成的改动，不要重做；只补完剩余部分，然后按原指令汇报。" > $L/$r.body.md
  GATE_BASE=$(cat $L/$n.base 2>/dev/null || echo master) sh "$RESUME" "$r" "$n" "$(cat $L/$n.wt 2>/dev/null)" medium "$min" || { echo "$n RESUME_FAILED"; return; }
  w $r; }
w(){ n=$1; set -- $(cat $L/$n.start 2>/dev/null || echo "$(date +%s) 90"); s=$1; cap=$(( ($2+15)*60 ));
  while :; do [ -s $L/$n.last.txt ] && { echo "$n DONE"; gate $n; return; }
  if grep -qx "tokens used" $L/$n.log 2>/dev/null; then
    if platform "$(platform_err $n)"; then interrupted $n; return; fi
    echo "$n ENDED"; gate $n; return; fi
  age=$(( $(date +%s) - $(stat -c %Y $L/$n.log 2>/dev/null || date +%s) )); [ $age -gt 900 ] && { echo "$n STALL ${age}s"; return; }
  [ $(( $(date +%s)-s )) -gt $cap ] && { echo "$n TIMECAP"; return; }; sleep $POLL; done; }
for n in "$@"; do w $n & done; wait
for n in "$@"; do for m in $n $n-r; do [ "$m" = "$n-r" ] && [ ! -f $L/$m.start ] && continue
  echo "== $m"; head -c 700 $L/$m.last.txt 2>/dev/null; echo; grep -a "tokens used" -A1 $L/$m.log 2>/dev/null | tail -1; [ -f $L/$m.gate.md ] && cat $L/$m.gate.md; done; done
