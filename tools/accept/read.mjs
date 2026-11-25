// acc-read（卷十二 §3.1 读入口与谓词；§2.11 门禁设施登记 acc-read，李白 11-17 四-1 定名）：离线只读函数。
// 输入只有 §2.11 的登记文件、版本库的文件清单与内容、卷二的声明表（卷二 §1.1 文件布局）。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tokenize, importsOf } from './lib/js-scan.mjs';
import { LAYOUT as WORLD_LAYOUT } from './lib/world-layout.mjs';

// 卷二 §1.1 的文件布局与卷十二 §2.11、§2.9、§2.3 的登记位置（相对仓库根）。
export const LAYOUT = Object.freeze({
  // 世界数据的文件布局只一处：公共部件 kernel/load/layout.mjs（加载器与门禁共用）；这里只引用，不另写一份名字。
  stateOwners: WORLD_LAYOUT.stateOwners,
  dimensionsDir: WORLD_LAYOUT.dimensionsDir,
  unbuiltDerived: WORLD_LAYOUT.unbuiltDerived,
  accDir: 'tools/accept',
  outDir: 'tools/accept/out',
  detectorsDir: 'tools/accept/detectors',
  bypassDir: 'tests/accept/bypass',
  bypassDimsDir: 'tests/accept/bypass/dims',
});

// §2.11 登记文件：文件名 → 行主键字段；moduleDir：每行对应一个代码模块（§2.3 :228，检测器一行一个模块）。
export const REGISTRY = Object.freeze({
  items: { file: 'items.json', key: 'itemKey', itemRows: true },
  detectors: { file: 'detectors.json', key: 'detectorCode', moduleDir: LAYOUT.detectorsDir },
  scanclasses: { file: 'scanclasses.json', key: 'scanClass' },
  cases: { file: 'cases.json', key: 'caseKey' },
  criteria: { file: 'criteria.json', key: 'scanClass' },
  gatefacs: { file: 'gatefacs.json', key: 'facCode' },
  // 确定性模板（卷十二 §2.8 dettpl、§2.11）：模板代号、比什么、参数登记；登记器是唯一写者。
  dettpl: { file: 'dettpl.json', key: 'tplCode' },
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
  const out = new RegExp('^' + (extAlt ? '(?!.*\\.d\\.[mc]?ts$)' : '') + re + extAlt + '$');
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
  // 离线组（卷二 §2.9）：import 矩阵里带 modules 的项，键名即组键（P-1b：S12-2 的范围要能用组键写）。
  const offlineGroups = Object.keys(m).sort().filter((k) => m[k] && Array.isArray(m[k].modules)).map((k) => ({ key: k, globs: m[k].modules }));
  return { codeExts, groups, offlineGroups, retired: decl.retired || [], processes: m.processes || {}, offline: offlineGroups.flatMap((g) => g.globs), matrix: m };
}

// 声明文件（.d.ts/.d.mts/.d.cts，卷二 §2.9 第 2 条）只有类型、无运行代码，不算模块文件。
export const isDeclFile = (path) => /\.d\.[mc]?ts$/.test(path);
export function isCode(path, model) { return !isDeclFile(path) && model.codeExts.some((e) => path.endsWith(e)); }

// 一个路径的归属：{group, process} | {retired} | {offline} | {data} | null（仓库外或无关）。
export function classify(path, model) {
  if (model.retired.length && matchGlobs(path, model.retired, model.codeExts)) return { retired: true };
  for (const g of model.offlineGroups) if (matchGlobs(path, g.globs, model.codeExts)) return { offline: true, group: g.key };
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
  const g = model.groups.concat(model.offlineGroups).find((x) => x.key === groupKey);
  if (g) { const inc = g.globs.find((x) => !x.startsWith('!')); return inc.slice(0, inc.indexOf('*') < 0 ? inc.lastIndexOf('/') + 1 : inc.indexOf('*')); }
  const p = Object.values(model.processes).find((x) => x.remainderGroup === groupKey);
  return p ? p.root : null;
}

// ---------- 实体前缀（R12-1.2：取自各维度表表头 entity 的 idPrefix 与 singletonIds） ----------

export function prefixesFromDir(dir) {
  const prefixes = new Set(); const singletons = new Set(); const classPrefixes = new Set();
  if (!existsSync(dir)) return { prefixes, singletons, classPrefixes };
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || name.startsWith('_')) continue;
    const e = (readJson(join(dir, name)).entity) || {};
    for (const p of e.idPrefix || []) prefixes.add(p);
    // classPrefix 是词表 class 族的条目前缀（类别代号），不是实体 id 前缀：卷六 S6-2 的规则表一支只计实体 id（prefixes），
    // 代码里的字面量扫描（lit_scope）仍把类别代号一并计入（classPrefixes），不放宽（6-2 复核第 2 轮 N2）。
    if (e.classPrefix) classPrefixes.add(e.classPrefix);
    for (const s of e.singletonIds || []) singletons.add(s);
  }
  return { prefixes, singletons, classPrefixes };
}

