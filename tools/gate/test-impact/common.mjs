import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const slash = value => value.replaceAll('\\', '/');
export const hash = text => createHash('sha256').update(text).digest('hex');
export const normalizeEol = text => text.replaceAll('\r\n', '\n');
export function byteLineStarts(text) {
  const lines = text.split('\n'), starts = [0];
  for (let i = 0; i < lines.length - 1; i++) starts.push(starts.at(-1) + Buffer.byteLength(lines[i]) + 1);
  return starts;
}
export const isTest = file => /^(?:tests\/|tools\/.*\/(?:test|tests)\/).*\.test\.mjs$/.test(file)
  && !file.split('/').some(part => ['fixtures', 'fixture'].includes(part));
export const unique = values => [...new Set(values)].sort();
export const isMain = url => process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
export function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
export function walk(root, dir) {
  const result = [];
  if (!fs.existsSync(path.join(root, dir))) return result;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'SillyTavern'].includes(entry.name)) continue;
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...walk(root, file));
    else result.push(file);
  }
  return result;
}

export const discoverTests = root => unique(['tests', 'tools'].flatMap(dir => walk(root, dir)).filter(isTest));

// Same roots and reverse-import closure as affected-tests.mjs. Side-effect imports
// and JSON imports are also included, since they are real loading dependencies.
export function staticGraph(root) {
  const files = ['server-plugin', 'extension', 'tools', 'tests', 'world', 'compat']
    .flatMap(dir => walk(root, dir)).filter(file => /\.(mjs|js)$/.test(file));
  const importers = new Map();
  const dependencies = new Map(), unknown = new Set();
  const re = /(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const targets = new Set();
    // Dynamic reads and imports cannot be enumerated safely by this small graph.
    // Literal JSON reads are indexed below; unknown reads remain explicit.
    if ([...source.matchAll(/\bimport\s*\(\s*([^)]*)/g)].some(match => !/^['"][^'"]+['"]\s*$/.test(match[1]))
      || /\b(?:readFileSync|readFile|readdirSync|readdir|require|createRequire)\s*\(/.test(source)) unknown.add(file);
    for (const match of source.matchAll(re)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1] || match[2]));
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
      targets.add(target);
    }
    for (const match of source.matchAll(/\b(?:readFileSync|readFile)\s*\(\s*['"]([^'"]+\.json)['"]/g)) {
      // Relative fs paths can be relative to cwd or to a module wrapper. Include both.
      for (const target of [path.posix.normalize(match[1]), path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))]) {
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(file); targets.add(target);
      }
    }
    dependencies.set(file, targets);
  }
  return { importers, dependencies, unknown };
}

export function affectedTests(root, changed, graph = staticGraph(root)) {
  const { importers } = graph;
  const seen = new Set(changed), queue = [...changed];
  while (queue.length) for (const importer of importers.get(queue.pop()) || []) {
    if (!seen.has(importer)) { seen.add(importer); queue.push(importer); }
  }
  return unique([...seen].filter(file => isTest(file) && fs.existsSync(path.join(root, file))));
}

export const TTL_MS = 24 * 60 * 60 * 1000;
export function lockHash(root) {
  return hash(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].map(file =>
    `${file}:${fs.existsSync(path.join(root, file)) ? hash(fs.readFileSync(path.join(root, file))) : 'missing'}`).join('\n'));
}

export function worktreeContext(root, mapFile, runGit = args => git(root, args)) {
  const generated = mapFile ? slash(path.relative(root, mapFile)) : null;
  const paths = unique([...runGit(['diff', '--name-only', '-z', 'HEAD', '--']).split('\0'),
    ...runGit(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean));
  const dirty = paths.some(file => !generated || !(file === generated || file.startsWith(`${generated}.shards/`)
    || file.startsWith(`${generated}.generations/`) || file === `${generated}.events.jsonl`));
  return { head: runGit(['rev-parse', 'HEAD']).trim(), dirty, nodeVersion: process.version, lockHash: lockHash(root),
    dependencyHash: file => {
      try { return hash(fs.readFileSync(path.join(root, file))); } catch { return null; }
    } };
}

export function recordInvalidReason(record, context = {}, { forResume = false } = {}) {
  if (!record) return 'uncollected';
  if (record.exitCode !== 0 || record.unavailable || record.partialCoverage || (record.status && record.status !== 'PASS')) return 'failed-collection';
  const collected = Date.parse(record.collectedAt), now = context.now ?? Date.now();
  if (!Number.isFinite(collected) || collected > now || now - collected >= TTL_MS) return 'record-expired';
  if (!record.nodeVersion || record.nodeVersion !== (context.nodeVersion ?? process.version)) return 'node-version';
  if (!record.lockHash || record.lockHash !== context.lockHash) return 'lock-hash';
  if (record.dirty || (context.dirty && record.commit === context.head)) return 'dirty-snapshot';
  if (!record.dependencies || (record.dependenciesUnknown && !forResume)) return 'unknown-dependencies';
  if (context.dependencyHash && Object.entries(record.dependencies).some(([file, digest]) => context.dependencyHash(file) !== digest))
    return 'test-dependency-changed';
  return null;
}

export function dependencySnapshot(root, test, graph = staticGraph(root)) {
  const seen = new Set([test]), queue = [test];
  let dependenciesUnknown = false;
  while (queue.length) {
    const file = queue.pop();
    dependenciesUnknown ||= graph.unknown.has(file);
    for (const dependency of graph.dependencies.get(file) || []) if (!seen.has(dependency)) {
      seen.add(dependency); queue.push(dependency);
    }
  }
  // Source functions have their own offsets/hash lifecycle. Test/helper/fixture
  // identity must also survive changes outside the candidate's current diff.
  const dependencies = Object.fromEntries([...seen].filter(file => file === test || !/\.(?:mjs|js)$/.test(file)
    || /(?:^|[/_.-])(?:test|tests|fixture|fixtures|helper|helpers)(?:[/_.-]|$)/.test(file))
    .map(file => [file, fs.existsSync(path.join(root, file)) ? hash(fs.readFileSync(path.join(root, file))) : null]));
  return { dependencies, dependenciesUnknown };
}

export function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, text); fs.renameSync(temp, file); }
  finally { fs.rmSync(temp, { force: true }); }
}

// A reader resolves the pointer exactly once. Its generation stays immutable
// even when another writer publishes while this reader is working.
export function readMap(file, { afterPin } = {}) {
  const pointer = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!pointer.generationFile) return pointer; // legacy maps stay readable
  afterPin?.(pointer);
  const directory = path.resolve(`${file}.generations`);
  const target = path.resolve(path.dirname(file), pointer.generationFile);
  if (path.dirname(target) !== directory) throw new Error('Map generation outside generation directory');
  const text = fs.readFileSync(target, 'utf8');
  if (hash(text) !== pointer.hash) throw new Error('Map generation hash mismatch');
  const map = JSON.parse(text);
  if (map.generation !== pointer.generation) throw new Error('Map generation identity mismatch');
  return map;
}

export function publishMap(file, map, { beforeSwitch } = {}) {
  const generation = randomUUID();
  const target = path.join(`${file}.generations`, `${generation}.json`);
  const published = { ...map, generation };
  const text = `${JSON.stringify(published)}\n`;
  atomicWrite(target, text);
  beforeSwitch?.(published);
  atomicWrite(file, `${JSON.stringify({ version: 2, generation, generationFile: slash(path.relative(path.dirname(file), target)), hash: hash(text) })}\n`);
  return published;
}
