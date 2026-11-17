// acc-read（卷十二 §3.1 读入口与谓词；§2.11 门禁设施登记 acc-read，李白 11-17 四-1 定名）：离线只读函数。
// 输入只有 §2.11 的登记文件、版本库的文件清单与内容、卷二的声明表（卷二 §1.1 文件布局）。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { execFileSync } from 'node:child_process';

// 卷二 §1.1 的文件布局与卷十二 §2.11、§2.9 的登记位置（相对仓库根）。
export const LAYOUT = Object.freeze({
  stateOwners: 'world/ontology/state-owners.json',
  dimensionsDir: 'world/ontology/dimensions',
  accDir: 'tools/accept',
  bypassDir: 'tests/accept/bypass',
  bypassDimsDir: 'tests/accept/bypass/dims',
});

// §2.11 登记文件：文件名 → 行主键字段。
export const REGISTRY = Object.freeze({
  items: { file: 'items.json', key: 'itemKey' },
  detectors: { file: 'detectors.json', key: 'detectorCode' },
  scanclasses: { file: 'scanclasses.json', key: 'scanClass' },
  cases: { file: 'cases.json', key: 'caseKey' },
  criteria: { file: 'criteria.json', key: 'scanClass' },
  gatefacs: { file: 'gatefacs.json', key: 'facCode' },
});

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function readRegistry(root, kind) {
  const p = join(root, LAYOUT.accDir, REGISTRY[kind].file);
  return existsSync(p) ? readJson(p).rows : [];
}

export function readDecl(root) {
  const p = join(root, LAYOUT.stateOwners);
  return existsSync(p) ? readJson(p) : {};
}

// 版本库文件全集（已跟踪与未忽略的新文件，去掉磁盘上已不存在的）；不是 git 仓库时按磁盘遍历。
export function listFiles(root) {
  let list;
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    list = out.split('\0').filter(Boolean).filter((f) => existsSync(join(root, f)));
  } catch {
    list = [];
    const walk = (rel) => {
      for (const name of readdirSync(join(root, rel))) {
        if (name === '.git' || name === 'node_modules') continue;
        const r = rel ? `${rel}/${name}` : name;
        if (statSync(join(root, r)).isDirectory()) walk(r); else list.push(r);
      }
    };
    walk('');
  }
  return [...new Set(list)].sort();
}

// 已跟踪且工作区未改动的文件 → git 对象号（内容指纹用，免得每次重读全仓）；不是 git 仓库时为空表。
export function gitBlobs(root) {
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const blobs = new Map();
    for (const rec of run(['ls-files', '-s', '-z']).split('\0')) {
      const m = /^\d+ ([0-9a-f]+) 0\t(.+)$/.exec(rec);
      if (m) blobs.set(m[2], m[1]);
    }
    for (const f of run(['ls-files', '-m', '-z']).split('\0')) blobs.delete(f);
    return blobs;
  } catch { return new Map(); }
}

// ---------- 模块组（卷二 §2.7"七个模块组"；归组按目录，扩展名对全部代码扩展名展开） ----------

const reCache = new Map();
export function globToRe(glob, codeExts) {
  const key = glob + '|' + codeExts.join(',');
  if (reCache.has(key)) return reCache.get(key);
  let g = glob; let extAlt = '';
  const ext = codeExts.find((e) => g.endsWith('*' + e));
  if (ext) { g = g.slice(0, -ext.length); extAlt = '(?:' + codeExts.map((e) => e.replace(/\./g, '\\.')).join('|') + ')'; }
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += g[i + 2] === '/' ? 2 : 1; continue; }
    if (c === '*') { re += '[^/]*'; continue; }
    re += /[.+^${}()|[\]\\?]/.test(c) ? '\\' + c : c;
  }
  const out = new RegExp('^' + re + extAlt + '$');
  reCache.set(key, out);
  return out;
}

export function matchGlobs(path, globs, codeExts) {
  const inc = globs.filter((g) => !g.startsWith('!'));
  const exc = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  return inc.some((g) => globToRe(g, codeExts).test(path)) && !exc.some((g) => globToRe(g, codeExts).test(path));
}

// 声明表里带 modules 或 files 的顶层项就是一个组（键名即组键）；规则层是服务端根下的剩余代码文件。
export function groupModel(decl) {
  const m = decl.importMatrix || {};
  const codeExts = m.codeExtensions || [];
  const groups = Object.keys(decl).filter((k) => decl[k] && (Array.isArray(decl[k].modules) || Array.isArray(decl[k].files))).sort()
    .map((k) => ({ key: k, globs: decl[k].modules || decl[k].files, process: decl[k].process }));
  return { codeExts, groups, retired: decl.retired || [], processes: m.processes || {}, offline: (m.offline || {}).modules || [], matrix: m };
}

export function isCode(path, model) { return model.codeExts.some((e) => path.endsWith(e)); }

