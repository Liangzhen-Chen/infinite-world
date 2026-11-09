#!/usr/bin/env node
// build-smoke-set: derive tools/smoke-tests.json (+ the nightly-only list) from gate full-run logs.
// Usage: node tools/build-smoke-set.mjs <full.full> [<full.full> ...] > tools/smoke-tests.json
// Input lines: `tests/x.test.mjs pass=N fail=N exit=N secs=N` (`#` lines ignored). Several logs may be given;
// a test must qualify in ALL of them that contain it.
//
// SMOKE: a test qualifies when it passed (exit=0) and took <= SMOKE_MAX_SECS in every log. Tests are grouped
//   into families by the first '-'-separated token of the file name (a3, s5, magic, npc, w2 ...; a file
//   without '-' is its own family). From each family the SMOKE_PER_FAMILY qualifying tests with the most
//   passing sub-tests per second are taken (breadth per cost), so every subsystem the repo names is
//   represented. Deterministic: ties break by file name.
// NIGHTLY-ONLY ("heavy"): a test that timed out (exit=124) or took >= HEAVY_SECS in any log. Merge-tier
//   runs defer these to the nightly/stage-close full run (affected-tests.mjs --tier merge lists what it deferred).
import fs from 'node:fs';

const SMOKE_MAX_SECS = 60, SMOKE_PER_FAMILY = 2, HEAVY_SECS = 1000;
const logs = process.argv.slice(2).map(f => {
    const rows = new Map();
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        const m = line.match(/^(tests\/\S+)\s+pass=(\S+)\s+fail=(\S+)\s+exit=(\d+)\s+secs=(\d+)/);
        if (m) rows.set(m[1], {pass: Number(m[2]) || 0, exit: Number(m[4]), secs: Number(m[5])});
    }
    return rows;
});
const names = [...new Set(logs.flatMap(l => [...l.keys()]))].filter(n => /^tests\/[^/]+\.test\.mjs$/.test(n)).sort();
const family = n => { const b = n.replace(/^tests\//, '').replace(/\.test\.mjs$/, ''); return b.includes('-') ? b.split('-')[0] : b; };
const stat = n => logs.map(l => l.get(n)).filter(Boolean);
const smokeCandidates = names.filter(n => { const s = stat(n); return s.length && s.every(r => r.exit === 0 && r.secs <= SMOKE_MAX_SECS && r.pass > 0); });
const byFamily = new Map();
for (const n of smokeCandidates) { const f = family(n); if (!byFamily.has(f)) byFamily.set(f, []); byFamily.get(f).push(n); }
const score = n => { const s = stat(n); return Math.min(...s.map(r => r.pass / Math.max(r.secs, 1))); };
const smoke = [];
for (const [, list] of [...byFamily].sort((a, b) => a[0].localeCompare(b[0]))) smoke.push(...list.sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, SMOKE_PER_FAMILY));
smoke.sort();
const worst = n => Math.max(...stat(n).map(r => r.secs));
const heavy = names.filter(n => stat(n).some(r => r.exit === 124 || r.secs >= HEAVY_SECS));
console.log(JSON.stringify({
    basis: {smokeMaxSecs: SMOKE_MAX_SECS, perFamily: SMOKE_PER_FAMILY, heavySecs: HEAVY_SECS, logs: process.argv.slice(2),
        smokeSecsTotal: smoke.reduce((a, n) => a + worst(n), 0), smokeCount: smoke.length, families: byFamily.size,
        nightlyOnlySecsTotal: heavy.reduce((a, n) => a + Math.max(...stat(n).map(r => r.secs)), 0)},
    tests: smoke,
    nightlyOnly: heavy
}, null, 1));
