#!/bin/bash
# Server-side job body (full.sh logic). Started only by gate.sh after the review check passed.
#   runjob.sh full <dir> <hash> <P> <files...|--all>   -> /work/<dir>.full  (one line per file, FINISHED at end)
#   runjob.sh script <dir> <hash> <rel.mjs> [args...]  -> /work/<dir>.script.out (EXIT=n, FINISHED)
mode=$1; d=$2; h=$3; shift 3
G=/work/.gate/jobs
umask 000   # files stay deletable by the gate user even when the job runs as another user
printf 'pid=%s\nhash=%s\nstart=%s\nmode=%s\ndir=%s\n' $$ "$h" "$(date -u +%FT%TZ)" "$mode" "$d" > $G/$d.job
cd /work/$d || exit 1
# second line of defence: the tree must still be the approved one
if [ "$(python3 /home/ubuntu/gate/manifest.py hash /work/$d)" != "$h" ]; then
  if [ "$mode" = full ]; then echo "ABORTED: tree hash changed since approval" > /work/$d.full; echo FINISHED >> /work/$d.full
  else echo "ABORTED: tree hash changed since approval" > /work/$d.script.out; echo FINISHED >> /work/$d.script.out; fi
  echo "end=aborted" >> $G/$d.job; exit 1
fi
mkdir -p .out .tmp
T=/work/.tmp-$d; rm -rf -- "$T"; mkdir -p -- "$T"; export TEMP=$T TMP=$T TMPDIR=$T  # temp root outside the run dir (vol12 S12-2; Libai 11-18 23:39)
# the job may run as another user than the one that built .git: trust it for this job only (no global git config)
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'
# optional per-file timeout: regular file .job-timeout in the (hash-approved) tree holding exactly a positive integer <= 14400 (+ optional one newline); anything else -> 3600
JOB_TIMEOUT=3600
if [ -f .job-timeout ] && [ ! -L .job-timeout ]; then
  t=$(head -c 7 .job-timeout; printf x); t=${t%x}; n=${#t}; t=${t%$'\n'}   # exact content only: digits plus at most one trailing newline; n = chars read (bash drops NUL bytes)
  if [[ $t =~ ^[1-9][0-9]{0,4}$ ]] && [ "$t" -le 14400 ] && [ "$(wc -c < .job-timeout)" -eq "$n" ]; then JOB_TIMEOUT=$t; fi
fi
export JOB_TIMEOUT
if [ "$mode" = full ]; then
  P=$1; shift; out=/work/$d.full; rm -f $out; echo "# hash=$h" > $out
  # Longest-first ordering from past runs. Read-only: only regular, non-symlink /work/*.full (never this job's own), only strictly
  # formatted lines. Files without history go first (unknown = assume slow); no history at all -> original order.
  # Order only: the list is never added to or shortened (line count checked); result-file format is unchanged.
  order_by_history() {
    local l=.tmp/list.$$ hh=.tmp/hist.$$ x
    cat > $l || { cat; return; }
    for x in /work/*.full; do [ -f "$x" ] && [ ! -L "$x" ] && [ "$x" != "$out" ] && tail -c 2000000 "$x"; done 2>/dev/null > $hh
    if [ -s $hh ]; then
      awk 'NR==FNR { if ($0 ~ /^tests\/[^ ]+\.test\.mjs pass=([0-9]+|\?) fail=([0-9]+|\?) exit=[0-9]+ secs=[0-9]+$/) { n=split($0,a," "); s=substr(a[n],6)+0; if (!(a[1] in m) || s>m[a[1]]) m[a[1]]=s } next }
           { print ($0 in m ? m[$0] : 99999999) " " $0 }' $hh $l | sort -s -k1,1nr | cut -d" " -f2- > $l.2
      [ "$(wc -l < $l.2)" = "$(wc -l < $l)" ] && mv $l.2 $l
    fi
    cat $l; rm -f $l $l.2 $hh
  }
  if [ "${1:-}" = --all ]; then ls tests/*.test.mjs; else printf '%s\n' "$@"; fi | order_by_history | xargs -P $P -I{} bash -c 'f={}; b=$(basename $f); s=$(date +%s); timeout -k 30 $JOB_TIMEOUT node --test --test-reporter=tap $f > .out/$b.tap 2>&1; e=$?; p=$(grep -m1 "^# pass" .out/$b.tap | cut -d" " -f3); n=$(grep -m1 "^# fail" .out/$b.tap | cut -d" " -f3); echo "$f pass=${p:-?} fail=${n:-?} exit=$e secs=$(( $(date +%s)-s ))"' >> $out
  echo FINISHED >> $out
else
  out=/work/$d.script.out; rm -f $out; echo "# hash=$h" > $out
  timeout -k 30 $JOB_TIMEOUT node "$@" >> $out 2>&1; echo "EXIT=$?" >> $out; echo FINISHED >> $out
fi
echo "end=$(date -u +%FT%TZ)" >> $G/$d.job
