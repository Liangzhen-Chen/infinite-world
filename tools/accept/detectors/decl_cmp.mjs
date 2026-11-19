// 检测器 decl_cmp（卷十二 §2.3）：声明的输入、输出与调用图内实际读写不一致。块 2 第 2-3 张起用（扫描类别 undeclared_io；卷十二 R12-3.4、R12-3.5）。
// params.groups：范围；params.checks：
//   dynamicState  卷二 S15 / R12-3.4 动态访问一律计入（E-VIEW-DYNAMIC-STATE）：顶层键用变量取 `state[k]`；
//                 state 整体被展开（`...state`）、被枚举（Object.keys/values/entries/assign/fromEntries、for…in 的对象）。
//   inputs        卷二 S9 / R12-3.5 叶子核对：每个声明节点有 declareInputs，调用图内 state 读取 ⊆ own ∪ 闭包。
//                 依赖声明与 kernel/declare.mjs#declareInputs 在 2-5 才建（块 2 排期 e14），本项现在没有输入，调用即报错，不静默放过。
//   paramConsumed 卷十二 §4.4.6 A12-4.5（:784；李白 11-18 08:20 裁定①②，封卷后勘误 1118k18）：登记参数必须有消费者。
//                 范围＝world/rules/registry.json 全部登记行经 kernel/load/rules.mjs 的 RULES_LAYOUT/readRules 解析出的参数（键表的 t.defs 键），
//                 不另写解析。消费者口径（A12-4.5）＝规则层组代码，或内核运行期代码经规则入口读到。两类文件的组键从登记派生：
//                 规则层组＝state-owners importMatrix.processes 各进程登记的 remainderGroup；内核组＝声明表里登记 filesList 的那一组
//                 （卷二 §2.8 第 2 条 ① 的 kernel 闭集）。加载器、校验器文件不算：内核组登记目录下 load/、validate/ 两段（卷二 §2.8 :852
//                 把 JSON 文本解析登记在 kernel/load/*、代号正则与文法解析登记在 kernel/validate/*），按登记目录段派生、不列文件名单；
//                 测试与离线组不在这两组成员里，也不计。读到＝成员访问 `.key` / `?.key`、下标 `['key']`、或与键同值的字串字面量
//                 （后者覆盖键名经登记常量间接读取的写法，如 `SCHEMA.radixKey = 'handleRadix'` 后 `t[SCHEMA.radixKey]`）。
//                 违例每个无消费者的参数报一条 params.code（E-ACC-PARAM-UNCONSUMED）；登记缺失、读不出、范围里没有键表、组登记缺失
//                 都报 E-ACC-ITEM-PARAM，不静默放过。
// 局限（2-3 回报）：state 的根按名字认（lib/js-state.mjs）；"state 传给 §2.3 三类对象之外的函数"要调用图与类型，未判。
// paramConsumed 是词法级判定：不追数据来源，只按键名在消费者文件里的出现形态计；解构简写 `const { key } = t` 不算读到（保守，会报）。
//                 数据侧消费者两类（卷十二 A12-4.5 封卷后勘误 1118k31，李白 11-19 13:2x ①）：(a) 维度表里写成 RX、且不在未建派生登记里的
//                 derived 式引用的 `rules.<表>.<键>`（加载期编进求值器，运行期由 dim 求值）；(b) 已登记加载期派生（表头 ruleIndex）按具名
//                 {table, key} 读到的键，及该条件列表各条 when 引用的 `rules.<表>.<键>`。只认具名引用：表头别的字段、整表遍历、
//                 未建派生的式子都不算；写错的键对不上任何登记键，也就不算（加载器另报 E-MOD-RX）。

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize, isP, symbolPaths } from '../lib/js-scan.mjs';
import { stateChains } from '../lib/js-state.mjs';
import { filesOfGroups, LAYOUT } from '../read.mjs';
import { readRules, RULES_LAYOUT } from '../../../server-plugin/kernel/load/rules.mjs';
import { NAME_ROOT } from '../../../server-plugin/kernel/rx.mjs';
import { rxTokenAt } from '../../../server-plugin/kernel/handles/patterns.mjs';

