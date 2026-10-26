# RETIRED (gate v2, P2). Per-log polling is replaced by the single scheduler plus the wait adapter.
# This shell only prints the pointer and forwards to the new mechanism; it no longer watches arbitrary logs.
# usage (unchanged): sh watch-progress.sh <minutes> <logfile>...   -> now: cards named after the log files
here=$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)
echo "watch-progress.sh is retired: use  powershell -File $here/notify.ps1 -Root F:/dnd/logs/gate -Sessions F:/dnd/logs/sessions -Cards <card,...>  (status: status.ps1)" >&2
min=${1:-15}; shift
cards=""
for f in "$@"; do
  b=$(basename "$f"); b=${b%.gate.log}; b=${b%.log}; b=${b%.txt}
  cards="${cards:+$cards,}$b"
done
args="-Root F:/dnd/logs/gate -Sessions F:/dnd/logs/sessions -CardStallSec $((min * 60))"
[ -n "$cards" ] && args="$args -Cards $cards"
exec powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$here/notify.ps1" $args