// 一个路径的归属：{group, process} | {retired} | {offline} | {data} | null（仓库外或无关）。
export function classify(path, model) {
  if (model.retired.length && matchGlobs(path, model.retired, model.codeExts)) return { retired: true };
  if (model.offline.length && matchGlobs(path, model.offline, model.codeExts)) return { offline: true };
  for (const g of model.groups) if (matchGlobs(path, g.globs, model.codeExts)) return { group: g.key, process: g.process };
  for (const [proc, p] of Object.entries(model.processes)) {
    if (path.startsWith(p.root)) return p.remainderGroup && isCode(path, model) ? { group: p.remainderGroup, process: proc } : { process: proc, foreign: true };
  }
  return isCode(path, model) ? { code: true } : { data: true };
}

// 一个组键展开到文件集合（R12-2.3 按磁盘真实文件算；accScope 的组键展开）。
export function filesOfGroups(files, model, groupKeys) {
  const want = new Set(groupKeys);
  return files.filter((f) => isCode(f, model) && want.has(classify(f, model).group));
}

// 组在源码树里的落位目录（绕法用例放进该组的临时文件，R12-13.4）。
export function groupDir(model, groupKey) {
  const g = model.groups.find((x) => x.key === groupKey);
  if (g) { const inc = g.globs.find((x) => !x.startsWith('!')); return inc.slice(0, inc.indexOf('*') < 0 ? inc.lastIndexOf('/') + 1 : inc.indexOf('*')); }
  const p = Object.values(model.processes).find((x) => x.remainderGroup === groupKey);
  return p ? p.root : null;
}

// ---------- 实体前缀（R12-1.2：取自各维度表表头 entity 的 idPrefix、classPrefix 与 singletonIds） ----------

export function prefixesFromDir(dir) {
  const prefixes = new Set(); const singletons = new Set();
  if (!existsSync(dir)) return { prefixes, singletons };
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.startsWith('_')) continue;
    const e = (readJson(join(dir, name)).entity) || {};
    for (const p of e.idPrefix || []) prefixes.add(p);
    if (e.classPrefix) prefixes.add(e.classPrefix);
    for (const s of e.singletonIds || []) singletons.add(s);
  }
  return { prefixes, singletons };
}

export function mergePrefixes(...sets) {
  const prefixes = new Set(); const singletons = new Set();
  for (const s of sets) { s.prefixes.forEach((x) => prefixes.add(x)); s.singletons.forEach((x) => singletons.add(x)); }
  return { prefixes: [...prefixes].sort(), singletons: [...singletons].sort() };
}

// ---------- 执行上下文 ----------

// opts.files：文件清单；opts.overrides：{路径: 内容}，盖在磁盘内容之上；opts.read：整套虚拟内容（不碰磁盘）。
export function loadContext(root, opts = {}) {
  const overrides = opts.overrides || {};
  const files = opts.files || [...new Set([...listFiles(root), ...Object.keys(overrides)])].sort();
  const cache = new Map();
  const raw = (p) => (p in overrides ? Buffer.from(overrides[p]) : readFileSync(join(root, p)));
  const read = opts.read || ((p) => { if (!cache.has(p)) cache.set(p, p in overrides ? overrides[p] : readFileSync(join(root, p), 'utf8')); return cache.get(p); });
  const blobs = opts.read ? new Map() : gitBlobs(root);
  for (const p of Object.keys(overrides)) blobs.delete(p);
  const decl = opts.decl || readDecl(root);
  const ents = opts.prefixes || mergePrefixes(prefixesFromDir(join(root, LAYOUT.dimensionsDir)));
  return { root, files, read, raw: opts.read ? (p) => Buffer.from(opts.read(p)) : raw, blobs, decl, model: groupModel(decl), prefixes: ents };
}

export const resolveRel = (from, spec) => posix.normalize(posix.join(posix.dirname(from), spec));

// ---------- §3.1 读入口 ----------

const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

export function accItems(root, filter = {}) {
  return readRegistry(root, 'items').filter((r) => Object.entries(filter).every(([k, v]) => {
    if (k === 'gate') return (r.gates || []).includes(v);
    if (Array.isArray(v)) return v.includes(r[k]);
    return r[k] === v;
  })).sort(byKey('itemKey'));
}

export function accItem(root, itemKey) { return readRegistry(root, 'items').find((r) => r.itemKey === itemKey) || null; }

export function accCases(root, filter = {}) {
  return readRegistry(root, 'cases').filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).sort(byKey('caseKey'));
}

export function accScope(root, itemKey) {
  const item = accItem(root, itemKey);
  if (!item) return [];
  const ctx = loadContext(root);
  return filesOfGroups(ctx.files, ctx.model, (item.params || {}).groups || []);
}

export function accHits(root, filter = {}) {
  const p = join(root, LAYOUT.accDir, 'hits.json');
  const rows = existsSync(p) ? readJson(p).rows : [];
  return rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).sort(byKey('rowKey'));
}

export function accBaseline(root) {
  const p = join(root, LAYOUT.accDir, 'baseline.json');
  return existsSync(p) ? readJson(p).rows : [];
}

// 报告按内容指纹分目录、按关口分文件（§2.11 `tools/accept/out/`）。
export function accReport(root, contentPrint, gate) {
  const p = join(root, LAYOUT.accDir, 'out', contentPrint, `${gate}.json`);
  return existsSync(p) ? readJson(p) : null;
}
