import fs from 'node:fs';
import path from 'node:path';
import { affectedTests, byteLineStarts, discoverTests, git, hash, isMain, isTest, normalizeEol, readMap, recordInvalidReason, slash, staticGraph, unique, worktreeContext } from './common.mjs';

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

function globalReason(change) {
  const file = change.file;
  if (file.startsWith('extension/')) return 'extension-contract';
  if (file.startsWith('world/')) return 'world-data';
  if (/(^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|\.nvmrc|\.node-version|\.tool-versions)$/.test(file)) return 'runtime-contract';
  if (/(?:^|[/_.-])(?:storage|ledger|engine|scheduler|dispatch|permission|permissions|private|privacy|scope|auth|schema|schemas|enum|enums|constants|contracts|registry|register|loader|load)(?:[/_.-]|$)/i.test(file)) return 'shared-contract';
  if (!/\.(?:mjs|js)$/.test(file)) return 'unsupported-data-or-format';
  if (/^[+-](?![+-]).*\b(?:export|import|register\w*|schema|enum)\b/m.test(change.patch || '')) return 'export-import-or-contract';
  if (/\b(?:import\s*\(|require\s*\(|createRequire\s*\(|readFile(?:Sync)?\s*\(|readdir(?:Sync)?\s*\(|register\w*\s*\(|Object\.freeze\s*\()/i.test(change.oldText || '')) return 'dynamic-loader-or-registry';
  return null;
}

// Only edits proven to stay inside existing low-risk bodies may exclude tests.
// Without an AST dependency, structural/call/closure edits deliberately stay full.
function editRisk(change, source) {
  if (change.patch === undefined) return 'unknown-edit-shape';
  const lines = change.patch.split(/\r?\n/).filter(line => /^[+-](?![+-])/.test(line)).map(line => line.slice(1));
  if (!lines.length) return 'unknown-edit-shape';
  if (lines.some(line => /[(){}[\]`/\\]|=>|\b(?:export|import|class|function|await|yield|eval|schema|enum|register\w*)\b/.test(line))) return 'structural-or-call-change';
  const shape = line => line.replace(/'[^']*'|"[^"]*"/g, 'STRING').replace(/\b\d+(?:\.\d+)?\b/g, 'NUMBER').replace(/\s+/g, ' ').trim();
  const removed = change.patch.split(/\r?\n/).filter(line => /^-(?!-)/.test(line)).map(line => shape(line.slice(1)));
  const added = change.patch.split(/\r?\n/).filter(line => /^\+(?!\+)/.test(line)).map(line => shape(line.slice(1)));
  if (JSON.stringify(removed) !== JSON.stringify(added)) return 'unproven-body-change';
  // The V8 range includes the declaration. Editing its line or closing line is
  // not a body-only change, even if a coverage range encloses those bytes.
  for (const hunk of change.hunks) {
    const range = lineBytes(change.oldText, hunk, source);
    const functions = coveringFunctions(source.functions, range);
    if (functions?.some(fn => range.start <= fn.start || range.end >= fn.end)) return 'function-boundary';
  }
  return null;
}

// Unified pure entry: both sets carry per-file reasons; `tests` is the set the
// caller must run under policy.mode. No filesystem or Git is needed by fixtures.
export function selectChanges(map, changes, { fallback = () => [], allTests = Object.keys(map?.tests || {}),
  mode = 'shadow', context = {}, mandatory = [], dependenciesUnknown = false } = {}) {
  if (!['shadow', 'prune'].includes(mode)) throw new Error(`Invalid selection mode: ${mode}`);
  allTests = unique([...allTests, ...mandatory, ...changes.filter(change => isTest(change.file) && change.kind !== 'deleted').map(change => change.file)]);
  const records = map?.tests || {}, sources = map?.sources || {};
  const conservative = new Map(), coverage = new Map();
  const add = (set, files, reason) => files.filter(file => allTests.includes(file)).forEach(file => {
    if (!set.has(file)) set.set(file, new Set());
    set.get(file).add(reason);
  });
  const both = (files, reason) => { add(coverage, files, reason); add(conservative, files, reason); };
  const uncollected = allTests.filter(file => !Object.hasOwn(records, file));
  for (const test of allTests) {
    const reason = ![1, 2].includes(map?.version) ? 'map-unavailable-or-unsupported' : recordInvalidReason(records[test], context);
    if (reason) both([test], reason);
  }
  both(mandatory, 'mandatory');
  both(['tests/engine.test.mjs', 'tests/storage.test.mjs', 'tests/plugin.test.mjs'], 'core');
  const decisions = [];
  for (const change of changes) {
    const source = sources[change.file];
    const staticTests = fallback(change.file);
    const oldConsumers = Object.entries(records).filter(([, record]) => Object.hasOwn(record?.dependencies || {}, change.file)).map(([file]) => file);
    const consumers = unique([...(source?.loadedBy || []), ...staticTests, ...oldConsumers]);
    add(conservative, consumers, `static-or-loader:${change.file}`);
    let reason = globalReason(change), full = !!reason;
    if (isTest(change.file)) { reason = 'test-file'; full = false; }
    else if (change.file.startsWith('tests/')) { reason = 'test-helper-or-fixture'; full = dependenciesUnknown || !consumers.length; }
    else if (reason) { /* shared contracts must not be pruned */ }
    else if (change.kind === 'added' || change.kind === 'deleted') reason = `${change.kind}-file`;
    else if (!source) reason = 'no-coverage';
    else if (source.stale) reason = 'mixed-source-snapshots';
    else if (change.stale) reason = 'source-changed-since-map';
    else if (source.hash !== hash(change.oldText) && source.normalizedHash !== hash(normalizeEol(change.oldText))) reason = 'source-offset-mismatch';
    else if (!change.hunks?.length) reason = 'no-aligned-hunks';
    else if (!Array.isArray(source.functions) || source.functions.some(fn => !Number.isFinite(fn.start) || !Number.isFinite(fn.end)
      || fn.start < 0 || fn.end > source.bytes || fn.start >= fn.end)) reason = 'invalid-function-offsets';
    const functions = new Set();
    if (!reason) for (const hunk of change.hunks) {
      const covered = coveringFunctions(source.functions, lineBytes(change.oldText, hunk, source));
      if (covered === null) { reason = 'top-level'; full = true; break; }
      covered.forEach(fn => functions.add(fn));
    }
    if (!reason) { reason = editRisk(change, source); full = !!reason; }
    let tests;
    if (reason) {
      tests = full ? allTests : unique([...consumers, ...(isTest(change.file) && change.kind !== 'deleted' ? [change.file] : [])]);
      if (!tests.length && !isTest(change.file)) { tests = allTests; reason += ':all-tests'; }
    } else {
      tests = unique([...functions].flatMap(fn => fn.tests));
      if (!tests.length || [...functions].some(fn => !fn.tests.length)) {
        reason = 'unexecuted-function';
        tests = consumers.length ? consumers : allTests;
      }
    }
    both(tests, `${reason || 'function-executor'}:${change.file}`);
    decisions.push({ file: change.file, mode: reason ? 'fallback' : 'functions', reason: reason || null,
      functions: [...functions].map(({ start, end, name }) => ({ start, end, name })), tests: tests.filter(file => allTests.includes(file)) });
  }
  const pack = set => ({ tests: unique([...set.keys()]), reasons: Object.fromEntries([...set].sort(([a], [b]) => a.localeCompare(b)).map(([file, reasons]) => [file, unique([...reasons])])) });
  const conservativeSet = pack(conservative), coverageSet = pack(coverage);
  const requiredFiles = unique([...mandatory, ...changes.filter(change => isTest(change.file) && change.kind !== 'deleted').map(change => change.file),
    ...['tests/engine.test.mjs', 'tests/storage.test.mjs', 'tests/plugin.test.mjs'].filter(file => allTests.includes(file))]);
  return { mode, generation: map?.generation ?? null, tests: (mode === 'prune' ? coverageSet : conservativeSet).tests,
    conservative: conservativeSet, coverage: coverageSet, requiredFiles,
    shadow: { omittedFiles: conservativeSet.tests.filter(file => !coverage.has(file)) }, uncollected, decisions };
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
    for (const commit of map?.sources?.[file]?.commits || [map?.commit]) {
      try {
        runGit(['merge-base', '--is-ancestor', commit, 'HEAD']);
        stale ||= Boolean(runGit(['log', '--format=%H', `${commit}..HEAD`, '--', file]).trim());
      } catch { stale = true; }
    }
    const diff = kind === 'modified' ? runGit(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=0', mergeBase, '--', file]) : '';
    return { file: slash(file), kind, oldText: oldText ?? '', stale, patch: diff, hunks: parseHunks(diff) };
  });
}

export function main(args = process.argv.slice(2), injected = {}) {
  const [worktree, base, ...rest] = args;
  if (!worktree || !base) throw new Error('Usage: select.mjs <worktree> <base> [--map file] [--json]');
  let mapFile, json = false, policyFile;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--map' && rest[i + 1]) mapFile = rest[++i];
    else if (rest[i] === '--policy' && rest[i + 1]) policyFile = rest[++i];
    else if (rest[i] === '--json') json = true;
    else throw new Error(`Unknown or incomplete option: ${rest[i]}`);
  }
  const root = path.resolve(worktree);
  const runGit = injected.git ?? (args => git(root, args));
  mapFile = path.resolve(mapFile || path.join(root, 'test-impact-map.json'));
  let map;
  try { map = readMap(mapFile); } catch { map = { version: 0, tests: {}, sources: {} }; }
  if (![1, 2].includes(map?.version) || !map.tests || !map.sources)
    map = { version: 0, tests: {}, sources: {} };
  // Missing or malformed policy cannot enable pruning.
  let mode = 'shadow';
  try {
    const policy = JSON.parse(fs.readFileSync(policyFile || new URL('../policy/selection.json', import.meta.url), 'utf8'));
    if (policy.mode === 'prune') mode = 'prune';
  } catch { /* default shadow */ }
  // The generated map is tool metadata, not a source/test change.
  const changes = discoverChanges(root, base, map, runGit).filter(change => {
    const absolute = path.resolve(root, change.file);
    return absolute !== mapFile && !absolute.startsWith(`${mapFile}.shards${path.sep}`)
      && !absolute.startsWith(`${mapFile}.generations${path.sep}`) && absolute !== `${mapFile}.events.jsonl`;
  });
  const graph = staticGraph(root);
  const result = selectChanges(map, changes, {
    fallback: file => affectedTests(root, [file], graph), allTests: discoverTests(root),
    context: worktreeContext(root, mapFile, runGit), mode, dependenciesUnknown: graph.unknown.size > 0,
  });
  const log = injected.log ?? console.log;
  if (json) log(JSON.stringify(result, null, 2));
  else {
    if (result.tests.length) log(result.tests.join('\n'));
    if (result.uncollected.length) console.error(`[fallback] uncollected-tests: ${result.uncollected.length} tests`);
    for (const decision of result.decisions) if (decision.mode === 'fallback')
      console.error(`[fallback] ${decision.file}: ${decision.reason} (${decision.tests.length} tests)`);
  }
  return result;
}

if (isMain(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
