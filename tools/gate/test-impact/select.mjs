import fs from 'node:fs';
import path from 'node:path';
import { affectedTests, byteLineStarts, git, hash, isMain, isTest, normalizeEol, slash, unique, walk } from './common.mjs';

export function parseHunks(diff) {
  return [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)]
    .map(match => ({ startLine: Number(match[1]), lineCount: match[2] === undefined ? 1 : Number(match[2]) }));
}

export function lineBytes(text, { startLine, lineCount }, source) {
  // Git blobs may use LF while V8 saw CRLF (core.autocrlf=true on this host).
  // Hunk line numbers refer to both, but byte offsets must use V8's snapshot.
  const starts = source?.lineStarts || byteLineStarts(text);
  const bytes = source?.bytes ?? Buffer.byteLength(text);
  // A zero-length old range means insertion AFTER startLine (git's convention).
  const index = lineCount === 0 ? startLine : Math.max(0, startLine - 1);
  return { start: starts[index] ?? bytes,
    end: lineCount === 0 ? starts[index] ?? bytes : starts[index + lineCount] ?? bytes };
}

function coveringFunctions(functions, range) {
  const candidates = functions.filter(fn => range.start === range.end
    ? fn.start <= range.start && range.start < fn.end
    : fn.start < range.end && range.start < fn.end);
  const points = unique([range.start, range.end, ...candidates.flatMap(fn => [Math.max(range.start, fn.start), Math.min(range.end, fn.end)])])
    .map(Number).sort((a, b) => a - b);
  const selected = new Set();
  for (let i = 0; i < Math.max(1, points.length - 1); i++) {
    const start = points[i], end = points[i + 1] ?? start;
    const containing = candidates.filter(fn => fn.start <= start && (end === start ? start < fn.end : end <= fn.end))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    if (!containing.length) return null; // Some changed bytes belong to top level.
    selected.add(containing[0]); // Nested functions belong to their own executors.
  }
  return [...selected];
}

// Pure selection core. Git and filesystem discovery are separate so fixtures do
// not need subprocesses. fallback(file) is the legacy reverse-import closure.
export function selectChanges(map, changes, { fallback = () => [], allTests = Object.keys(map.tests) } = {}) {
  if (map.version !== 1) throw new Error('Unsupported coverage map version');
  const selected = new Set(Object.entries(map.tests).filter(([, record]) => record.exitCode !== 0).map(([file]) => file));
  // A partial initial collection has no evidence about the remaining tests.
  // Likewise a test committed after collection may be outside the current diff.
  const uncollected = changes.length ? allTests.filter(file => !Object.hasOwn(map.tests, file)) : [];
  uncollected.forEach(file => selected.add(file));
  const decisions = [];
  for (const change of changes) {
    const source = map.sources[change.file];
    let reason;
    if (change.kind === 'added' || change.kind === 'deleted') reason = `${change.kind}-file`;
    else if (isTest(change.file)) reason = 'test-file';
    else if (change.file.startsWith('world/')) reason = 'world-data';
    else if (!source) reason = 'no-coverage';
    else if (source.stale) reason = 'mixed-source-snapshots';
    else if (change.stale) reason = 'source-changed-since-map';
    else if (source.hash !== hash(change.oldText) && source.normalizedHash !== hash(normalizeEol(change.oldText))) reason = 'source-offset-mismatch';
    else if (!change.hunks.length) reason = 'no-aligned-hunks';
    else if (source.functions.some(fn => fn.start < 0 || fn.end > source.bytes || fn.start >= fn.end)) reason = 'invalid-function-offsets';
    const functions = new Set();
    if (!reason) for (const hunk of change.hunks) {
      const covered = coveringFunctions(source.functions, lineBytes(change.oldText, hunk, source));
      if (covered === null) { reason = 'top-level'; break; }
      covered.forEach(fn => functions.add(fn));
    }
    let tests;
    if (reason) {
      const loaded = source?.loadedBy || [];
      // Data is read at runtime and is intentionally outside V8's source map.
      const legacy = !loaded.length || change.file.startsWith('world/') || isTest(change.file) ? fallback(change.file) : [];
      tests = unique([...loaded, ...legacy, ...(isTest(change.file) && change.kind !== 'deleted' ? [change.file] : [])]);
      if (!tests.length && !isTest(change.file)) { tests = unique(allTests); reason += ':all-tests'; }
    } else tests = unique([...functions].flatMap(fn => fn.tests));
    tests.forEach(test => selected.add(test));
    decisions.push({ file: change.file, mode: reason ? 'fallback' : 'functions', reason: reason || null,
      functions: reason ? [] : [...functions].map(({ start, end, name }) => ({ start, end, name })), tests });
  }
  return { tests: unique([...selected]), uncollected: unique(uncollected), decisions };
}