const ENUM_FNS = new Set(['keys', 'values', 'entries', 'assign', 'fromEntries', 'getOwnPropertyNames']);

function dynamicHits(toks) {
  const out = [];
  // 顶层键用变量取（`state[k]`）：路径归不到声明的顶层键上。`state.<键>[id]` 按 pathTypes 的 `*` 段取实体是登记的写法，不计。
  for (const ch of stateChains(toks)) if (ch.segs[0] === '*') out.push({ i: ch.start, nodeKind: 'state_computed' });
  toks.forEach((t, i) => {
    if (!(t.t === 'id' && t.v === 'state') || isP(toks[i - 1], '.') || isP(toks[i + 1], '.') || isP(toks[i + 1], '[') || isP(toks[i + 1], '?.')) return;
    if (isP(toks[i - 1], '...')) out.push({ i, nodeKind: 'state_spread' });
    else if (isP(toks[i - 1], '(') && toks[i - 2] && toks[i - 2].t === 'id' && ENUM_FNS.has(toks[i - 2].v) && isP(toks[i - 3], '.') && toks[i - 4] && toks[i - 4].v === 'Object') out.push({ i, nodeKind: 'state_enumerate' });
    else if (toks[i - 1] && toks[i - 1].t === 'id' && toks[i - 1].v === 'in' && isP(toks[i + 1], ')')) out.push({ i, nodeKind: 'state_for_in' });
  });
  return out.sort((a, b) => a.i - b.i);
}

// 一个键在消费者文件里"被读到"的词法形态（见头注）。
function consumes(toks, key) {
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'str' && t.v === key) return true;
    if ((isP(t, '.') || isP(t, '?.')) && toks[i + 1] && toks[i + 1].t === 'id' && toks[i + 1].v === key) return true;
    if (isP(t, '[') && toks[i + 1] && toks[i + 1].t === 'str' && toks[i + 1].v === key && isP(toks[i + 2], ']')) return true;
  }
  return false;
}

// 消费者文件集（A12-4.5 口径）：规则层组＋内核组，去加载器、校验器。组键与目录段都从登记派生（见头注），没有文件名单。
function consumerFiles(ctx) {
  const decl = ctx.decl || {};
  const kernelKey = Object.keys(decl).sort().find((k) => decl[k] && typeof decl[k] === 'object' && !Array.isArray(decl[k]) && decl[k].filesList);
  const ruleGroups = Object.values((ctx.model && ctx.model.processes) || {}).map((p) => p.remainderGroup).filter(Boolean);
  if (!kernelKey) return null;
  const bases = (decl[kernelKey].modules || []).filter((g) => !g.startsWith('!'))
    .map((g) => (g.indexOf('*') < 0 ? g.slice(0, g.lastIndexOf('/') + 1) : g.slice(0, g.indexOf('*'))));
  const excluded = bases.flatMap((b) => [`${b}load/`, `${b}validate/`]);
  return filesOfGroups(ctx.files, ctx.model, [kernelKey, ...ruleGroups]).filter((f) => !excluded.some((p) => f.startsWith(p)));
}

// RX 文本里引用的规则表键（`rules.<表>.<键>…` 取前两段），按 RX 词法认名字，不按子串。
function rxRuleRefs(text, out) {
  if (typeof text !== 'string') return;
  for (let at = 0; at < text.length;) {
    const m = rxTokenAt(text, at);
    if (!m || m.end === at) break;
    at = m.end;
    const name = m.groups[1];
    if (name === undefined) continue;
    const segs = name.split('.');
    if (segs[0] === NAME_ROOT.rules && segs.length >= 3) out.add(`${segs[1]}.${segs[2]}`);
  }
}

