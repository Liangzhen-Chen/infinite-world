// 检测器 seed_sites（卷十二 §2.4 开放登记；卷二十七 §4.8）：种子键登记表与源码抽取点双向比对。
// R27-8.1 :717：规则层与内核的每个随机抽取点、每个由种子派生 id 的点，都在登记表里恰有一行；源码与登记表双向比对，
//   任一侧多出即 E-SEED-KEY。R27-8.4 :720：登记表里 role_seed 的行（流代号, 抽取点代号）两两不同、前缀不得为空，
//   有重复或空前缀即 E-SEED-COLLISION。
// 登记表从登记派生，不在这里另写文件名单（R12-11.5）：扫描类别行 seedTable 是规则表代号（卷二 §4.1 :1508 的登记字段），
// 表路径经 kernel/load/rules.mjs 的 RULES_LAYOUT 与 world/rules/registry.json 该行 file 拼出（同 data_shape 的读法）；
// 登记里没有该行、表文件不在被查内容、表格式不对，一律报 E-ACC-ITEM-PARAM，不静默放过。
// 抽取点的识别同样从登记派生：登记行写 file（相对 server-plugin/，卷二 §2.9 :897）、流代号 stream、抽取点代号 site
// （R27-8.5 :723 五段的 streamCode、drawSiteCode，:731）；源码里取「被调名 + 前两个实参都是字串字面量」的调用，
// 被调名从已登记行对上的调用点学出（统一包装的名字不写死在代码里），再按同一被调名扫全部范围内的文件，
// 这样源码里新出现、未登记的同包装调用也认得出来。
// params.checks：seedSites（双向比对，报 params.code）、roleSeed（role_seed 行查重与空前缀，报 params.code）。
// params.groups：范围（模块组键，rules、kernel）。

import { RULES_LAYOUT } from '../../../server-plugin/kernel/load/rules.mjs';
import { filesOfGroups } from '../read.mjs';
import { tokenize, isP, matchClose } from '../lib/js-scan.mjs';

const NOT_CALL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'typeof',
  'new', 'await', 'yield', 'delete', 'void', 'throw', 'case', 'in', 'of', 'instanceof']);

// 调用表达式的实参 token 段（顶层逗号切分）。
function argsOf(toks, open, close) {
  const args = []; let cur = []; let d = 0;
  for (let k = open + 1; k < close; k++) {
    const t = toks[k];
    if (t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{')) d++;
    else if (t.t === 'p' && (t.v === ')' || t.v === ']' || t.v === '}')) d--;
    if (d === 0 && isP(t, ',')) { args.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length || args.length) args.push(cur);
  return args;
}

const oneStr = (arg) => (arg.length === 1 && arg[0].t === 'str' ? arg[0].v : null);

// 前两个实参都是字串字面量的调用点：被调名（成员调用取末段名）、流代号、抽取点代号、行号。
export function callSites(src) {
  const toks = tokenize(src);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || !isP(toks[i + 1], '(')) continue;
    const prev = toks[i - 1];
    if (prev && prev.t === 'id' && NOT_CALL.has(prev.v)) continue;
    const close = matchClose(toks, i + 1);
    const args = argsOf(toks, i + 1, close);
    if (args.length < 2) continue;
    const stream = oneStr(args[0]);
    const site = oneStr(args[1]);
    if (stream === null || site === null) continue;
    out.push({ name: t.v, stream, site, line: t.line });
  }
  return out;
}

// 登记行 file 相对 server-plugin/（卷二 §2.9 :897）；已带前缀的照用。
const repoFileOf = (file) => (file.startsWith('server-plugin/') ? file : `server-plugin/${file}`);

// 种子键登记表：表代号取自扫描类别行 seedTable，路径照 world/rules/registry.json 该行（卷二 §4.1 :1508）。
function seedTableOf(ctx, cls, hits, paramCode) {
  const problem = (why) => hits.push({ file: `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`, line: 0, nodeKind: 'param', symbolPath: why, code: paramCode });
  const code = (cls || {}).seedTable;
  if (!code) { problem('scan class has no seedTable code'); return null; }
  const regPath = `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`;
  if (!ctx.files.includes(regPath)) { problem(`${regPath} missing`); return null; }
  let reg;
  try { reg = JSON.parse(ctx.read(regPath)); } catch { problem(`${regPath} unparsable`); return null; }
  const row = (reg.rows || []).find((r) => r && r.code === code);
  if (!row) { problem(`rules registry has no table row ${code}`); return null; }
  const path = `${RULES_LAYOUT.dir}/${row.file}`;
  if (!ctx.files.includes(path)) { problem(`${path} missing`); return null; }
  let doc;
  try { doc = JSON.parse(ctx.read(path)); } catch { problem(`${path} unparsable`); return null; }
  const entries = doc && doc.entries;
  if (!Array.isArray(entries)) { problem(`${path} has no entries list`); return null; }
  for (const e of entries) {
    if (!e || typeof e.file !== 'string' || typeof e.stream !== 'string' || typeof e.site !== 'string' || typeof e.role !== 'string') {
      problem(`${path} entry lacks file/stream/site/role`);
      return null;
    }
  }
  return { path, entries };
}

export function detect(ctx, params, cls) {
  const checks = new Set(params.checks || []);
  const code = params.code || '';
  const hits = [];
  const paramCode = 'E-ACC-ITEM-PARAM';
  for (const c of checks) if (c !== 'seedSites' && c !== 'roleSeed') {
    hits.push({ file: '', line: 0, nodeKind: 'param', symbolPath: `unknown check ${c}`, code: paramCode });
    return hits;
  }
  const table = seedTableOf(ctx, cls || {}, hits, paramCode);
  if (!table) return hits;
  if (checks.has('seedSites')) {
    const rows = table.entries.map((e) => ({ file: repoFileOf(e.file), stream: e.stream, site: e.site }));
    const sites = [];
    for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
      for (const s of callSites(ctx.read(file))) sites.push({ file, ...s });
    }
    const match = (r, s) => r.file === s.file && r.stream === s.stream && r.site === s.site;
    // 包装的被调名从已登记行对上的调用点学出（不写死名字）；再用它扫出全部抽取点。
    const names = new Set(sites.filter((s) => rows.some((r) => match(r, s))).map((s) => s.name));
    const points = sites.filter((s) => names.has(s.name));
    rows.forEach((r, i) => {
      if (!points.some((s) => match(r, s))) hits.push({ file: table.path, line: 0, nodeKind: 'row', symbolPath: `entry${i}:${r.file}:${r.stream}:${r.site}`, code });
    });
    for (const s of points) {
      const owners = rows.filter((r) => match(r, s));
      if (owners.length !== 1) hits.push({ file: s.file, line: s.line, nodeKind: 'site', symbolPath: `${s.name}(${s.stream},${s.site})`, code });
    }
  }
  if (checks.has('roleSeed')) {
    const seen = new Map();
    table.entries.forEach((e, i) => {
      if (e.role !== 'role_seed') return;
      const sym = `entry${i}:${e.file}:${e.stream}:${e.site}`;
      if (!e.prefix) hits.push({ file: table.path, line: 0, nodeKind: 'row', symbolPath: sym, code });
      const key = `${e.stream}\u0000${e.site}`;
      if (seen.has(key)) hits.push({ file: table.path, line: 0, nodeKind: 'row', symbolPath: sym, code });
      else seen.set(key, i);
    });
  }
  return hits;
}
