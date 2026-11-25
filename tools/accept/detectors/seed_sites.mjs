// 检测器 seed_sites（卷十二 §2.4 开放登记；卷二十七 §4.8）：种子键登记表与源码抽取点双向比对。
// R27-8.1 :717：规则层与内核的每个随机抽取点、每个由种子派生 id 的点，都在登记表里恰有一行；源码与登记表双向比对，
//   任一侧多出即 E-SEED-KEY。R27-8.4 :720：登记表里 role_seed 的行（流代号, 抽取点代号）两两不同、前缀不得为空，
//   有重复或空前缀即 E-SEED-COLLISION。
// 登记表从登记派生，不在这里另写文件名单（R12-11.5）：扫描类别行 seedTable 是规则表代号（卷二 §4.1 :1508 的登记字段），
// 表路径经 kernel/load/rules.mjs 的 RULES_LAYOUT 与 world/rules/registry.json 该行 file 拼出（同 data_shape 的读法）；
// 登记里没有该行、表文件不在被查内容、表格式不对，一律报 E-ACC-ITEM-PARAM，不静默放过。
// 抽取点的识别同样从登记派生：登记行写 file（相对 server-plugin/，卷二 §2.9 :897）、流代号 stream、抽取点代号 site
// （R27-8.5 :723 五段的 streamCode、drawSiteCode，:731）；源码里取「被调名 + 前两个实参都折叠得出字串常量」的调用，
// 被调名从已登记行对上的调用点学出（统一包装的名字不写死在代码里），再按同一被调名扫全部范围内的文件，
// 这样源码里新出现、未登记的同包装调用也认得出来。
// C0（亮圳规定检查代码不许靠认字面文字判，李白更正裁定 msg-1122-2255-c0ast）：调用点按语法树读（lib/ast.mjs）：
//   实参经常量折叠（const 别名、模板串、拼接）得出字串即算字面常量；return、await、throw 后的调用同样是调用点（修 C2 审查第 2 条的盲区）；
//   被调名取被调用方取值来源的末段名（别名、解构、.bind 都跟到原名）。
// params.checks：seedSites（双向比对，报 params.code）、roleSeed（role_seed 行查重与空前缀，报 params.code）、
//   drawSites（规则表 cls.siteList.{table,key} 列表里每个抽取点代号都在登记表有一行 site 与之相同，甲 R6 后半）、
//   seedArgs（被调名同上学出；这些被调名的调用，前两个实参折叠不出字串常量的每处计一条，站点名、流代号用变量也报；运行期才知道的值即“待人审”）。
// params.groups：范围（模块组键，rules、kernel）。

import { RULES_LAYOUT } from '../lib/rules.mjs';
import { filesOfGroups } from '../read.mjs';
import { projectOf, fileOf, walkAll, fold, calleeOrigins, where } from '../lib/ast.mjs';

// 种子键表的键名：登记行 type 声明的唯一键（§4.1 键表）；表格式归卷二 §1.10、卷二十七 §4.8。
const ENTRIES_KEY = 'entries';

// 一个文件里所有「前两个实参存在」的调用：被调名（取值来源末段名，取不到退回被调表达式末段）、两个实参折叠出的字串（折叠不出为 null）、位置。
function callsOf(rec) {
  const out = [];
  walkAll(rec.ast, (n) => {
    if (n.type !== 'CallExpression' || n.arguments.length < 2 || n.arguments[0].type === 'SpreadElement' || n.arguments[1].type === 'SpreadElement') return;
    let name = '';
    const os = calleeOrigins(n, rec).filter((o) => o.path && o.path.length);
    if (os.length) name = os[0].path[os[0].path.length - 1];
    else if (n.callee.type === 'Identifier') name = n.callee.name;
    else if (n.callee.type === 'MemberExpression' && !n.callee.computed) name = n.callee.property.name;
    if (!name) return;
    const a = fold(n.arguments[0], rec); const b = fold(n.arguments[1], rec);
    out.push({ name, stream: a && typeof a.v === 'string' ? a.v : null, site: b && typeof b.v === 'string' ? b.v : null, ...where(n) });
  });
  return out;
}

function recOf(ctx, file, hits) {
  const rec = fileOf(projectOf(ctx), file);
  if (!rec || rec.error) { hits.push({ file, line: 0, nodeKind: 'parseError', symbolPath: rec ? rec.error.slice(0, 60) : 'missing', code: 'E-ACC-ITEM-PARAM' }); return null; }
  return rec;
}

// 前两个实参都折叠得出字串常量的调用点。
function callSitesOf(ctx, file, hits) {
  const rec = recOf(ctx, file, hits);
  return rec ? callsOf(rec).filter((c) => c.stream !== null && c.site !== null).map((c) => ({ ...c, line: c.line })) : [];
}