export function mergePrefixes(...sets) {
  const prefixes = new Set(); const singletons = new Set(); const classPrefixes = new Set();
  for (const s of sets) { s.prefixes.forEach((x) => prefixes.add(x)); s.singletons.forEach((x) => singletons.add(x)); (s.classPrefixes || []).forEach((x) => classPrefixes.add(x)); }
  return { prefixes: [...prefixes].sort(), singletons: [...singletons].sort(), classPrefixes: [...classPrefixes].sort() };
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
  // 判据输入（范围、类别数据）取自 §2.11 登记；被查内容里的登记文件另经 files/read 读（regContent）。
  const regs = opts.regs || Object.fromEntries(Object.keys(REGISTRY).map((k) => [k, readRegistry(root, k)]));
  return { root, files, read, raw: opts.read ? (p) => Buffer.from(opts.read(p)) : raw, blobs, decl, model: groupModel(decl), prefixes: ents, regs };
}

export const resolveRel = (from, spec) => posix.normalize(posix.join(posix.dirname(from), spec));

// 被查内容里的一份登记文件（按 §2.11 位置）；不在文件清单里为 null。
export function regContent(ctx, kind) {
  const p = `${LAYOUT.accDir}/${REGISTRY[kind].file}`;
  return ctx.files.includes(p) ? (JSON.parse(ctx.read(p)).rows || []) : null;
}

// 一张带 moduleDir 的登记表的各行对应、且在文件清单里的模块。
export function registryModules(ctx, kind, codes) {
  const R = REGISTRY[kind];
  if (!R || !R.moduleDir) return [];
  const all = new Set(ctx.files);
  return (codes || (ctx.regs[kind] || []).map((r) => r[R.key])).map((c) => `${R.moduleDir}/${c}.mjs`).filter((f) => all.has(f)).sort();
}

// 种子文件加上它们经相对静态 import 能到达的、在文件清单里的代码文件（P-1b：设施与检测器的"源码"含其所 import 的共用模块）。
export function importClosure(ctx, seeds) {
  const all = new Set(ctx.files); const seen = new Set(); const stack = [...seeds];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !all.has(f)) continue;
    seen.add(f);
    for (const imp of importsOf(tokenize(ctx.read(f)))) if (imp.spec && imp.spec.startsWith('.')) stack.push(resolveRel(f, imp.spec));
  }
  return [...seen].sort();
}

// 条目范围（accScope 的展开）：params.groups 组键展开；params.facs 门禁设施在仓库内的文件、params.modules 登记表各行的模块，
// 两者连同其 import 闭包。
export function scopeFiles(ctx, params) {
  const out = new Set(filesOfGroups(ctx.files, ctx.model, params.groups || []));
  const facs = new Map((ctx.regs.gatefacs || []).map((g) => [g.facCode, g]));
  const seeds = [];
  for (const code of params.facs || []) { const g = facs.get(code); if (g && g.inRepo === true && Array.isArray(g.paths)) seeds.push(...g.paths); }
  for (const kind of params.modules || []) seeds.push(...registryModules(ctx, kind));
  for (const f of importClosure(ctx, seeds)) out.add(f);
  return [...out].sort();
}

// 设施文件集合（调用者闭集，call_edge 用）：只取设施登记的文件本身，不含闭包。
export function facilityFiles(ctx, codes) {
  const facs = new Map((ctx.regs.gatefacs || []).map((g) => [g.facCode, g]));
  return new Set((codes || []).flatMap((c) => { const g = facs.get(c); return g && g.inRepo === true && Array.isArray(g.paths) ? g.paths : []; }));
}

// 代码指纹：按路径排序，各文件取词法 token 序列（去注释、空白与行号）摘要；判定逻辑不变的排版改动不改指纹（S12-13）。
// 词法数值可能是 BigInt（`10n`，见 js-scan 的 numValue），JSON.stringify 不能直接序列化：统一写成 {"$bigint":"<十进制>"}。
// 普通 token 的值没有对象形态、token 字段也没有 $bigint，所以同值同指纹、且与数值、普通字串（含形似上述标记的字串）都不撞；
// 不含 BigInt 的输入走同一路径，序列化结果逐字与定此写法之前相同。
function tokenJson(k, v) {
  if (k === 'line' || k === 'nl') return undefined;
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  return v;
}

export function codePrint(ctx, files) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) {
    h.update(f + '\0');
    h.update(JSON.stringify(tokenize(ctx.read(f)), tokenJson));
    h.update('\n');
  }
  return h.digest('hex');
}

// 一个扫描类别的判据代码：类别登记的各检测器模块及其 import 闭包。
export function classPrint(ctx, scanClass) {
  const row = (ctx.regs.scanclasses || []).find((c) => c.scanClass === scanClass);
  return codePrint(ctx, importClosure(ctx, registryModules(ctx, 'detectors', row ? row.detectors || [] : [])));
}

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
  return scopeFiles(ctx, item.params || {});
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
