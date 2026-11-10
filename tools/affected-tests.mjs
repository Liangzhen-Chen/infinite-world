#!/usr/bin/env node
// affected-tests: which tests a change can influence (static, conservative, no test is run).
//
// Usage:
//   node tools/affected-tests.mjs <base> <head>            test file list, one per line (stdout)
//   node tools/affected-tests.mjs --files a b c            same, for an explicit changed-file list
//   node tools/affected-tests.mjs <base> <head> --why      add "# " reason-chain lines per test
//   node tools/affected-tests.mjs <base> <head> --json     {changed,selected,total,reasons,unmapped}
//   node tools/affected-tests.mjs ... --smoke              also union tools/smoke-tests.json
//   node tools/affected-tests.mjs ... --tier merge         drop smoke-tests.json `nightlyOnly` (heavy) tests from the list; they are
//                                                          printed as "# deferred" lines and counted on stderr, never silently lost.
//                                                          --tier full (default) keeps everything.
//   node tools/affected-tests.mjs <base> <head> --per-file  how many tests each changed file selects (diagnostics)
//   node tools/affected-tests.mjs --deps                  {test:[server-plugin files in its closure]} (used to build the smoke set)
//   node tools/affected-tests.mjs ... --root <dir>         repo root (default: parent of tools/)
// Test universe = tests/*.test.mjs (the files `npm test` runs). Nothing is executed.
//
// RULES (full text: docs/验证分层方案.md)
// 1. Dependency graph. A scannable file (.mjs/.js/.cjs) depends on:
//    a) static import / export-from specifiers and import('literal');
//    b) every string literal (also join/resolve argument runs, and the static prefix of a template
//       literal) that resolves, against the file's own directory, the repo root or <root>/world/, to a
//       tracked file or directory. A directory or file-name-prefix match makes every changed file under
//       it relevant (read-all, readdir and glob tests are selected by any change below that directory),
//       but it does NOT pull the scripts in that directory into the closure (reading is not importing);
//    c) import(<non-literal>) is opaque: the importing file is then treated as importing every script
//       under its own directory and under every directory it names by literal.
// 2. A test is selected when a changed file is in its transitive dependency set (itself, what it
//    imports or reads, and what those import or read, recursively).
// 3. World data: tools/load-world.mjs reads world/ through a dynamic root, so every test whose closure
//    contains it depends on all of world/ EXCEPT world/drafts/** (authoring scratch, never read by
//    loadWorld; reached only through an explicit literal). Any other world/ change therefore selects
//    every loadWorld-dependent test. No field-level data mapping is attempted (that would be a guess).
// 4. Global files at repo root (package.json, package-lock.json, .gitattributes, .npmrc, node version
//    files) select ALL tests. Unknown root files or top-level dirs outside KNOWN_TOP select ALL tests.
// 5. A changed file no test depends on (docs/*.md, tools/cloud/** ...) selects nothing and is listed as
//    "unmapped" (--why/--json), never silently dropped.
// 6. Deleted files: tests whose closure reads the deleted file's directory are selected.
// Conservative principle: whatever cannot be decided is selected.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const SCAN_EXT = /\.(mjs|js|cjs)$/;
const KNOWN_TOP = new Set(['server-plugin', 'tools', 'tests', 'world', 'docs', 'schemas', 'prompt', 'extension', 'assets', '跑团资料']);
const GLOBAL_ALL = new Set(['package.json', 'package-lock.json', '.gitattributes', '.npmrc', '.nvmrc', '.node-version']);
const WORLD_UNLOADED = ['world/drafts/'];

const argv = process.argv.slice(2);
const opt = {why: false, json: false, smoke: false, root: path.resolve(import.meta.dirname, '..'), files: null, positional: []};
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--why') opt.why = true;
    else if (a === '--json') opt.json = true;
    else if (a === '--smoke') opt.smoke = true;
    else if (a === '--tier') opt.tier = argv[++i];
    else if (a === '--per-file') opt.perFile = true;
    else if (a === '--deps') opt.deps = true;
    else if (a === '--root') opt.root = path.resolve(argv[++i]);
    else if (a === '--files') { opt.files = argv.slice(i + 1); break; }
    else opt.positional.push(a);
}
if (opt.tier !== undefined && !['merge', 'full'].includes(opt.tier)) { console.error(`invalid --tier ${opt.tier} (merge|full)`); process.exit(2); }
const ROOT = opt.root;
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', '-C', ROOT, ...args], {encoding: 'utf8', maxBuffer: 1 << 28});

