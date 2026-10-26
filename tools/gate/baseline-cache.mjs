// Per-(base SHA, file) cache of terminal baseline results, shared by all cards on the same base (DESIGN §14).
// Only the FIRST baseline run may use it; the -Rerun that proves reproducibility is always fresh.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeferredOnly } from './verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Tool fingerprint: runner + verdict sources and the node version. A new tool release or node means a fresh cache.
export const toolFingerprint = () => {
  const h = crypto.createHash('sha1').update(process.version);
  for (const f of ['runner.mjs', 'verdict.mjs']) { try { h.update(fs.readFileSync(path.join(HERE, f))); } catch { h.update(f); } }
  return h.digest('hex').slice(0, 12);
};
const FP = toolFingerprint();

const entryFile = (root, baseSHA, file) => path.join(root, 'baseline-cache', baseSHA,
  `${file.replace(/[^\w.-]+/g, '_').slice(-80)}.${crypto.createHash('sha1').update(`${file}|${FP}`).digest('hex').slice(0, 8)}.json`);

// Terminal PASS/FAIL or deferred-only (PASS with pre-existing todo/skip, full deferred evidence), and only with the
// runner's full detail (merged result file carries runId). INCOMPLETE/TIMEOUT/CRASH are never cached.
export const cacheable = f => !!f && !!f.runId && (f.status === 'PASS' || f.status === 'FAIL' || isDeferredOnly(f));

export function readCached(root, baseSHA, file) {
  if (!baseSHA) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(entryFile(root, baseSHA, file), 'utf8'));
    return entry?.baseSHA === baseSHA && entry.fingerprint === FP && entry.result?.file === file && cacheable(entry.result) ? entry.result : null;
  } catch { return null; }
}

export function writeCached(root, baseSHA, result) {
  if (!baseSHA || !cacheable(result)) return false;
  const target = entryFile(root, baseSHA, result.file), temp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify({ baseSHA, fingerprint: FP, cachedAt: new Date().toISOString(), result }));
    fs.renameSync(temp, target);
    return true;
  } catch { try { fs.rmSync(temp, { force: true }); } catch { /* best effort */ } return false; }
}

// Split files into cache hits and misses (hits keep their original runId so independence stays honest).
export function splitCached(root, baseSHA, files) {
  const hits = [], misses = [];
  for (const file of files) { const hit = readCached(root, baseSHA, file); (hit ? hits : misses).push(hit || file); }
  return { hits, misses };
}

// Merge cache hits with a fresh run (null when everything hit) into one baseline run record.
export function mergeBaseline(baseSHA, files, hits, fresh) {
  const byFile = new Map([...hits, ...(fresh?.files || [])].map(f => [f.file, f]));
  const merged = files.map(file => byFile.get(file));
  const all = merged.map(f => f.status);
  const status = all.every(s => s === 'PASS') && (!fresh || fresh.status === 'PASS') ? 'PASS'
    : fresh && !['PASS', 'FAIL'].includes(fresh.status) ? fresh.status : all.includes('FAIL') ? 'FAIL' : 'INCOMPLETE';
  return { ...(fresh || {}), status, runId: fresh?.runId ?? `cache-${baseSHA.slice(0, 12)}`, files: merged, cached: hits.map(h => h.file) };
}
