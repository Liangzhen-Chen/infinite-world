// node:test custom reporter -> JSONL, one event per line, written synchronously
// to the file named by GATE_EVENTS_FILE so events survive process.exit()/crashes.
// Verified against Node v24 event shapes (test:start/pass/fail/diagnostic/summary).
// Usage: node --test --test-reporter=<this file> --test-reporter-destination=stderr ...
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const out = process.env.GATE_EVENTS_FILE;
const emit = event => { if (out) fs.appendFileSync(out, `${JSON.stringify(event)}\n`); };
const cut = (text, max = 200) => (text.length > max ? `${text.slice(0, max)}...(${text.length})` : text);
const show = value => { try { return cut(util.inspect(value, { depth: 2, breakLength: Infinity })); } catch { return '?'; } };

// Deterministic serialisation for fingerprints: sorted keys, cycles, undefined, BigInt,
// Map/Set, Date, NaN, symbols and functions are all distinguishable. No depth or length cut.
export function stableSerialize(value, seen = new WeakSet()) {
  switch (typeof value) {
    case 'undefined': return '"~undefined"';
    case 'bigint': return `"~bigint:${value}"`;
    case 'symbol': return `"~symbol:${String(value.description)}"`;
    case 'function': return `"~function:${value.name}"`;
    case 'number': return Number.isFinite(value) ? (Object.is(value, -0) ? '"~-0"' : String(value)) : `"~num:${value}"`;
    case 'string': case 'boolean': return JSON.stringify(value);
    default:
  }
  if (value === null) return 'null';
  if (seen.has(value)) return '"~circular"';
  seen.add(value);
  try {
    if (value instanceof Date) return `"~date:${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}"`;
    if (value instanceof RegExp) return `"~regexp:${value}"`;
    if (value instanceof Error) return `{"~error":${stableSerialize({ name: value.name, message: value.message, code: value.code }, seen)}}`;
    if (ArrayBuffer.isView(value)) return `{"~typed:${value.constructor.name}":[${Array.from(value, item => stableSerialize(item, seen)).join(',')}]}`;
    if (Array.isArray(value)) return `[${Array.from(value, item => stableSerialize(item, seen)).join(',')}]`;
    if (value instanceof Map) return `{"~map":[${[...value].map(([k, v]) => `[${stableSerialize(k, seen)},${stableSerialize(v, seen)}]`).sort().join(',')}]}`;
    if (value instanceof Set) return `{"~set":[${[...value].map(item => stableSerialize(item, seen)).sort().join(',')}]}`;
    const proto = Object.getPrototypeOf(value);
    const tag = proto && proto !== Object.prototype ? `"~class:${proto.constructor?.name}",` : '';
    return `{${tag}${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key], seen)}`).join(',')}}`;
  } finally { seen.delete(value); }
}
const digest = value => crypto.createHash('sha1').update(stableSerialize(value)).digest('hex').slice(0, 16);

// First non-internal stack frame: absolute file, line, col.
export function stackFrame(stack) {
  for (const line of String(stack || '').split('\n')) {
    const match = /\(?((?:file:\/\/\/?)?[^()\s]+?):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!match || /^node:|node_modules/.test(match[1])) continue;
    let file = match[1];
    if (file.startsWith('file://')) { try { file = fileURLToPath(file); } catch { /* keep raw */ } }
    return { file, line: Number(match[2]), col: Number(match[3]) };
  }
  return null;
}

export function stackLocation(stack, cwd = process.cwd()) {
  const frame = stackFrame(stack);
  return frame ? `${path.relative(cwd, frame.file).split(path.sep).join('/')}:${frame.line}:${frame.col}` : null;
}

// Line-number-free anchor of the assertion call: hash of its source line text plus how many
// identical lines precede it in the file. Moving the whole assertion up/down keeps the anchor.
export function assertionAnchor(frame, readSource = file => fs.readFileSync(file, 'utf8')) {
  try {
    const lines = readSource(frame.file).split(/\r?\n/);
    const text = (lines[frame.line - 1] ?? '').trim();
    if (!text) return null;
    const ordinal = lines.slice(0, frame.line - 1).filter(line => line.trim() === text).length;
    return `${crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)}#${ordinal}`;
  } catch { return null; }
}

export function errorInfo(error, cwd = process.cwd()) {
  if (!error) return undefined;
  const cause = error.cause && typeof error.cause === 'object' ? error.cause : null;
  const stack = String(cause?.stack ?? error.stack ?? '');
  const frame = stackFrame(stack) ?? stackFrame(error.stack);
  const info = {
    code: error.code ?? null, failureType: error.failureType ?? null, causeCode: cause?.code ?? null,
    name: cause?.name ?? error.name ?? null, operator: cause?.operator ?? null,
    // loc has line numbers and is for humans; locFile + anchor feed the fingerprint.
    loc: frame ? `${path.relative(cwd, frame.file).split(path.sep).join('/')}:${frame.line}:${frame.col}` : null,
    locFile: frame ? path.relative(cwd, frame.file).split(path.sep).join('/') : null,
    anchor: frame ? assertionAnchor(frame) : null,
    // Last 30 lines of the failure only; never the whole log.
    detail: cut(stack.split('\n').slice(-30).join('\n'), 4000),
  };
  if (cause && ('actual' in cause || 'expected' in cause)) {
    info.actual = show(cause.actual); info.expected = show(cause.expected); // display only
    info.actualFp = digest(cause.actual); info.expectedFp = digest(cause.expected);
  }
  return info;
}

// Written at module load, before any test file runs, so a crashing file still leaves proof the reporter was active.
emit({ t: 'hello', v: 1, node: process.version });

export default async function* gateReporter(source) {
  for await (const { type, data } of source) {
    const at = { n: data.nesting, name: data.name, line: data.line, col: data.column,
      // Node reports a test-less (or un-importable) file as one pseudo test named after the file, with no line.
      ...(data.line === undefined ? { fileLevel: true } : {}) };
    if (type === 'test:start') emit({ t: 'start', ...at, file: data.file });
    else if (type === 'test:pass' || type === 'test:fail') {
      const failed = type === 'test:fail';
      emit({ t: failed ? 'fail' : 'pass', ...at, kind: data.details?.type ?? 'test', ms: data.details?.duration_ms,
        ...(data.skip ? { skip: true } : {}), ...(data.todo ? { todo: true } : {}),
        ...(failed ? { err: errorInfo(data.details?.error) } : {}) });
    } else if (type === 'test:diagnostic') emit({ t: 'diag', message: data.message });
    else if (type === 'test:summary') emit({ t: 'summary', success: data.success, counts: data.counts, ms: data.duration_ms });
  }
}
