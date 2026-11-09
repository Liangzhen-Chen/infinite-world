#!/usr/bin/env node
// perf-sentinel: per-file timing regression check between two full-run logs (format of full.full:
// `tests/x.test.mjs pass= fail= exit= secs=`). Usage: node tools/perf-sentinel.mjs <baseline.full> <current.full>
// Flags: NEW-TIMEOUT (exit=124 now, not before), SLOWER (secs > 3x baseline and >= 60 s now),
// RECOVERED (baseline timed out, now finished). Exit code 1 if any NEW-TIMEOUT or SLOWER, else 0.
// Files missing from either log are listed as ONLY-BASE / ONLY-CURRENT (informational).
import fs from 'node:fs';
const read = f => {
    const m = new Map();
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        const x = line.match(/^(tests\/\S+)\s+pass=(\S+)\s+fail=(\S+)\s+exit=(\d+)\s+secs=(\d+)/);
        if (x) m.set(x[1], {exit: Number(x[4]), secs: Number(x[5])});
    }
    return m;
};
const [bf, cf] = process.argv.slice(2);
if (!bf || !cf) { console.error('usage: perf-sentinel.mjs <baseline.full> <current.full>'); process.exit(2); }
const base = read(bf), cur = read(cf);
let bad = 0;
for (const [t, c] of [...cur].sort()) {
    const b = base.get(t);
    if (!b) { console.log(`ONLY-CURRENT\t${t}\t${c.secs}s`); continue; }
    if (c.exit === 124 && b.exit !== 124) { console.log(`NEW-TIMEOUT\t${t}\t${b.secs}s -> timeout(${c.secs}s)`); bad++; }
    else if (b.exit === 124 && c.exit !== 124) console.log(`RECOVERED\t${t}\ttimeout -> ${c.secs}s`);
    else if (c.exit !== 124 && c.secs >= 60 && c.secs > 3 * b.secs) { console.log(`SLOWER\t${t}\t${b.secs}s -> ${c.secs}s (x${(c.secs / Math.max(b.secs, 1)).toFixed(1)})`); bad++; }
}
for (const t of [...base.keys()].sort()) if (!cur.has(t)) console.log(`ONLY-BASE\t${t}`);
console.error(`perf-sentinel: ${bad} regression(s)`);
process.exit(bad ? 1 : 0);