// 数据侧消费者（见头注 (a)(b)）：读被查内容里的维度表与未建派生登记；解析失败的文件跳过（加载器另报）。
function dataConsumers(ctx, read) {
  const out = new Set();
  const dir = `${LAYOUT.dimensionsDir}/`;
  const parse = (f) => { try { return JSON.parse(ctx.read(f)); } catch { return undefined; } };
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const unbuiltDoc = ctx.files.includes(dir + LAYOUT.unbuiltDerived) ? parse(dir + LAYOUT.unbuiltDerived) : undefined; // 读不到或解析失败即视为没有登记
  const unbuilt = new Set((isObj(unbuiltDoc) && Array.isArray(unbuiltDoc.entries) ? unbuiltDoc.entries : []).filter(isObj).map((e) => `${e.table}.${e.dimension}`));
  const tableFile = new Map(read.tables.map((t) => [t.code, t.file]));
  for (const f of ctx.files) {
    if (!f.startsWith(dir) || f.slice(dir.length).includes('/') || f.slice(dir.length).startsWith('_') || !f.endsWith('.json')) continue;
    const doc = parse(f);
    if (!isObj(doc) || !isObj(doc.dimensions)) continue;
    for (const [dim, def] of Object.entries(doc.dimensions)) {
      if (!isObj(def)) continue;
      if (def.derived !== undefined && !unbuilt.has(`${doc.kind}.${dim}`)) rxRuleRefs(def.derived, out);
      const ri = def.ruleIndex;
      if (!isObj(ri) || typeof ri.table !== 'string' || typeof ri.key !== 'string') continue;
      out.add(`${ri.table}.${ri.key}`);
      const file = tableFile.get(ri.table);
      const rows = file && ctx.files.includes(file) ? parse(file) : undefined;
      const row = isObj(rows) && Array.isArray(rows.rows) ? rows.rows.find((r) => isObj(r) && r.key === ri.key) : undefined;
      for (const e of row && Array.isArray(row.value) ? row.value : []) if (isObj(e)) rxRuleRefs(e.when, out);
    }
  }
  return out;
}

function unconsumedHits(ctx, params) {
  const regPath = `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`;
  const hits = [];
  const problem = (why) => hits.push({ file: regPath, line: 0, nodeKind: 'param', symbolPath: why, code: 'E-ACC-ITEM-PARAM' });
  if (!existsSync(join(ctx.root, regPath))) { problem('rules registry missing'); return hits; }
  let read;
  try { read = readRules(ctx.root); } catch { problem('rules registry unreadable'); return hits; }
  if (read.errors.length) { problem('rules registry has errors'); return hits; }
  const keyed = read.tables.filter((t) => t.keyed && ctx.files.includes(t.file));
  if (!keyed.length) { problem('no registered key table in scanned content'); return hits; }
  const files = consumerFiles(ctx);
  if (!files) { problem('kernel group registration missing'); return hits; }
  const tokens = files.map((f) => tokenize(ctx.read(f)));
  const code = params.code || 'E-ACC-PARAM-UNCONSUMED';
  const data = dataConsumers(ctx, read);
  for (const t of keyed) {
    for (const key of t.defs.keys()) {
      if (!data.has(`${t.code}.${key}`) && !tokens.some((toks) => consumes(toks, key))) hits.push({ file: regPath, line: 0, nodeKind: 'param', symbolPath: `${t.code}.${key}`, code });
    }
  }
  return hits.sort((a, b) => (a.symbolPath < b.symbolPath ? -1 : a.symbolPath > b.symbolPath ? 1 : 0));
}

export function detect(ctx, params) {
  const checks = params.checks || [];
  const hits = [];
  if (checks.includes('inputs')) throw new Error('E-ACC-ITEM-UNIMPLEMENTED decl_cmp inputs: declareInputs not built (block 2 card 2-5)');
  if (checks.includes('paramConsumed')) hits.push(...unconsumedHits(ctx, params));
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    if (checks.includes('dynamicState')) for (const h of dynamicHits(toks)) hits.push({ file, line: toks[h.i].line, nodeKind: h.nodeKind, symbolPath: sym[h.i], code: 'E-VIEW-DYNAMIC-STATE' });
  }
  return hits;
}
