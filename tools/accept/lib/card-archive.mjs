// 卡档案与自我反思检查（亮圳 11-22「留档反思1122」；卡头第二节第 11 条）：纯函数，不碰 git。
// 小节名、证据判据、触发目录、例外、最少条数等一律从 docs/派活卡头规矩.md 第五节读，本文件不另抄一份（红线第 10 条）。

import { matchGlobs } from '../read.mjs';
import { checkReceipt } from './receipt.mjs';

export const CARD_ARCHIVE_CODE = 'E-ACC-CARD-ARCHIVE';
export const CARD_RULES_DOC = 'docs/派活卡头规矩.md';
const NONE = new Set(['—', '-', '']);

// markdown 表格行拆格：首尾的管道不算格；没有首管道的不算表格行。
function cellsOf(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const body = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
  return body.split('|').map((c) => c.trim());
}

const SEPARATOR = /^:?-+:?$/;

// 第一张表：第一行带首管道的连续行块；第二行是全部分隔格时按表头 + 分隔行 + 数据行解析，否则只当首行是表头。
export function firstTable(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith('|'));
  if (start < 0) return null;
  const raw = [];
  for (let i = start; i < lines.length; i++) {
    const cells = cellsOf(lines[i]);
    if (!cells) break;
    raw.push(cells);
  }
  const header = raw[0];
  if (raw.length >= 2 && raw[1].length > 0 && raw[1].every((c) => SEPARATOR.test(c))) return { header, rows: raw.slice(2) };
  return { header, rows: raw.slice(1) };
}