export function discoverChanges(root, base, map, runGit = args => git(root, args)) {
  const mergeBase = runGit(['merge-base', base, 'HEAD']).trim();
  const names = unique([
    ...runGit(['diff', '--name-only', '-z', '--no-renames', `${base}...HEAD`, '--']).split('\0'),
    ...runGit(['diff', '--name-only', '-z', '--no-renames', 'HEAD', '--']).split('\0'),
    ...runGit(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean));
  return names.map(file => {
    // Never inspect secret contents, even if a caller accidentally tracks one.
    if (/^SillyTavern\/data\/[^/]+\/secrets\.json$/.test(slash(file)))
      return { file: slash(file), kind: 'modified', oldText: '', stale: true, hunks: [] };
    let oldText;
    try { oldText = runGit(['show', `${mergeBase}:${file}`]); } catch { oldText = undefined; }
    const exists = fs.existsSync(path.join(root, file));
    const kind = oldText === undefined ? 'added' : exists ? 'modified' : 'deleted';
    let stale = false;
    for (const commit of map.sources[file]?.commits || [map.commit]) {
      try {
        runGit(['merge-base', '--is-ancestor', commit, 'HEAD']);
        stale ||= Boolean(runGit(['log', '--format=%H', `${commit}..HEAD`, '--', file]).trim());
      } catch { stale = true; }
    }
    const diff = kind === 'modified' ? runGit(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=0', mergeBase, '--', file]) : '';
    return { file: slash(file), kind, oldText: oldText ?? '', stale, hunks: parseHunks(diff) };
  });
}

export function main(args = process.argv.slice(2)) {
  const [worktree, base, ...rest] = args;
  if (!worktree || !base) throw new Error('Usage: select.mjs <worktree> <base> [--map file] [--json]');
  let mapFile, json = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--map' && rest[i + 1]) mapFile = rest[++i];
    else if (rest[i] === '--json') json = true;
    else throw new Error(`Unknown or incomplete option: ${rest[i]}`);
  }
  const root = path.resolve(worktree);
  mapFile = path.resolve(mapFile || path.join(root, 'test-impact-map.json'));
  const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  // The generated map is tool metadata, not a source/test change.
  const changes = discoverChanges(root, base, map).filter(change => path.resolve(root, change.file) !== mapFile);
  const result = selectChanges(map, changes, {
    fallback: file => affectedTests(root, [file]), allTests: unique([...Object.keys(map.tests), ...walk(root, 'tests').filter(isTest)]),
  });
  result.tests = result.tests.filter(file => fs.existsSync(path.join(root, file)));
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    if (result.tests.length) console.log(result.tests.join('\n'));
    if (result.uncollected.length) console.error(`[fallback] uncollected-tests: ${result.uncollected.length} tests`);
    for (const decision of result.decisions) if (decision.mode === 'fallback')
      console.error(`[fallback] ${decision.file}: ${decision.reason} (${decision.tests.length} tests)`);
  }
}

if (isMain(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
