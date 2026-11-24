#!/bin/bash
# NOT YET RUN. Deploy only after two independent reviews and Liangzhen's go-ahead.
#   deploy.sh keys       list authorized_keys (comment + fingerprint only)
#   deploy.sh install    first install: scripts, tc_admin (verified), preflight, tc_review key, THEN restrict tc_dnd
#   deploy.sh update     re-push scripts through tc_admin (temp file + mv), then preflight
#   deploy.sh rollback   (via tc_admin) restore tc_dnd to an unrestricted key
#   deploy.sh harden     OPTIONAL, never part of install: runner/reviewer users (changes users, sudoers, ownership)
#   deploy.sh unharden   stop using the runner user (removes the runas switch; users/ownership stay)
# Running jobs are never touched (no kill, no restart).
set -eu
G="$(cd "$(dirname "$0")" && pwd)"; C="$(cd "$G/.." && pwd)"; H="ubuntu@${DND_RUNNER_HOST:?DND_RUNNER_HOST not set}"
SSHO="-o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15"
as() { local k=$1; shift; ssh -i $C/$k $SSHO $H "$@"; }
blob() { awk '{print $2}' "$C/$1.pub"; }
ak() { local k=$1; shift; as $k "python3 - $*" < "$G/akedit.py"; }   # args pre-quoted by the caller
push() { local k=$1 f=$2 mode=$3; as $k "cat > ~/gate/.new.$f && chmod $mode ~/gate/.new.$f && mv -f ~/gate/.new.$f ~/gate/$f" < "$G/$f"; }
SCRIPTS="gate.sh review-put.sh runjob.sh apply.py manifest.py"
OPT='no-port-forwarding,no-pty,no-agent-forwarding,no-X11-forwarding,no-user-rc'
PRE='set -e
jq --version; git --version
set -- $(git --version | awk "{split(\$3,a,\".\"); print a[1], a[2]}")
{ [ "$1" -gt 2 ] || { [ "$1" -eq 2 ] && [ "$2" -ge 31 ]; }; } || { echo "git >= 2.31 required (GIT_CONFIG_COUNT env config)"; exit 1; }
 python3 -c "import tarfile; tarfile.data_filter"