// 值合格的唯一判法：去掉标点符号后不空、不是空话词、够字数（允许短值除外）。
export const strip = (s) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
export function validValue(rules, v) {
  const t = v.trim().replace(/[；;，,。.\s]+$/, '');
  if (rules.allowShort.includes(t)) return true;
  const s = strip(t);
  if (!s || rules.bare.has(s)) return false;
  return [...t].length >= rules.minChars;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const list = (v) => String(v).split('、').map((x) => x.trim()).filter(Boolean);
const kindsOf = (cell) => (NONE.has(cell) || cell === '无' ? [] : cell.split('/').map((x) => x.trim()).filter(Boolean));

// 三方模型族（Step 1 防回潮工具）：模型字段里含哪个家族就归一成哪个；一个都没命中时原样小写去空白。
// 族表只此一处，判断里不另写关键字（卡文：族表放成一个常量表）。
export const MODEL_FAMILIES = [
  ['deepseek', 'deepseek'],
  ['haiku', 'claude-haiku'],
  ['sonnet', 'claude-sonnet'],
  ['opus', 'claude-opus'],
  ['gemini', 'gemini'],
];
export function modelFamilies(text) {
  const t = String(text || '').toLowerCase();
  const hit = MODEL_FAMILIES.filter(([word]) => t.includes(word)).map(([, family]) => family);
  if (hit.length) return [...new Set(hit)];
  const rest = t.replace(/\s+/g, '');
  return rest ? [rest] : [];
}

// 读规矩文件第五节；坏了返回 { error }。
export function archiveRules(docText) {
  const lines = docText.split(/\r?\n/);
  const s = lines.findIndex((l) => l.startsWith('## 五、'));
  if (s < 0) return { error: '规矩文件没有第五节（卡档案格式）' };
  let e = lines.findIndex((l, i) => i > s && /^## /.test(l));
  if (e < 0) e = lines.length;
  const sec = lines.slice(s + 1, e);
  const kv = {};
  const kinds = {};
  const verify = {};
  const examples = {};
  for (const l of sec) {
    const m = /^- ([^：]+)：(.*)$/.exec(l);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (key.startsWith('证据 ')) kinds[key.slice(3).trim()] = val;
    else if (key.startsWith('证据示例 ')) examples[key.slice(5).trim()] = val;
    else if (key.startsWith('核实 ')) verify[key.slice(3).trim()] = val;
    else (kv[key] ||= []).push(val);
  }
  const one = (k) => (kv[k] || [])[0];
  for (const k of ['档案目录', '提交说明分支行前缀', '绕过标记', '推送目标', '无证据项最少字数', '免条目时须卷文行条数', '卷文件目录', '三方小节', '三方角色', '三方角色字段', '三方标识字段', '标识占位词', '验收目录', '验收目录唯一可改角色', '提交说明角色行前缀', '提交说明标识行前缀', '合并角色', '门禁生效提交']) {
    if (one(k) === undefined) return { error: `规矩文件第五节缺「${k}」` };
  }
  for (const [k, src] of Object.entries(kinds)) { try { new RegExp(src); } catch { return { error: `证据种类「${k}」的正则不合法` }; } }
  // 交接文件（L-14）：键值可缺（推送时读到远端旧规矩就没有）；只写一半即规矩自相矛盾，报错。
  const handoffFile = one('交接文件');
  const handoffKeys = list(one('交接文件必填键') || '');
  if (handoffFile !== undefined && !handoffKeys.length) return { error: '规矩文件第五节写了「交接文件」但缺「交接文件必填键」' };
  if (handoffFile === undefined && handoffKeys.length) return { error: '规矩文件第五节写了「交接文件必填键」但缺「交接文件」' };
  // 交接文件角色键（门禁封口卡 A）：「三方角色=state.json parties 下的键」，用「、」隔开；缺键时（读到远端旧规矩）不核派活凭证。
  let roleKeys = null;
  if (one('交接文件角色键') !== undefined) {
    roleKeys = {};
    for (const pair of list(one('交接文件角色键'))) {
      const m = /^(.+?)=(.+)$/.exec(pair);
      if (!m) return { error: `「交接文件角色键」的「${pair}」不是「角色=键」` };
      roleKeys[m[1].trim()] = m[2].trim();
    }
  }
  for (const k of Object.keys(examples)) if (!kinds[k]) return { error: `「证据示例 ${k}」没有对应的证据种类` };
  const tableLines = [];
  for (const l of sec) { if (l.trim().startsWith('|')) tableLines.push(l); }
  const t = firstTable(tableLines.join('\n'));
  if (!t || t.header.length !== 9) return { error: '规矩文件第五节的各文件与小节表解析不出（须 9 列）' };
  const rows = [];
  for (const r of t.rows) {
    if (r.length !== 9) return { error: `小节表有行不是 9 列：${r[0]}/${r[1]}` };
    const [file, section, form, fields, ev, min, waive, cond, stage] = r;
    if (stage !== '提交' && stage !== '推送') return { error: `小节表「查于」须为提交或推送：${file}/${section}` };
    if (form !== '文本' && form !== '条目') return { error: `小节表形式须为文本或条目：${file}/${section}` };
    const fieldSpecs = NONE.has(fields) ? [] : list(fields).map((f) => {
      const m = /^(.+?)(?:\[(.+?)\])?$/.exec(f);
      return { name: m[1].trim(), kinds: m[2] ? kindsOf(m[2]) : [] };
    });
    const row = { file, section, form, fields: fieldSpecs, kinds: kindsOf(ev), min: NONE.has(min) ? 0 : Number(min), waive: NONE.has(waive) ? null : waive, cond: NONE.has(cond) ? null : cond, stage };
    if (Number.isNaN(row.min)) return { error: `最少条数不是数字：${file}/${section}` };
    for (const k of [...row.kinds, ...fieldSpecs.flatMap((f) => f.kinds)]) if (!kinds[k]) return { error: `小节表用了未定义的证据种类「${k}」` };
    rows.push(row);
  }
  return {
    archiveDir: one('档案目录'),
    triggers: kv['触发目录'] || [],
    exceptions: (kv['例外前缀'] || []).map((v) => /^[^\s（(]+/.exec(v)[0]),
    mergeExempt: one('合并提交免查') === '是',
    branchPrefix: one('提交说明分支行前缀'),
    markers: Object.fromEntries(rows.filter((r) => r.cond).map((r) => [r.cond, one(`${r.cond}标记`)])),
    pushTarget: one('推送目标'),
    // 门禁生效提交：合入主线后回填的提交号（7～40 位十六进制）；未回填（写着别的字）时没有生效线，推送范围内的提交全查。
    effectiveCommit: /^[0-9a-f]{7,40}$/i.test(one('门禁生效提交') || '') ? one('门禁生效提交') : null,
    minChars: Number(one('无证据项最少字数')),
    waiveMin: Number(one('免条目时须卷文行条数')),
    allowShort: [...(kv['允许短值'] || []), ...list(one('三方角色') || '')],
    bare: new Set(list((kv['空话词'] || [''])[0]).map(strip)),
    kinds,
    verify,
    volumeDir: one('卷文件目录'),
    examples,
    handoff: handoffFile ? { file: handoffFile, keys: handoffKeys } : null,
    // 交接文件推送阶段核值与凭证用（门禁封口卡 A）：阶段取值、三方角色到 parties 键的映射。
    handoffPhases: list(one('交接文件阶段取值') || ''),
    handoffRoleKeys: roleKeys,
    rows,
    party: {
      section: one('三方小节'), roles: list(one('三方角色') || ''), multiRoles: list(one('三方可多条角色') || ''), roleField: one('三方角色字段'), idField: one('三方标识字段'),
      modelField: one('三方模型字段'),
      placeholder: one('标识占位词'), acceptDir: one('验收目录'), acceptRole: one('验收目录唯一可改角色'),
      mergeRole: one('合并角色'), roleLine: one('提交说明角色行前缀'), idLine: one('提交说明标识行前缀'),
      // 主会话记账角色（门禁封口卡 A，Q1）：缺键（远端旧规矩）时不认该角色。
      mainRole: one('主会话角色') || null, mainId: one('主会话标识') || null, mainFiles: list(one('主会话可改') || ''),
    },
  };
}

export function archiveDirOf(rules, branch) {
  return `${rules.archiveDir}${branch.split('/').join('-')}/`;
}

// 本次改动要不要查档案：触发目录下、且不在例外前缀下的文件。
export function needsArchive(rules, files) {
  return files.some((f) => rules.triggers.some((t) => f.startsWith(t)) && !rules.exceptions.some((x) => f.startsWith(x)));
}

// 提交说明里的「<前缀><值>」行。
export function messageLine(message, prefix) {
  for (const l of String(message || '').split(/\r?\n/)) { if (l.startsWith(prefix)) { const v = l.slice(prefix.length).trim(); if (v) return v; } }
  return null;
}

function sectionsOf(text) {
  const map = new Map();
  let cur = null;
  for (const l of text.split(/\r?\n/)) {
    const m = /^## +(.+?)\s*$/.exec(l);
    if (m) { cur = m[1]; if (!map.has(cur)) map.set(cur, []); continue; }
    if (cur !== null) map.get(cur).push(l);
  }
  return map;
}

function parseItems(lines) {
  const items = [];
  for (const l of lines) {
    const m = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) items.push(m[1]);
    else if (l.trim() && items.length) items[items.length - 1] += ` ${l.trim()}`;
  }
  return items;
}

// 「须含证据（…）」的唯一写法：种类名后接规矩登记的写法示例（证据示例 <种类>）。
export function evidenceHint(rules, kinds) {
  return `须含证据（${kinds.map((k) => (rules.examples && rules.examples[k] ? `${k}，例：${rules.examples[k]}` : k)).join('；')}）`;
}

const hasEvidence = (rules, text, kinds) => kinds.some((k) => new RegExp(rules.kinds[k]).test(text));
const countEvidence = (rules, text, kind) => (text.match(new RegExp(rules.kinds[kind], 'g')) || []).length;

// 引用核实：按规矩「核实」行登记的证据种类，把文本里每处「文件:行」「卷:行」对到该提交的树上——文件存在、行号在 1..行数。
// repo = { read(路径)→文本或 null, list(目录)→文件名数组 }；没给 repo 就拒（不能默默跳过核实）。
const lineCount = (t) => t.replace(/\s+$/, '').split('\n').length;
export function verifyRefs(rules, text, repo) {
  if (!repo) return ['未提供查仓库的入口，无法核实引用'];
  const out = [];
  const add = (r) => { if (!out.includes(r)) out.push(r); };
  for (const [kind, mode] of Object.entries(rules.verify)) {
    for (const m of text.matchAll(new RegExp(rules.kinds[kind], 'g'))) {
      const g = m.groups || {};
      const line = Number(g.line);
      let files;
      if (mode === '文件') files = [g.path];
      else if (mode === '卷') {
        const names = (repo.list(rules.volumeDir) || []).filter((n) => n.startsWith(`卷${g.vol}`) && !/^[0-9一二三四五六七八九十百零〇]/.test(n.slice(1 + g.vol.length)));
        if (!names.length) { add(`引用「${m[0]}」找不到对应的卷文件（${rules.volumeDir}卷${g.vol}-…）`); continue; }
        files = names.map((n) => `${rules.volumeDir}${n}`);
      } else return [`规矩「核实 ${kind}」的方式「${mode}」不认识`];
      const sizes = files.map((f) => { const t = repo.read(f); return t === null || t === undefined ? null : lineCount(t); }).filter((s) => s !== null);
      if (!sizes.length) add(`引用「${m[0]}」指向的文件不存在（${files.join('、')}）`);
      else if (!(line >= 1 && line <= Math.max(...sizes))) add(`引用「${m[0]}」行号超出文件范围（共 ${Math.max(...sizes)} 行）`);
    }
  }
  return out;
}

// 取条目里「字段名：值」；值到下一个字段名之前。找不到返回 null。
function fieldValues(item, names) {
  const hits = [];
  for (const name of names) {
    const m = new RegExp(`(^|[^\\u4e00-\\u9fffA-Za-z0-9])${esc(name)}\\**\\s*[:：]`).exec(item);
    if (m) hits.push({ name, start: m.index + m[1].length, valueAt: m.index + m[0].length });
  }
  const out = {};
  for (const h of hits) {
    const next = hits.filter((o) => o.start > h.start).map((o) => o.start);
    out[h.name] = item.slice(h.valueAt, next.length ? Math.min(...next) : undefined).trim();
  }
  return out;
}

function checkSection(rules, row, body, label, reasons) {
  const lines = body;
  const text = lines.join('\n').trim();
  const why = (kinds) => evidenceHint(rules, kinds);
  if (row.form === '文本') {
    if (!validValue(rules, text)) { reasons.push(`${label}内容空、只有是/否/无/✓ 之类空话，或不足 ${rules.minChars} 字`); return; }
    if (row.kinds.length && !hasEvidence(rules, text, row.kinds)) reasons.push(`${label}缺证据：${why(row.kinds)}`);
    return;
  }
  if (row.waive && text.includes(row.waive)) {
    const n = countEvidence(rules, text, '卷文行');
    if (n < rules.waiveMin) reasons.push(`${label}写了「${row.waive}」，须逐项列出核过的设计条目（卷:行）至少 ${rules.waiveMin} 条，实为 ${n} 条`);
    return;
  }
  const items = parseItems(lines);
  if (items.length < row.min) { reasons.push(`${label}条目 ${items.length} 条，须至少 ${row.min} 条`); return; }
  items.forEach((item, i) => {
    const at = `${label}第 ${i + 1} 条`;
    if (!row.fields.length) {
      if (!validValue(rules, item)) reasons.push(`${at}内容空或是空话`);
      else if (row.kinds.length && !hasEvidence(rules, item, row.kinds)) reasons.push(`${at}缺证据：${why(row.kinds)}`);
      return;
    }
    const vals = fieldValues(item, row.fields.map((f) => f.name));
    for (const f of row.fields) {
      if (!(f.name in vals)) { reasons.push(`${at}缺字段「${f.name}」`); continue; }
      const v = vals[f.name];
      if (!validValue(rules, v)) { reasons.push(`${at}字段「${f.name}」为空、是空话或不足 ${rules.minChars} 字（确无理由须明写「无理由」）`); continue; }
      if (f.kinds.length && !hasEvidence(rules, v, f.kinds)) reasons.push(`${at}字段「${f.name}」缺证据：${why(f.kinds)}`);
    }
  });
}

// 查一个档案目录：readFile(文件名) 返回文本或 null。cond 为 null 查平时各行，否则只查该条件的行（如绕过记录）。
// ctx（门禁封口卡 A）：only 只查这几个文件（派前自检用，其余文件不读）；dir 档案目录；history 推送头的提交历史（核 orca 凭证用）。
export function checkArchive(rules, readFile, cond = null, stage = '推送', repo = null, ctx = {}) {
  const want = (f) => !ctx.only || ctx.only.includes(f);
  const [partyFile] = rules.party.section.split('/');
  const parties = cond === null && want(partyFile) ? checkParties(rules, readFile, stage) : null;
  const reasons = cond === null && rules.handoff && want(rules.handoff.file) ? checkHandoff(rules, readFile, stage, { ...ctx, repo, models: parties ? parties.models : {}, ids: parties && parties.map ? parties.map : {} }) : [];
  const rows = rules.rows.filter((r) => r.cond === cond && (stage === '推送' || r.stage === '提交') && want(r.file));
  for (const file of [...new Set(rows.map((r) => r.file))]) {
    const text = readFile(file);
    if (text === null || text === undefined) { reasons.push(`缺文件 ${file}`); continue; }
    const secs = sectionsOf(text);
    for (const row of rows.filter((r) => r.file === file)) {
      if (!secs.has(row.section)) { reasons.push(`${file} 缺小节「${row.section}」`); continue; }
      const label = `${file}「${row.section}」`;
      checkSection(rules, row, secs.get(row.section), label, reasons);
      for (const r of verifyRefs(rules, secs.get(row.section).join('\n'), repo)) reasons.push(`${label}${r}`);
    }
  }
  if (parties) reasons.push(...parties.reasons);
  return reasons;
}

// 读交接文件：没有返回 obj null；坏 JSON 或不是对象给原因。checkHandoff 与借档核对共用。
function readHandoff(rules, readFile) {
  const f = rules.handoff.file;
  const text = readFile(f);
  if (text === null || text === undefined) return { obj: null, reasons: [] };
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { obj: null, reasons: [`${f} 不是合法 JSON：${e.message}`] }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { obj: null, reasons: [`${f} 须是 JSON 对象`] };
  return { obj, reasons: [] };
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

// 交接文件（L-14；门禁封口卡 A 收紧）：有该文件时须是合法 JSON 对象且规矩登记的必填键齐全；提交阶段没有不拒（凭证陆续到齐），
// 推送阶段缺即拒，并核值（phase 取值、nextAction 非空话、blocker、updatedAt、failCount）与三方派活凭证。
export function checkHandoff(rules, readFile, stage = '提交', ctx = {}) {
  if (!rules.handoff) return [];
  const f = rules.handoff.file;
  const { obj, reasons } = readHandoff(rules, readFile);
  if (reasons.length) return reasons;
  if (!obj) return stage === '推送' ? [`缺文件 ${f}（推送阶段交接文件必有）`] : [];
  const missing = rules.handoff.keys.filter((k) => !Object.prototype.hasOwnProperty.call(obj, k));
  if (missing.length) return [`${f} 缺必填键：${missing.join('、')}`];
  if (stage !== '推送') return [];
  const out = [];
  const phases = rules.handoffPhases;
  if (phases.length && !phases.includes(obj.phase)) out.push(`${f} 的 phase「${obj.phase}」不在规矩登记的取值（${phases.join('、')}）里`);
  if (typeof obj.nextAction !== 'string' || !validValue(rules, obj.nextAction)) out.push(`${f} 的 nextAction 为空、是空话或不足 ${rules.minChars} 字`);
  if (obj.blocker !== null && (typeof obj.blocker !== 'string' || !obj.blocker.trim())) out.push(`${f} 的 blocker 须为 null 或非空字符串`);
  if (typeof obj.updatedAt !== 'string' || !ISO_TIME.test(obj.updatedAt) || Number.isNaN(Date.parse(obj.updatedAt))) out.push(`${f} 的 updatedAt 须是 ISO 8601 时间`);
  if (!Number.isInteger(obj.failCount) || obj.failCount < 0) out.push(`${f} 的 failCount 须是非负整数`);
  out.push(...credentialReasons(rules, obj, ctx));
  return out;
}

// 三方派活凭证（门禁封口卡 A；CLAUDE.md 第 3 节「会员会话卡在 state.json 记工作树、会话与提交号作等效凭证」）：
// 规矩「交接文件角色键」把三方角色映射到 parties 下的键；每个角色二选一写 receipt（档案目录里的收据文件路径）或 orca（{worktree, session, commits}）。
// 「三方可多条角色」登记的角色（审卡多轮）可写成数组。规矩没有角色键时（远端旧规矩）不核。
function credentialReasons(rules, obj, ctx) {
  const keys = rules.handoffRoleKeys;
  if (!keys) return [];
  const f = rules.handoff.file;
  const p = rules.party;
  const out = [];
  for (const role of p.roles) {
    const key = keys[role];
    if (!key) { out.push(`规矩「交接文件角色键」没有登记「${role}」`); continue; }
    const raw = obj.parties && typeof obj.parties === 'object' ? obj.parties[key] : undefined;
    if (Array.isArray(raw) && !p.multiRoles.includes(role)) { out.push(`${f} parties.${key}（${role}）只许一条，不许写成数组`); continue; }
    const entries = Array.isArray(raw) ? raw : [raw];
    if (!entries.length) { out.push(`${f} parties.${key}（${role}）是空数组，缺派活凭证`); continue; }
    entries.forEach((c, i) => out.push(...credentialOf(rules, role, c, `${f} parties.${key}${Array.isArray(raw) ? `[${i}]` : ''}（${role}）`, ctx, Array.isArray(raw) ? i : null)));
  }
  return out;
}

function credentialOf(rules, role, c, at, ctx, round) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${at} 须是对象`];
  const hasReceipt = c.receipt !== null && c.receipt !== undefined;
  const hasOrca = c.orca !== null && c.orca !== undefined;
  if (!hasReceipt && !hasOrca) return [`${at} 没有派活凭证：须写 receipt（档案目录里的收据文件路径）或 orca（{worktree, session, commits}）二选一`];
  return [...(hasReceipt ? receiptReasons(rules, role, c.receipt, at, ctx) : []), ...(hasOrca ? orcaReasons(rules, role, c.orca, at, ctx, round) : [])];
}

function receiptReasons(rules, role, path, at, { dir, repo, models }) {
  if (typeof path !== 'string' || !path) return [`${at} receipt 须是收据文件路径`];
  if (!dir || !path.startsWith(dir)) return [`${at} receipt「${path}」须在本卡档案目录 ${dir || '（未定位）'} 下`];
  const text = repo ? repo.read(path) : null;
  if (text === null || text === undefined) return [`${at} receipt「${path}」读不到`];
  let r;
  try { r = JSON.parse(text); } catch { return [`${at} receipt「${path}」不是合法 JSON 收据文件`]; }
  const bad = checkReceipt(r);
  if (bad.length) return bad.map((b) => `${at} receipt「${path}」${b}`);
  const out = [];
  if (r.role !== role) out.push(`${at} receipt「${path}」的 role「${r.role}」不是「${role}」`);
  // 模型族比对同 modelFamilyReasons：规矩没有「三方模型字段」键（远端旧规矩）时不核。
  const registered = (models && models[role]) || [];
  if (rules.party.modelField && !modelFamilies(r.model).some((x) => registered.includes(x))) out.push(`${at} receipt「${path}」的 model「${r.model}」与三方标识里「${role}」登记的模型族（${registered.join('、') || '无'}）不一致`);
  return out;
}

// 提交须是本卡该角色的：角色行是该角色，标识行等于本卡三方标识里该角色登记的标识（审卡写成数组时第 round 条对第 round 个审卡标识）。
function orcaReasons(rules, role, o, at, { history, ids }, round) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return [`${at} orca 须是 {worktree, session, commits}`];
  const out = [];
  const registered = (ids && ids[role]) || [];
  const expected = round === null ? registered : registered.slice(round, round + 1);
  if (!expected.length) out.push(`${at} 三方标识里没有对应的「${role}」标识${round === null ? '' : `（第 ${round + 1} 条）`}，无法核对 orca.commits 的标识`);
  for (const k of ['worktree', 'session']) if (typeof o[k] !== 'string' || !o[k].trim()) out.push(`${at} orca.${k} 须是非空字符串`);
  if (!Array.isArray(o.commits) || !o.commits.length) return [...out, `${at} orca.commits 须是非空提交号数组`];
  if (!history) return [...out, `${at} 未提供推送头的提交历史，无法核对 orca.commits`];
  for (const sha of o.commits) {
    if (typeof sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(sha)) { out.push(`${at} orca.commits 里「${sha}」不是提交号`); continue; }
    if (!history.reachable(sha)) { out.push(`${at} orca.commits 里 ${sha} 不能从推送头到达`); continue; }
    const text = history.message(sha);
    const r = messageLine(text, rules.party.roleLine);
    if (r !== role) { out.push(`${at} orca.commits 里 ${sha} 的提交说明「${rules.party.roleLine}${r || '无'}」不是「${role}」`); continue; }
    const id = messageLine(text, rules.party.idLine);
    if (expected.length && !expected.includes(normId(id))) out.push(`${at} orca.commits 里 ${sha} 的提交说明「${rules.party.idLine}${id || '无'}」不是本卡三方标识里「${role}」的「${expected.join('、')}」`);
  }
  return out;
}

// 借档核对（门禁封口卡 A）：推送时被触发提交指向的档案目录，须在本次推送范围里有改动，且交接文件的 branches 含该卡分支；
// 给了 head 分支（CI 传入 PR 头分支或直推的分支名）时它也须在 branches 里。
function borrowReasons(rules, dir, name, readFile, rangeFiles, headBranch) {
  const out = [];
  if (!Array.isArray(rangeFiles)) out.push('未提供本次推送范围的改动文件，无法核对档案归属');
  else if (!rangeFiles.some((f) => f.startsWith(dir))) out.push(`本次推送范围里没有改动档案目录 ${dir}，不能借用已有档案过关`);
  if (!rules.handoff) return out;
  const { obj } = readHandoff(rules, (f) => readFile(dir, f));
  if (!obj) return out; // 缺文件或坏 JSON 由 checkHandoff 报
  const b = obj.branches;
  const branches = Array.isArray(b) ? b : b && typeof b === 'object' ? Object.values(b) : [];
  const f = `${dir}${rules.handoff.file}`;
  if (!branches.includes(name)) out.push(`${f} 的 branches 不含卡分支「${name}」`);
  if (headBranch && !branches.includes(headBranch)) out.push(`${f} 的 branches 不含本次推送的头分支「${headBranch}」`);
  return out;
}

// 主会话记账提交（Q1）：标识须是规矩登记的主会话标识，改动文件只许落在「主会话可改」登记的路径模式里。
function mainSessionReasons(rules, files, id) {
  const p = rules.party;
  const out = [];
  if (normId(id) !== normId(p.mainId)) out.push(`「${p.roleLine}${p.mainRole}」的提交标识须是规矩登记的主会话标识「${p.mainId}」，实为「${id || '无'}」`);
  const bad = files.filter((f) => !matchGlobs(f, p.mainFiles, []));
  if (bad.length) out.push(`「${p.roleLine}${p.mainRole}」的提交只许改 ${p.mainFiles.join('、')}，改了 ${bad.join('、')}`);
  return out;
}

// 标识比较前规范化：统一小写、去掉首尾空白（只差大小写或空白算同一个）。
export const normId = (s) => String(s || '').trim().toLowerCase();

// 「三方标识」条目要认的字段名：角色、标识、模型，加上小节表里登记的字段。一处算，checkParties 与派卡前检查共用。
function partyFieldNames(rules, file, section) {
  const p = rules.party;
  const row = rules.rows.find((r) => r.file === file && r.section === section);
  return [...new Set([p.roleField, p.idField, ...(p.modelField ? [p.modelField] : []), ...(row ? row.fields.map((f) => f.name) : [])])];
}

// 三方模型族判据（唯一一处，checkParties 与 dispatch 派前检查共用）：写码族与出题族不相交，每个审卡族不在两者并集里；审卡多轮之间可同族。
// 某角色没登记模型也报（无从核对）。规矩没有「三方模型字段」键时（推送时读远端旧规矩）不核。
export function modelFamilyReasons(rules, models, file, section) {
  const p = rules.party;
  if (!p.modelField) return [];
  const [writer, tester, ...reviewers] = p.roles;
  const fams = (role) => new Set(models[role] || []);
  const wf = fams(writer); const tf = fams(tester); const rf = new Set(reviewers.flatMap((r) => [...fams(r)]));
  const reasons = [];
  for (const role of p.roles) if (!(models[role] || []).length) reasons.push(`${file}「${section}」${role}的${p.modelField}为空，无法核对模型族`);
  const same = [...wf].filter((x) => tf.has(x));
  if (same.length) reasons.push(`${file}「${section}」写码与出题的模型族相同（${same.join('、')}），三方族须互不相同`);
  const clash = [...rf].filter((x) => wf.has(x) || tf.has(x));
  if (clash.length) reasons.push(`${file}「${section}」审卡与写码或出题的模型族相同（${clash.join('、')}），三方族须互不相同`);
  return reasons;
}

// 从派卡.md 的三方标识里取各角色登记的模型族（派卡前检查用；与 checkParties 同一套解析与族表）。
export function partyModelFamilies(rules, readFile) {
  const p = rules.party;
  const [file, section] = p.section.split('/');
  const text = readFile(file);
  if (text === null || text === undefined) return null;
  const body = sectionsOf(text).get(section);
  if (!body || !p.modelField) return null;
  const names = partyFieldNames(rules, file, section);
  const clean = (s) => (s || '').replace(/[\s；;，,。.]+$/, '');
  const models = {};
  for (const item of parseItems(body)) {
    const v = fieldValues(item, names);
    const role = clean(v[p.roleField]);
    if (!p.roles.includes(role)) continue;
    models[role] = [...(models[role] || []), ...modelFamilies(clean(v[p.modelField]))];
  }
  return { file, section, models };
}

// 三方标识（写码、出题、审卡）：每个角色恰一条（规矩「三方可多条角色」登记的角色，如审卡每轮一条，可多条）、全部标识互不相同；map[角色] 是该角色的标识数组；推送时标识里不许带占位词。派卡.md 读不到时不重复报（缺文件已报）。
export function checkParties(rules, readFile, stage) {
  const p = rules.party;
  const [file, section] = p.section.split('/');
  const text = readFile(file);
  if (text === null || text === undefined) return { map: null, reasons: [], models: {} };
  const body = sectionsOf(text).get(section);
  if (!body) return { map: null, reasons: [], models: {} };
  const names = partyFieldNames(rules, file, section);
  const reasons = [];
  const map = {};
  const seen = [];
  const models = {};
  for (const item of parseItems(body)) {
    const v = fieldValues(item, names);
    const clean = (s) => (s || '').replace(/[\s；;，,。.]+$/, '');
    const role = clean(v[p.roleField]);
    const id = normId(clean(v[p.idField]));
    if (!p.roles.includes(role)) { reasons.push(`${file}「${section}」有条目的${p.roleField}「${role || '空'}」不在 ${p.roles.join('/')} 里`); continue; }
    if (role in map && !p.multiRoles.includes(role)) { reasons.push(`${file}「${section}」${p.roleField}「${role}」写了不止一条`); continue; }
    if (!validValue(rules, id)) { reasons.push(`${file}「${section}」${role}的${p.idField}为空或是空话`); continue; }
    if (stage === '推送' && id.includes(normId(p.placeholder))) { reasons.push(`${file}「${section}」${role}的${p.idField}「${id}」仍是占位（含「${p.placeholder}」）`); continue; }
    map[role] = [...(map[role] || []), id];
    seen.push([role, id]);
    if (p.modelField) models[role] = [...(models[role] || []), ...modelFamilies(clean(v[p.modelField]))];
  }
  for (const r of p.roles) if (!(r in map)) reasons.push(`${file}「${section}」缺${p.roleField}「${r}」的条目`);
  const byId = new Map();
  for (const [role, id] of seen) byId.set(id, [...(byId.get(id) || []), role]);
  for (const [id, roles] of byId) if (roles.length > 1) reasons.push(`${file}「${section}」${roles.join('、')}的${p.idField}相同（${id}），三方须互不相同`);
  // 三方模型族（可选规矩键；缺键不核，兼容推送时读远端旧规矩）：判据在 modelFamilyReasons，一处。
  reasons.push(...modelFamilyReasons(rules, models, file, section));
  return { map, reasons, models };
}

// 判一个提交。入参：files 本次改动文件；branch 当前分支（提交时有）；message 提交说明（提交时给 null）；
// readFile(目录, 文件名) 读该提交里的档案；isMerge 合并提交；stage '提交'（pre-commit）或 '推送'（pre-push，默认）。
// 推送阶段另给（门禁封口卡 A）：rangeFiles 本次推送范围的改动文件（借档核对）；headBranch CI 传入的头分支（可缺）；
// history { reachable(sha), message(sha) } 推送头的提交历史（核 orca 凭证）。
// ownFiles（审卡第 1 轮必须改 1）：合并提交自身引入的改动（解冲突或夹带，git diff-tree --cc）；角色与验收目录按它核，
// 要不要档案仍按 files（对第一父的差集）判。非合并提交不给，等于 files。
// 返回 reasons（空数组为放行）。
export function judgeCommit(rules, { files, branch, message, readFile, isMerge, repo, stage = '推送', rangeFiles = null, headBranch = null, history = null, ownFiles = null }) {
  if (isMerge && rules.mergeExempt) return [];
  const bypass = Object.entries(rules.markers).find(([, mk]) => mk && messageLine(message, mk) !== null);
  const name = messageLine(message, rules.branchPrefix) || branch;
  const own = ownFiles || files;
  const touchesAccept = own.some((f) => f.startsWith(rules.party.acceptDir));
  const triggered = needsArchive(rules, files);
  const reasons = [];
  const p = rules.party;
  const role = messageLine(message, p.roleLine);
  const id = messageLine(message, p.idLine);
  // 「合并」只认真合并提交（Q1）、「主会话」只许改登记路径：说明里写了就核，不论是否触发。
  const fakeMerge = role === p.mergeRole && !isMerge;
  if (fakeMerge) reasons.push(`提交说明写了「${p.roleLine}${p.mergeRole}」但不是合并提交（只有一个父提交）；该角色只许 PR 真合并的合并提交用`);
  const isMain = p.mainRole !== null && role === p.mainRole;
  if (isMain) reasons.push(...mainSessionReasons(rules, files, id));
  // 角色标记（有提交说明可核时才核：推送时，以及 commit-msg 钩子读到说明的提交时）：碰了触发目录或验收目录的提交，角色与标识须与三方标识一致；验收目录只许出题角色改。
  if ((stage === '推送' || message != null) && (triggered || touchesAccept)) {
    const known = [...p.roles, p.mergeRole, ...(p.mainRole ? [p.mainRole] : [])];
    if (!role || !id) reasons.push(`提交说明缺「${p.roleLine}<角色>」或「${p.idLine}<标识>」行`);
    else if (!known.includes(role)) reasons.push(`提交说明的${p.roleLine}「${role}」不在 ${known.join('/')} 里`);
    else if (role === p.mergeRole && isMerge) {
      // PR 真合并：分支名、标识（合并者自己的）都要写；按卡分支找档案目录核，不核三方标识。
      // 合并者不是三方之一：合并自身引入的改动（ownFiles）不许落在触发目录或验收目录，解冲突须由卡角色在卡分支上提交。
      if (!name) reasons.push(`提交说明缺「${rules.branchPrefix}<分支名>」行，找不到卡档案目录`);
      const smuggled = own.filter((f) => f.startsWith(p.acceptDir) || needsArchive(rules, [f]));
      if (smuggled.length) reasons.push(`「${p.roleLine}${p.mergeRole}」的合并提交自身改动了 ${smuggled.join('、')}（合并者不是三方之一，触发目录与验收目录的改动须由卡角色在卡分支上提交）`);
    } else if (fakeMerge || isMain) {
      // 已拒；冒用者碰了验收目录同样报出。
      if (touchesAccept) reasons.push(`${role}的提交改动了验收目录 ${p.acceptDir}，只许「${p.acceptRole}」角色改`);
    } else {
      if (touchesAccept && role !== p.acceptRole) reasons.push(`${role}的提交改动了验收目录 ${p.acceptDir}，只许「${p.acceptRole}」角色改`);
      if (!name) reasons.push(`提交说明缺「${rules.branchPrefix}<分支名>」行，找不到三方标识`);
      else {
        const dir = archiveDirOf(rules, name);
        const { map } = checkParties(rules, (f) => readFile(dir, f), stage);
        if (!map) reasons.push(`读不到 ${dir}${p.section}，无法核对角色标识`);
        else if (!(map[role] || []).includes(normId(id))) reasons.push(`提交说明的${p.idLine}「${id}」与三方标识里「${role}」的「${(map[role] || ['无']).join('、')}」不一致`);
      }
    }
  }
  if (bypass) {
    if (!name) return [...reasons, `提交说明带「${rules.markers[bypass[0]]}」但没有「${rules.branchPrefix}<分支名>」行，找不到${bypass[0]}记录`];
    const dir = archiveDirOf(rules, name);
    return [...reasons, ...checkArchive(rules, (f) => readFile(dir, f), bypass[0], stage, repo).map((r) => `${bypass[0]}登记不合格：${r}`)];
  }
  if (!triggered) return reasons;
  if (!name) return [...reasons, `提交说明缺「${rules.branchPrefix}<分支名>」行，找不到卡档案目录`];
  const dir = archiveDirOf(rules, name);
  const borrowed = stage === '推送' ? borrowReasons(rules, dir, name, readFile, rangeFiles, headBranch) : [];
  return [...reasons, ...[...borrowed, ...checkArchive(rules, (f) => readFile(dir, f), null, stage, repo, { dir, history })].map((r) => `${dir}：${r}`)];
}

export function loadRules(docText) {
  const rules = archiveRules(docText);
  if (rules.error) return rules;
  return { rules };
}
