import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
export const isTest = file => /^tests\/.*\.test\.mjs$/.test(file);
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

// Same roots and reverse-import closure as affected-tests.mjs. Side-effect imports
// and JSON imports are also included, since they are real loading dependencies.
export function affectedTests(root, changed) {
  const files = ['server-plugin', 'tools', 'tests', 'world', 'compat']
    .flatMap(dir => walk(root, dir)).filter(file => /\.(mjs|js)$/.test(file));
  const importers = new Map();
  const worldReaders = [];
  const re = /(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (isTest(file) && /load-world|loadWorld/.test(source)) worldReaders.push(file);
    for (const match of source.matchAll(re)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1] || match[2]));
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }
  const seen = new Set(changed), queue = [...changed];
  while (queue.length) for (const importer of importers.get(queue.pop()) || []) {
    if (!seen.has(importer)) { seen.add(importer); queue.push(importer); }
  }
  if (changed.some(file => file.startsWith('world/'))) worldReaders.forEach(file => seen.add(file));
  return unique([...seen].filter(file => isTest(file) && fs.existsSync(path.join(root, file))));
}