let changed;
if (opt.files) changed = opt.files;
else if (opt.deps) changed = [];
else {
    if (opt.positional.length !== 2) { console.error('usage: affected-tests.mjs <base> <head> | --files f...'); process.exit(2); }
    changed = git('diff', '--no-renames', '--name-only', opt.positional[0], opt.positional[1]).split('\n').filter(Boolean);
}
changed = changed.map(f => f.replace(/\\/g, '/'));

// ---- universe: tracked + untracked-not-ignored files that exist on disk (uncommitted work counts)
const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) tracked.add(f);
// this tool and its set builder are not part of what tests depend on (their directory-wide reads would otherwise loop back into the graph)
const META = new Set(['tools/affected-tests.mjs', 'tools/build-smoke-set.mjs']);
const files = [...tracked].filter(f => fs.existsSync(path.join(ROOT, f)) && !META.has(f)).sort();
const fileSet = new Set(files);
const dirSet = new Set();
for (const f of files) { let d = path.posix.dirname(f); while (d !== '.' && !dirSet.has(d)) { dirSet.add(d); d = path.posix.dirname(d); } }
const tests = files.filter(f => /^tests\/[^/]+\.test\.mjs$/.test(f));
const scannable = files.filter(f => SCAN_EXT.test(f));
const dirFiles = new Map();
for (const f of files) { const d = path.posix.dirname(f); if (!dirFiles.has(d)) dirFiles.set(d, []); dirFiles.get(d).push(path.posix.basename(f)); }
const expandMemo = new Map();
const expandPrefix = p => { if (!expandMemo.has(p)) expandMemo.set(p, scannable.filter(g => g.startsWith(p))); return expandMemo.get(p); };

