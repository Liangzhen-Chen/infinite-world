#!/usr/bin/env node
// perf-sentinel: per-file timing regression check between two full-run logs (format of full.full:
// `tests/x.test.mjs pass= fail= exit= secs=`, closing `FINISHED` line).
// Usage: node tools/perf-sentinel.mjs <baseline.full> <current.full>
// Flags: NEW-TIMEOUT (exit=124 now, not before), SLOWER (secs > 3x baseline and >= 60 s now),
// RECOVERED (baseline timed out, now finished), BASE-FAILED (baseline failed fast: exit!=0 and < 60 s; not judged).
// Exit code 1 when: any NEW-TIMEOUT or SLOWER; the current log is empty or has no FINISHED line (truncated);
// or the current log lacks a file present in the baseline (MISSING-CURRENT). Files only in the current log are
// informational (ONLY-CURRENT).
import fs from 'node:fs';
const finished = new Set();
const read = f => {
    const text = fs.readFileSync(f, 'utf8'), m = new Map();
    if (/^FINISHED\s*$/m.test(text)) finished.add(f);
    for (const line of text.split('\n')) {
        const x = line.match(/^(tests\/\S+)\s+pass=(\S+)\s+fail=(\S+)\s+exit=(\d+)\s+secs=(\d+)/);
        if (x) m.set(x[1], {exit: Number(x[4]), secs: Number(x[5])});
    }
    return m;
};
const [bf, cf] = process.argv.slice(2);
if (!bf || !cf) { console.error('usage: perf-sentinel.mjs <baseline.full> <current.full>'); process.exit(2); }
const base = read(bf), cur = read(cf);
let bad = 0;
const say = (tag, ...rest) => console.log([tag, ...rest].join('\t'));
if (!cur.size) { say('EMPTY-CURRENT', 'no result rows'); bad++; }
if (!finished.has(cf)) { say('NO-FINISHED', 'current log has no FINISHED line (truncated?)'); bad++; }
for (const [t, c] of [...cur].sort()) {
    const b = base.get(t);
    if (!b) { say('ONLY-CURRENT', t, `${c.secs}s`); continue; }
    if (b.exit !== 0 && b.exit !== 124 && b.secs < 60) { say('BASE-FAILED', t, `baseline exit=${b.exit} in ${b.secs}s (not judged)`); continue; }
    if (c.exit === 124 && b.exit !== 124) { say('NEW-TIMEOUT', t, `${b.secs}s -> timeout(${c.secs}s)`); bad++; }
    else if (b.exit === 124 && c.exit !== 124) say('RECOVERED', t, `timeout -> ${c.secs}s`);
    else if (c.exit !== 124 && c.secs >= 60 && c.secs > 3 * b.secs) { say('SLOWER', t, `${b.secs}s -> ${c.secs}s (x${(c.secs / Math.max(b.secs, 1)).toFixed(1)})`); bad++; }
}
for (const t of [...base.keys()].sort()) if (!cur.has(t)) { say('MISSING-CURRENT', t); bad++; }
console.error(`perf-sentinel: ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
