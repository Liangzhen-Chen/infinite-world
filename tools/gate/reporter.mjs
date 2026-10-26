// node:test custom reporter -> JSONL, one event per line, written synchronously
// to the file named by GATE_EVENTS_FILE so events survive process.exit()/crashes.
// Verified against Node v24 event shapes (test:start/pass/fail/diagnostic/summary).
// Usage: node --test --test-reporter=<this file> --test-reporter-destination=stderr ...
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const out = process.env.GATE_EVENTS_FILE;
const emit = event => { if (out) fs.appendFileSync(out, `${JSON.stringify(event)}\n`); };
const cut = (text, max = 200) => (text.length > max ? `${text.slice(0, max)}...(${text.length})` : text);
const show = value => { try { return cut(util.inspect(value, { depth: 2, breakLength: Infinity })); } catch { return '?'; } };

// First stack frame that is not node internals / node_modules, as relative path:line:col.
export function stackLocation(stack, cwd = process.cwd()) {
  for (const line of String(stack || '').split('\n')) {
    const match = /\(?((?:file:\/\/\/?)?[^()\s]+?):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!match || /^node:|node_modules/.test(match[1])) continue;
    let file = match[1];
    if (file.startsWith('file://')) { try { file = fileURLToPath(file); } catch { /* keep raw */ } }
    return `${path.relative(cwd, file).split(path.sep).join('/')}:${match[2]}:${match[3]}`;
  }
  return null;
}

export function errorInfo(error, cwd = process.cwd()) {
  if (!error) return undefined;
  const cause = error.cause && typeof error.cause === 'object' ? error.cause : null;
  const stack = String(cause?.stack ?? error.stack ?? '');
  const info = {
    code: error.code ?? null, failureType: error.failureType ?? null, causeCode: cause?.code ?? null,
    name: cause?.name ?? error.name ?? null, operator: cause?.operator ?? null,
    loc: stackLocation(stack, cwd) ?? stackLocation(error.stack, cwd),
    // Last 30 lines of the failure only; never the whole log.
    detail: cut(stack.split('\n').slice(-30).join('\n'), 4000),
  };
  if (cause && ('actual' in cause || 'expected' in cause)) { info.actual = show(cause.actual); info.expected = show(cause.expected); }
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