sudo -n true || echo "WARN: no passwordless sudo (gate rm/prep fallback unavailable)"
for f in ~/gate/*.sh; do bash -n "$f"; done
python3 -c "import ast,sys; [ast.parse(open(f).read()) for f in sys.argv[1:]]" ~/gate/manifest.py ~/gate/apply.py
echo "dry run:"; SSH_ORIGINAL_COMMAND=uptime bash ~/gate/gate.sh
echo "cwd of live /work processes (must show the running jobs inside their dirs):"
for p in /proc/[0-9]*; do readlink $p/cwd 2>/dev/null; done | grep "^/work" | sort | uniq -c || true
echo PREFLIGHT-OK'
preflight() { as tc_admin "$PRE" | tee /dev/stderr | grep -q PREFLIGHT-OK || { echo "preflight FAILED; not restricting anything"; exit 1; }; }
# scripts pushed to the server must be LF-only (CRLF broke the first deploy)
nocr() { local f; for f in $SCRIPTS deploy.sh akedit.py; do [ "$(tr -cd '\r' < "$G/$f" | wc -c)" = 0 ] || { echo "CR found in $f: convert to LF first"; exit 1; }; done; }
case ${1:-} in
  keys) as tc_dnd 'ssh-keygen -lf ~/.ssh/authorized_keys';;
  install)
    nocr
    as tc_dnd 'ssh-keygen -lf ~/.ssh/authorized_keys'; echo "^ existing keys (any unrestricted key other than tc_dnd is a bypass)"
    as tc_dnd 'mkdir -p ~/gate /work/.inbox /work/.gate/jobs /work/.reviews && chmod 755 /work/.reviews'
    ak tc_dnd "/home/ubuntu/.ssh/authorized_keys add $(blob tc_admin) tc_admin"
    as tc_admin 'echo admin-login-ok' | grep -q admin-login-ok || { echo "tc_admin login failed; NOT restricting tc_dnd"; exit 1; }
    for f in $SCRIPTS; do case $f in *.sh|*.py) push tc_admin $f 755;; esac; done
    preflight
    ak tc_admin "/home/ubuntu/.ssh/authorized_keys add $(blob tc_review) tc_review 'command=\"/home/ubuntu/gate/review-put.sh\",$OPT'"
    ak tc_admin "/home/ubuntu/.ssh/authorized_keys restrict $(blob tc_dnd) 'command=\"/home/ubuntu/gate/gate.sh\",$OPT'"
    echo "--- post-check (expect DENIED / DENIED):"; as tc_dnd 'node -v' || true; as tc_dnd uptime || true;;
  update) nocr; for f in $SCRIPTS; do push tc_admin $f 755; done; preflight;;
  rollback) ak tc_admin "/home/ubuntu/.ssh/authorized_keys unrestrict $(blob tc_dnd)";;
  harden)
    # 1 users: runner (runs approved jobs, no sudo, no write access to gate/reviews), reviewer (owns /work/.reviews, receives tc_review)
    as tc_admin 'id runner >/dev/null 2>&1 || sudo useradd -m -s /usr/sbin/nologin runner
id reviewer >/dev/null 2>&1 || sudo useradd -m -s /bin/bash reviewer
sudo chmod o+x /home/ubuntu && chmod 755 ~/gate ~/gate/*.sh ~/gate/*.py
sudo chmod 1777 /work/.gate/jobs
echo "ubuntu ALL=(runner) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/gate-runner >/dev/null && sudo chmod 440 /etc/sudoers.d/gate-runner && sudo visudo -cf /etc/sudoers.d/gate-runner
sudo mkdir -p /home/reviewer/.ssh && sudo chown reviewer:reviewer /home/reviewer/.ssh && sudo chmod 700 /home/reviewer/.ssh'
    # 1b checks before anything is switched (abort on failure)
    as tc_admin 'set -e
sudo -n -u runner node -v >/dev/null || { echo "runner cannot run node with its default PATH (node under /home/ubuntu or nvm?)"; exit 1; }
sudo -n -u runner touch /work/.probe-runner && sudo -n -u runner rm -f /work/.probe-runner || { echo "runner cannot create/delete files in /work"; exit 1; }
sudo -n -u runner touch /work/.gate/jobs/.probe && sudo -n -u runner rm -f /work/.gate/jobs/.probe || { echo "runner cannot write /work/.gate/jobs"; exit 1; }
sudo -n -u runner python3 /home/ubuntu/gate/manifest.py hash /work/nm >/dev/null || { echo "runner cannot read gate scripts"; exit 1; }
! grep -q hidepid /proc/mounts || { echo "/proc mounted with hidepid: gate jobs/kill cannot see runner processes"; exit 1; }
echo HARDEN-CHECKS-OK' | grep -q HARDEN-CHECKS-OK || { echo "harden checks failed; runner not enabled"; exit 1; }
    # 2 tc_review key moves to the reviewer account (forced command unchanged)
    ssh -i $C/tc_admin $SSHO $H "sudo -u reviewer python3 - /home/reviewer/.ssh/authorized_keys add $(blob tc_review) tc_review 'command=\"/home/ubuntu/gate/review-put.sh\",$OPT'" < "$G/akedit.py"
    echo reviewer > "$G/review-user"
    echo "--- reviewer login test (expect REJECTED: not JSON/object):"
    echo 'x' | ssh -i $C/tc_review $SSHO reviewer@$DND_RUNNER_HOST review | grep -q REJECTED || { echo "reviewer login/forced command failed; tc_review kept on ubuntu, runner not enabled"; exit 1; }
    # 3 only after that works: hand /work/.reviews to reviewer, drop tc_review from the ubuntu account, switch jobs to runner
    as tc_admin 'sudo chown -R reviewer:reviewer /work/.reviews && sudo chmod 755 /work/.reviews'
    ak tc_admin "/home/ubuntu/.ssh/authorized_keys remove $(blob tc_review)"
    as tc_admin 'echo runner > ~/gate/.runas.new && mv -f ~/gate/.runas.new ~/gate/runas'
    echo "--- runner must NOT write reviews/gate and must have no sudo (expect 3 failures):"
    as tc_admin 'sudo -n -u runner touch /work/.reviews/x /home/ubuntu/gate/x 2>&1; sudo -n -u runner sudo -n true 2>&1' || true
    echo "ubuntu keeps its own sudo (gate rm fallback); removing it is a separate decision. See README.";;
  unharden)
    # full inverse: refuses while runner has processes; users and sudoers file stay (harmless without runas)
    as tc_admin 'if pgrep -u runner >/dev/null; then echo "runner has running processes (kill them first)"; exit 1; fi
rm -f ~/gate/runas && sudo chown -R ubuntu:ubuntu /work/.reviews && sudo chmod 1777 /work/.gate/jobs'
    rm -f "$G/review-user"
    ak tc_admin "/home/ubuntu/.ssh/authorized_keys add $(blob tc_review) tc_review 'command=\"/home/ubuntu/gate/review-put.sh\",$OPT'"
    ssh -i $C/tc_admin $SSHO $H "sudo -u reviewer python3 - /home/reviewer/.ssh/authorized_keys remove $(blob tc_review)" < "$G/akedit.py"
    echo "unhardened: jobs run as ubuntu, tc_review on the ubuntu account, reviews owned by ubuntu";;
  *) echo "usage: deploy.sh keys|install|update|rollback|harden|unharden"; exit 2;;
esac
