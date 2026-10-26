# usage: sh F:/dnd-tools/watch-progress.sh <minutes> <logfile>...
# Run in the background next to every long job of the main session (gates, sweeps,
# collections): exits with STALL, and so notifies the main session, as soon as any
# watched log has not changed for <minutes>. Stop it when the job itself finishes.
# 10-26: a coverage collection sat on one test for four hours unnoticed.
min=$1; shift
while :; do
  now=$(date +%s)
  for f in "$@"; do
    [ -f "$f" ] || continue
    age=$(( (now - $(stat -c %Y "$f")) / 60 ))
    if [ $age -ge $min ]; then echo "STALL $f: no output for $age min ($(tail -n 1 "$f" | cut -c1-160))"; exit 3; fi
  done
  sleep 120
done