// ---- scanning
const IMPORT_RE = [
    /(?:^|[;\s}])(?:import|export)\s[^'"`;]*?\sfrom\s*(['"])([^'"\n]+)\1/g,
    /(?:^|[;\s])import\s*(['"])([^'"\n]+)\1/g,
    /(?<![\w.$])import\(\s*(['"`])([^'"`\n$]+)\1\s*[,)]/g,
];
// a module import(<expression>) is opaque. Not counted: engine.import(bundle) member calls (lookbehind), npm packages
// (require.resolve), and method definitions `[async ]import(params) {` in classes / object literals (see hasOpaqueImport).
const NONLIT_IMPORT_G = /(?<![\w.$])import\(\s*(?!['"`][^'"`$\n]*['"`]\s*[,)])(?!pathToFileURL\(require\.resolve)/g;
function hasOpaqueImport(src) {
    for (const m of src.matchAll(NONLIT_IMPORT_G)) {
        // find the matching ")" (naive: strings/templates are skipped, comments are not; an unmatched paren stays opaque = conservative)
        let i = m.index + m[0].indexOf('(') + 1, depth = 1;
        for (; i < src.length && depth > 0; i++) {
            const c = src[i];
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === '"' || c === "'" || c === '`') { for (i++; i < src.length && src[i] !== c && src[i] !== '\n'; i++) if (src.charCodeAt(i) === 92) i++; }
        }
        if (depth > 0) return true;
        // A method definition `[async ]import(params) {` sits where a class/object member starts (previous token `{` `}` `;` `,`)
        // and its body brace is on the same line. An expression such as `x = import(y)` followed by a block on the next line
        // (no semicolons) has an operator, `await`, `return` etc. before it and/or the brace on a later line: stays opaque.
        const head = src.slice(0, m.index).replace(/\basync\s*$/, '').replace(/\s+$/, '');
        if (/[{};,]$/.test(head) && /^[ \t]*\{/.test(src.slice(i, i + 40))) continue;
        return true;
    }
    return false;
}
// A bare-word literal (no "/" and no ".") used as a comparison operand (=== !== == != case) or as a quoted object key is a value/name,
// not a path. Anything else (arguments, array elements, path-like literals, unclear shapes) stays a candidate path (conservative).
// Known blind spot (accepted, none in the repository today): a bare word compared or used as a key and later passed to a
// directory read, e.g. `if (x === 'world') fs.readdirSync(x)`; such code should build the path as a literal path or a join.
function isNonPathLiteral(src, idx, len, lit) {
    if (lit.includes('/') || lit.includes('.')) return false;
    const before = src.slice(Math.max(0, idx - 12), idx), after = src.slice(idx + len, idx + len + 6);
    if (/(?:[!=]==?|\bcase)\s*$/.test(before) || /^\s*[!=]==?/.test(after)) return true;
    return /^\s*:/.test(after) && /[{,]\s*$/.test(before);
}
const LIT_RE = /(['"`])((?:\\.|(?!\1)[^\\\n])*?)\1/g;
const JOIN_ARG_RE = /(['"`])(?:(?!\1)[^\\\n$])*\1/g;
const JOIN_RE = /\b(?:join|resolve)\(([^()]*)\)/g;
function candidates(lit, dir) {
    const res = new Set();
    if (!lit || lit.length > 240 || /[\s*?<>|{}]/.test(lit) || !/[\w一-鿿]/.test(lit)) return res;
    for (const b of [dir, '', 'world']) {
        let p = path.posix.normalize(path.posix.join(b, lit));
        if (p.startsWith('../') || p === '..' || p.startsWith('/')) continue;
        p = p.replace(/\/+$/, '');
        if (!p || p === '.') continue;
        if (fileSet.has(p)) res.add(p);
        else if (dirSet.has(p)) res.add(p + '/');
        else if (!lit.endsWith('/') && !lit.includes('.')) {
            // template prefix such as "world/meta/x-": file-name prefix inside an existing directory
            const d = path.posix.dirname(p), base = path.posix.basename(p);
            if (dirSet.has(d) && base.length >= 3 && (dirFiles.get(d) ?? []).some(n => n.startsWith(base))) res.add(p);
        }
    }
    return res;
}
function resolveImport(spec, dir) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
    const p = path.posix.normalize(path.posix.join(dir, spec));
    if (fileSet.has(p)) return p;
    for (const ext of ['.mjs', '.js', '.cjs', '.json', '/index.mjs', '/index.js']) if (fileSet.has(p + ext)) return p + ext;
    return null;
}
const deps = new Map();
function scan(f) {
    if (deps.has(f)) return deps.get(f);
    const rec = {nodes: new Set(), prefixes: new Set(), opaque: false};
    deps.set(f, rec);
    if (!SCAN_EXT.test(f)) return rec;
    let src; try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return rec; }
    const dir = path.posix.dirname(f);
    for (const re of IMPORT_RE) for (const m of src.matchAll(re)) { const r = resolveImport(m[2], dir); if (r) rec.nodes.add(r); }
    if (hasOpaqueImport(src)) { rec.opaque = true; rec.prefixes.add(dir === '.' ? '' : dir + '/'); }
    const lits = new Set();
    // literals that are arguments of a multi-literal join/resolve count only as the joined path, not one by one
    const litSrc = src.replace(JOIN_RE, (all, args) => ((args.match(JOIN_ARG_RE) ?? []).length > 1 ? '' : all));
    for (const m of litSrc.matchAll(LIT_RE)) { if (isNonPathLiteral(litSrc, m.index, m[0].length, m[2])) continue; let s = m[2]; if (m[1] === '`' && s.includes('${')) s = s.slice(0, s.indexOf('${')); lits.add(s); }
    for (const m of src.matchAll(JOIN_RE)) {
        const parts = [...m[1].matchAll(/(['"`])((?:(?!\1)[^\\\n$])*)\1/g)].map(x => x[2]);
        if (parts.length > 1) lits.add(parts.join('/'));
    }
    for (const lit of lits) for (const c of candidates(lit, dir)) { rec.prefixes.add(c); if (fileSet.has(c)) rec.nodes.add(c); }
    return rec;
}
const isLoader = f => f === 'tools/load-world.mjs';
const isWorldRoot = p => p === 'world/';
const covers = (prefix, file) => prefix.endsWith('/') ? file.startsWith(prefix) : (file === prefix || file.startsWith(prefix + '/') || file.startsWith(prefix));

const changedSet = new Set(changed);
function analyse(test) {
    const parent = new Map([[test, null]]);
    const queue = [test];
    const prefixFrom = [];
    while (queue.length) {
        const f = queue.shift();
        const rec = scan(f);
        for (const n of rec.nodes) if (!parent.has(n)) { parent.set(n, f); queue.push(n); }
        for (const p of rec.prefixes) {
            prefixFrom.push({from: f, prefix: p});
            // reading a directory is not executing it: expand into importable nodes only for opaque (computed) imports
            if (rec.opaque && p.endsWith('/')) for (const g of expandPrefix(p)) if (!parent.has(g)) { parent.set(g, f); queue.push(g); }
        }
    }
    const chainOf = node => { const c = []; for (let x = node; x != null; x = parent.get(x)) c.push(x); return c.reverse(); };
    const hits = [];
    for (const ch of changed) {
        if (parent.has(ch)) { hits.push({file: ch, chain: chainOf(ch)}); continue; }
        for (const pf of prefixFrom) {
            if (isWorldRoot(pf.prefix) && WORLD_UNLOADED.some(u => ch.startsWith(u))) continue;
            if (covers(pf.prefix, ch)) { hits.push({file: ch, chain: [...chainOf(pf.from), `reads ${pf.prefix}${isLoader(pf.from) ? ' (loadWorld)' : ''}`]}); break; }
        }
    }
    return {hits, closure: parent, prefixFrom};
}

if (opt.deps) {
    const o = {};
    for (const t of tests) o[t] = [...analyse(t).closure.keys()].filter(f => f.startsWith('server-plugin/'));
    fs.writeSync(1, JSON.stringify(o));
    process.exit(0);
}
const perFile = new Map(changed.map(c => [c, 0]));
const selected = new Set(), reasons = new Map(), mapped = new Set();
const addReason = (t, r) => { selected.add(t); const a = reasons.get(t) ?? []; if (a.length < 3) a.push(r); reasons.set(t, a); };
function selectAll(why) { for (const t of tests) addReason(t, why); }
for (const ch of changed) {
    const top = ch.split('/')[0];
    if (!ch.includes('/') && GLOBAL_ALL.has(ch)) { selectAll(`global file changed: ${ch}`); mapped.add(ch); }
    else if (ch.includes('/') && !KNOWN_TOP.has(top) && top !== '.github') { selectAll(`unknown top-level area: ${ch}`); mapped.add(ch); }
    else if (!ch.includes('/') && !/\.(md|cmd|ps1)$/.test(ch)) { selectAll(`unknown root file: ${ch}`); mapped.add(ch); }
}
const deleted = changed.filter(ch => !fs.existsSync(path.join(ROOT, ch)));
for (const t of tests) {
    const {hits, prefixFrom} = analyse(t);
    if (changedSet.has(t) && !hits.some(h => h.file === t)) hits.push({file: t, chain: [t]});
    for (const h of hits) { addReason(t, h.chain.join(' -> ')); mapped.add(h.file); }
    for (const f of new Set(hits.map(h => h.file))) perFile.set(f, (perFile.get(f) ?? 0) + 1);
    for (const ch of deleted) {
        const dp = path.posix.dirname(ch) + '/';
        if (prefixFrom.some(pf => pf.prefix.startsWith(dp) || dp.startsWith(pf.prefix))) { addReason(t, `deleted ${ch}: closure still reads ${dp}`); mapped.add(ch); }
    }
}
const unmapped = changed.filter(ch => !mapped.has(ch));

let smoke = 0;
if (opt.smoke) {
    const sp = path.join(ROOT, 'tools/smoke-tests.json');
    if (fs.existsSync(sp)) for (const t of JSON.parse(fs.readFileSync(sp, 'utf8')).tests) if (fileSet.has(t) && !selected.has(t)) { addReason(t, 'smoke set'); smoke++; }
}
let out = [...selected].sort();
const deferred = [];
if (opt.tier === 'merge') {
    const sp = path.join(ROOT, 'tools/smoke-tests.json');
    const heavy = new Set(fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')).nightlyOnly ?? [] : []);
    // a heavy test that was itself changed is never deferred: changing it means running it
    out = out.filter(t => heavy.has(t) && !changedSet.has(t) ? (deferred.push(t), false) : true);
}
if (opt.perFile) for (const [f, n] of [...perFile].sort((a, b) => a[1] - b[1])) console.log(`${n}	${f}`);
if (opt.json) console.log(JSON.stringify({changed, selected: out, total: tests.length, reasons: Object.fromEntries(out.map(t => [t, reasons.get(t) ?? []])), deferred, unmapped}, null, 1));
else if (!opt.perFile) {
    for (const t of out) { console.log(t); if (opt.why) for (const r of reasons.get(t) ?? []) console.log(`# ${t}: ${r}`); }
    if (opt.why) for (const d of deferred) console.log(`# deferred to nightly/stage-close full run: ${d}`);
    if (opt.why) for (const u of unmapped) console.log(`# unmapped (no test depends on it): ${u}`);
}
console.error(`affected-tests: ${changed.length} changed files -> ${out.length}/${tests.length} tests selected (${smoke} added by smoke), ${deferred.length} deferred to nightly, ${unmapped.length} unmapped`);
