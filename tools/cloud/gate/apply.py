#!/usr/bin/env python3
# apply.py <tgz> <dir>: safe extract (regular files/dirs only, no escapes, no node_modules/.out/.tmp/.git).
import sys, tarfile, posixpath
EXC = {'node_modules', '.out', '.tmp', '.git'}
tgz, root = sys.argv[1:3]
total = 0
with tarfile.open(tgz) as t:
    for m in t.getmembers():
        n = posixpath.normpath(m.name)
        parts = m.name.split('/')
        if not (m.isfile() or m.isdir()): sys.exit('apply: non-regular member %s' % m.name)
        if m.name.startswith('/') or n != m.name or '.' in parts or '..' in parts or '' in parts or parts[0] in EXC or n.split('/')[0] in EXC:
            sys.exit('apply: bad member %s' % m.name)
        total += m.size
        if total > (4 << 30): sys.exit('apply: unpacked size too large')
    t.extractall(root, filter='data')
