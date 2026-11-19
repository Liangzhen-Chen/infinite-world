// 检测器 data_shape（卷十二 §2.3）：登记表、数据表里出现不许有的键形态或值形态。
// params.tables：要查的 §2.11 登记文件种类（读被查内容里的那一份）；params.checks：形态约束代号——
//   expect / formMethod / param / field：条目登记行的形式核对（lib/item-form.mjs，与登记器同一判据；S12-4 用前三项）；
//   namelist：按文件路径加行号、或按单条行键列出的排除项（S12-6，E-ACC-SCAN-NAMELIST）——值是"路径:行号"或"路径#L行号"的字串、
//   同时带路径与行号字段的对象、或行键形态（R12-8.2 五段，竖线分隔、末段为序号）的字串。
//   entityKey：规则表里的键/值不得是实体 id（卷六 S6-2，报 params.code；表取 world/rules/registry.json 全部登记行，见下 entityKeyHits）。
// 每个命中落在一行登记行上（一行多处同类只计一次）。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRules, RULES_LAYOUT } from '../../../server-plugin/kernel/load/rules.mjs';
import { itemChecks, keySets } from '../lib/item-form.mjs';
import { LAYOUT, REGISTRY, regContent } from '../read.mjs';

// 规则表里不计实体 id 的表（词表式代号）：状态表（status）。
const VOCAB_LIKE_KINDS = ['status'];
const PATH_LINE = /[\w./-]+\.[A-Za-z]{1,5}(?::|#L)\d+\b/;
const ROW_KEY = /^[^|\s]*\|[^|]+\|[^|]*\|[^|]+\|\d+$/;

function namelistShape(v) {
  if (typeof v === 'string') return PATH_LINE.test(v) || ROW_KEY.test(v);
  if (Array.isArray(v)) return v.some(namelistShape);
  if (v && typeof v === 'object') {
    const vals = Object.values(v);
    const hasPath = vals.some((x) => typeof x === 'string' && /[\w-]\.[A-Za-z]{1,5}$/.test(x) && x.includes('/'));
    const hasLine = Object.entries(v).some(([k, x]) => /^line/i.test(k) && Number.isInteger(x));
    return (hasPath && hasLine) || vals.some(namelistShape);
  }
  return false;
}

// entityKey（卷六 S6-2；instance_name 类，R12-1.2 同一份实体前缀）：规则表登记（registry.json）所指各表文件里，
// 任一对象键或任一字串值带登记实体前缀（或是单例 id）即命中，与 lit_scope 的 entityPrefix 同口径。
// 扫描的表取统一加载器唯一登记 world/rules/registry.json 的全部登记行（卷十二 §2.4 :236；不另抄目录或文件名单），经 kernel/load/rules.mjs 的
// RULES_LAYOUT 与 readRules 解析登记，不另写解析。登记缺失、登记里一行表也没有、或登记所指文件在磁盘上不存在，都报 E-ACC-ITEM-PARAM，不静默放过；
// 登记与文件存在性取真实仓库根（ctx.root），命中只在被查内容（ctx.files）里找。表文件读不出 JSON 报 E-ACC-ITEM-FORM。
function entityKeyHits(ctx, params) {
  const hits = [];
  const code = params.code || '';
  const problem = (file, code2, why) => hits.push({ file, line: 0, nodeKind: 'param', symbolPath: why, code: code2 });
  const regPath = `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`;
  if (!existsSync(join(ctx.root, regPath))) { problem(regPath, 'E-ACC-ITEM-PARAM', 'rules registry missing'); return hits; }
  const tables = readRules(ctx.root).tables;
  if (!tables.length) { problem(regPath, 'E-ACC-ITEM-PARAM', 'rules registry has no table rows'); return hits; }
  // 卷六 S6-2 只管物品、材料、地点、组织、职业、铸币六类实体 id；状态行代号是状态表的词表式代号（卷四 :318 rules.death.terminalStatus 指向状态表一行，
  // 李白 11-19 22:0x ④），不是这六类，不计（与类别代号不计同理，整类口径，不按单个代号放行）。
  const exempt = new Set();
  for (const kind of VOCAB_LIKE_KINDS) {
    const f = join(ctx.root, LAYOUT.dimensionsDir, `${kind}.json`);
    if (existsSync(f)) for (const p of (JSON.parse(readFileSync(f, 'utf8')).entity || {}).idPrefix || []) exempt.add(p);
  }
  const prefixes = ctx.prefixes.prefixes.filter((p) => !exempt.has(p));
  const { singletons } = ctx.prefixes;
  const isId = (s) => typeof s === 'string' && (prefixes.some((p) => s.startsWith(p)) || singletons.includes(s));
  for (const t of tables) {
    if (!existsSync(join(ctx.root, t.file))) { problem(t.file, 'E-ACC-ITEM-PARAM', 'registered table file missing'); continue; }
    if (!ctx.files.includes(t.file)) continue;
    const file = t.file;
    let doc;
    try { doc = JSON.parse(ctx.read(file)); } catch { problem(file, 'E-ACC-ITEM-FORM', 'unparsable'); continue; }
    const walk = (node, path) => {
      if (Array.isArray(node)) { node.forEach((x) => walk(x, `${path}[]`)); return; }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (isId(k)) hits.push({ file, line: 0, nodeKind: 'key', symbolPath: path, code });
          walk(v, path ? `${path}.${isId(k) ? '*' : k}` : (isId(k) ? '*' : k));
        }
        return;
      }
      if (isId(node)) hits.push({ file, line: 0, nodeKind: 'value', symbolPath: path, code });
    };
    walk(doc, '');
  }
  return hits;
}

export function detect(ctx, params, cls) {
  const checks = new Set(params.checks || []);
  const keys = keySets(ctx.model, ctx.regs, ctx.decl);
  const hits = [];
  if (checks.has('entityKey')) hits.push(...entityKeyHits(ctx, params));
  for (const kind of params.tables || []) {
    const rows = regContent(ctx, kind);
    if (!rows) continue;
    const file = `${LAYOUT.accDir}/${REGISTRY[kind].file}`;
    const key = REGISTRY[kind].key;
    for (const row of rows) {
      const codes = new Set();
      if (REGISTRY[kind].itemRows) {
        for (const e of itemChecks(row, keys)) if (checks.has(e.check)) codes.add(e.code);
      }
      if (checks.has('namelist') && namelistShape(row)) codes.add('E-ACC-SCAN-NAMELIST');
      for (const code of [...codes].sort()) hits.push({ file, line: 0, nodeKind: 'row', symbolPath: String(row[key]), code });
    }
  }
  return hits;
}
