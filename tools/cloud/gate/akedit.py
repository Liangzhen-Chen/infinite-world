# Local helper, piped to the server by deploy.sh:  python3 - <authorized_keys file> add|restrict|unrestrict|remove <blob> [comment] [options]
# Atomic (temp file + os.replace) and keeps a timestamped backup per call.
import sys, os, shutil, time
f, op, b = sys.argv[1:4]
extra = sys.argv[4:]
L = open(f).read().splitlines() if os.path.exists(f) else []
if L: shutil.copy(f, f + ".bak-gate-" + time.strftime("%Y%m%d%H%M%S"))
out, seen = [], False
for l in L:
    p = l.split(); i = [j for j, x in enumerate(p) if x.startswith("ssh-")]
    if i and p[i[0] + 1] == b:
        seen = True
        if op == "remove": continue
        if op == "restrict": l = extra[0] + " " + " ".join(p[i[0]:])
        if op == "unrestrict": l = " ".join(p[i[0]:])
    out.append(l)
if op == "add" and not seen:
    out.append((extra[1] + " " if len(extra) > 1 else "") + "ssh-ed25519 " + b + " " + extra[0])
tmp = f + ".new"
with open(tmp, "w") as w: w.write("\n".join(out) + "\n")
os.chmod(tmp, 0o600); os.replace(tmp, f)