// 登记行 file 相对 server-plugin/（卷二 §2.9 :897）；已带前缀的照用。
const repoFileOf = (file) => (file.startsWith('server-plugin/') ? file : `server-plugin/${file}`);

// 规则表（经 world/rules/registry.json 该代号行取路径）的 JSON 文档；读不出一律经 problem 报 E-ACC-ITEM-PARAM。
function loadRulesDoc(ctx, code, problem) {
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
  return { path, doc };
}

// 种子键登记表：表代号取自扫描类别行 seedTable，路径照 world/rules/registry.json 该行（卷二 §4.1 :1508）。
function seedTableOf(ctx, cls, hits, paramCode) {
  const problem = (why) => hits.push({ file: `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`, line: 0, nodeKind: 'param', symbolPath: why, code: paramCode });
  const code = (cls || {}).seedTable;
  if (!code) { problem('scan class has no seedTable code'); return null; }
  const loaded = loadRulesDoc(ctx, code, problem);
  if (!loaded) return null;
  const { path, doc } = loaded;
  // 表是 §4.1 的键表：登记行 type 只声明一个键 entries，值即抽取点行列表（{"rows":[{key:"entries",value:[…]}]}）。
  const entryRow = doc && Array.isArray(doc.rows) ? doc.rows.find((r) => r && r.key === ENTRIES_KEY) : undefined;
  const entries = entryRow && Array.isArray(entryRow.value) ? entryRow.value : null;
  if (!entries) { problem(`${path} has no ${ENTRIES_KEY} list`); return null; }
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
  for (const c of checks) if (c !== 'seedSites' && c !== 'roleSeed' && c !== 'drawSites' && c !== 'seedArgs') {
    hits.push({ file: '', line: 0, nodeKind: 'param', symbolPath: `unknown check ${c}`, code: paramCode });
    return hits;
  }
  const table = seedTableOf(ctx, cls || {}, hits, paramCode);
  if (!table) return hits;
  const rows = table.entries.map((e) => ({ file: repoFileOf(e.file), stream: e.stream, site: e.site }));
  const files = filesOfGroups(ctx.files, ctx.model, params.groups || []);
  const match = (r, s) => r.file === s.file && r.stream === s.stream && r.site === s.site;
  const sites = [];
  if (checks.has('seedSites') || checks.has('seedArgs')) for (const file of files) for (const s of callSitesOf(ctx, file, hits)) sites.push({ file, ...s });
  // 包装的被调名从已登记行对上的调用点学出（不写死名字）；再用它扫出全部抽取点。
  const names = new Set(sites.filter((s) => rows.some((r) => match(r, s))).map((s) => s.name));
  // drawSites（甲 R6 后半；卷二十七 :789、卷二十 :479）：规则表 cls.siteList.table 的键 cls.siteList.key 的列表里，
  // 每个抽取点代号都要在种子键登记表里有一行 site 与之相同；缺的每个计一条（symbolPath 为该代号）。
  if (checks.has('drawSites')) {
    const sl = (cls || {}).siteList;
    const problem = (why) => hits.push({ file: `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`, line: 0, nodeKind: 'param', symbolPath: why, code: paramCode });
    const loaded = sl && sl.table && sl.key ? loadRulesDoc(ctx, sl.table, problem) : (problem('scan class has no siteList {table, key}'), null);
    const listRow = loaded && Array.isArray(loaded.doc.rows) ? loaded.doc.rows.find((r) => r && r.key === sl.key) : undefined;
    if (loaded && !(listRow && Array.isArray(listRow.value))) problem(`${loaded.path} has no ${sl.key} list`);
    else if (loaded) {
      const have = new Set(table.entries.map((e) => e.site));
      for (const site of listRow.value) if (!have.has(site)) hits.push({ file: loaded.path, line: 0, nodeKind: 'drawsite', symbolPath: String(site), code });
    }
  }
  if (checks.has('seedSites')) {
    const points = sites.filter((s) => names.has(s.name));
    rows.forEach((r, i) => {
      if (!points.some((s) => match(r, s))) hits.push({ file: table.path, line: 0, nodeKind: 'row', symbolPath: `entry${i}:${r.file}:${r.stream}:${r.site}`, code });
    });
    for (const s of points) {
      const owners = rows.filter((r) => match(r, s));
      if (owners.length !== 1) hits.push({ file: s.file, line: s.line, nodeKind: 'site', symbolPath: `${s.name}(${s.stream},${s.site})`, code });
    }
  }
  if (checks.has('seedArgs')) {
    for (const file of files) {
      const rec = recOf(ctx, file, []);
      if (!rec) continue;
      for (const c of callsOf(rec)) if (names.has(c.name) && (c.stream === null || c.site === null)) hits.push({ file, line: c.line, nodeKind: 'siteArg', symbolPath: `${c.symbolPath}:${c.name}`, code });
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
