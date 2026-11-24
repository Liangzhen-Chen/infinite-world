#!/usr/bin/env python3
# Shared by local scripts and the server gate: identical manifest format on both sides.
#   manifest.py manifest ROOT [--normalize] [--stdin-list] [--out FILE]  -> manifest (or, with --out, writes it and prints sha256)
#   manifest.py hash     ROOT [--normalize] [--stdin-list]               -> sha256 of the manifest
#   manifest.py diff LOCAL_MANIFEST REMOTE_MANIFEST CHANGED_OUT STALE_OUT
#   manifest.py pack ROOT OUT.tgz CHANGED_LIST EXEC_LIST                 (local only; text files CRLF->LF, except -text per ROOT/.gitattributes)
# Manifest line: "<sha256>  <relative path>", sorted by path bytes. Top-level node_modules/.out/.tmp/.git excluded.
import sys, os, hashlib, tarfile, io, time, re

EXC = {'node_modules', '.out', '.tmp', '.git'}

def die(m):
    sys.stderr.write('manifest.py: %s\n' % m); sys.exit(2)

def norm(b):
    return b if b'\0' in b else b.replace(b'\r\n', b'\n')  # NUL anywhere => binary, untouched

# -text handling: files that ROOT/.gitattributes marks -text (or binary) keep their original bytes (no CRLF->LF).
# Subset of gitattributes semantics (only ROOT/.gitattributes; nested ones are ignored):
#   pattern without '/' matches the file name at any depth; with '/' (or leading '/') it is anchored at ROOT;
#   * ? [..] never cross '/'; '**' as leading '**/', trailing '/**' or middle '/**/' crosses directories;
#   later lines override earlier ones; attrs read: text, -text, !text, text=..., binary (= -text).
#   Unsupported => treated as no match: trailing-'/' (directory) patterns, quoted patterns, other macros, negated '!pat'.
def _rx(pat):
    anchored = '/' in pat
    pat = pat.lstrip('/')
    out, i, n = '', 0, len(pat)
    while i < n:
        c = pat[i]
        if pat.startswith('**/', i) and (i == 0 or pat[i - 1] == '/'): out += '(?:.*/)?'; i += 3; continue
        if pat.startswith('/**', i) and i + 3 == n: out += '/.*'; i += 3; continue
        if c == '*': out += '[^/]*'
        elif c == '?': out += '[^/]'
        elif c == '[':
            j = pat.find(']', i + 2)
            if j < 0: out += re.escape(c)
            else:
                b = pat[i + 1:j]
                if b[:1] == '!': b = '^' + b[1:]
                out += '[' + b.replace('\\', '\\\\') + ']'; i = j
        elif c == '\\' and i + 1 < n: i += 1; out += re.escape(pat[i])
        else: out += re.escape(c)
        i += 1
    return re.compile(('' if anchored else '(?:.*/)?') + out + r'\Z', re.S)

def load_notext(root):
    rules = []
    try:
        with open(os.path.join(root, '.gitattributes'), 'rb') as f: txt = f.read().decode('utf-8', 'surrogateescape').lstrip('﻿')
    except OSError:
        return lambda rel: False
    for ln in txt.splitlines():
        t = ln.split()
        if not t or t[0].startswith('#') or t[0].startswith('"') or t[0].startswith('!') or t[0].endswith('/'): continue
        st = [a for a in t[1:] if a in ('text', '-text', '!text', 'binary') or a.startswith('text=')]
        if not st: continue
        try: rules.append((_rx(t[0]), st))
        except re.error: continue  # malformed pattern (e.g. [z-a]): treated as no match -> normalized, still self-consistent
    def f(rel):
        v = False
        for rx, st in rules:
            if rx.match(rel):
                for a in st: v = (a in ('-text', 'binary'))
        return v
    return f

def fsha(p, normalize, keep=False):
    h = hashlib.sha256()
    if normalize and not keep:
        with open(p, 'rb') as f: h.update(norm(f.read()))
    else:
        with open(p, 'rb') as f:
            for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()

def names_from_walk(root):
    out = []
    for dp, dn, fn in os.walk(root, onerror=lambda e: (_ for _ in ()).throw(e)):
        rel_dp = os.path.relpath(dp, root).replace(os.sep, '/')
        if rel_dp == '.':
            rel_dp = ''
            dn[:] = [d for d in dn if d not in EXC]
        for d in dn:
            if os.path.islink(os.path.join(dp, d)):
                out.append((rel_dp + '/' + d) if rel_dp else d)
        for f in fn:
            out.append((rel_dp + '/' + f) if rel_dp else f)
    return out

def entries(root, normalize, names):
    res = {}
    notext = load_notext(root) if normalize else (lambda r: False)
    for rel in names:
        if rel.split('/', 1)[0] in EXC: continue
        if '\n' in rel: die('newline in path: %r' % rel)
        p = os.path.join(root, rel)
        if os.path.islink(p):
            if normalize: die('symlink not supported: %s' % rel)
            res[rel] = hashlib.sha256(b'->' + os.readlink(p).encode('utf-8', 'surrogateescape')).hexdigest()
        elif os.path.isfile(p):
            res[rel] = fsha(p, normalize, notext(rel))
    return res

def render(res):
    lines = sorted(res.items(), key=lambda kv: kv[0].encode('utf-8', 'surrogateescape'))
    return b''.join(('%s  ' % h).encode() + p.encode('utf-8', 'surrogateescape') + b'\n' for p, h in lines)

def parse(path):
    res = {}
    with open(path, 'rb') as f:
        for ln in f.read().split(b'\n'):
            if ln: res[ln[66:].decode('utf-8', 'surrogateescape')] = ln[:64].decode()
    return res

def main(a):
    if not a: die('usage')
    cmd = a[0]
    if cmd in ('manifest', 'hash'):
        root = a[1]; flags = a[2:]
        normalize = '--normalize' in flags
        if '--stdin-list' in flags:
            names = [n.decode('utf-8', 'surrogateescape') for n in sys.stdin.buffer.read().split(b'\0') if n]
        else:
            names = names_from_walk(root)
        data = render(entries(root, normalize, names))
        h = hashlib.sha256(data).hexdigest()
        if '--out' in flags:
            with open(flags[flags.index('--out') + 1], 'wb') as f: f.write(data)
            print(h)
        elif cmd == 'hash': print(h)
        else: sys.stdout.buffer.write(data)
    elif cmd == 'diff':
        l, r = parse(a[1]), parse(a[2])
        ch = sorted(p for p in l if r.get(p) != l[p]); st = sorted(p for p in r if p not in l)
        for path, lst in ((a[3], ch), (a[4], st)):
            with open(path, 'wb') as f: f.write(b''.join(x.encode('utf-8', 'surrogateescape') + b'\n' for x in lst))
        print(len(ch), len(st))
    elif cmd == 'pack':
        root, out, chl, exl = a[1:5]
        notext = load_notext(root)  # pack is only used on the normalizing (local) side
        ex = set(open(exl, encoding='utf-8').read().split('\n'))
        with tarfile.open(out, 'w:gz') as t:
            for rel in [x for x in open(chl, encoding='utf-8').read().split('\n') if x]:
                with open(os.path.join(root, rel), 'rb') as f: d = f.read(); d = d if notext(rel) else norm(d)
                ti = tarfile.TarInfo(rel); ti.size = len(d); ti.mtime = int(time.time())
                ti.mode = 0o755 if rel in ex else 0o644
                t.addfile(ti, io.BytesIO(d))
    else: die('unknown command')

main(sys.argv[1:])
