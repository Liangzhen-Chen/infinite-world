// 卡档案与自我反思检查（亮圳 11-22「留档反思1122」；卡头第二节第 11 条）：纯函数，不碰 git。
// 小节名、证据判据、触发目录、例外、最少条数等一律从 docs/派活卡头规矩.md 第五节读，本文件不另抄一份（红线第 10 条）。
// 九项自查表题面同取自规矩文件第三节，沿用 card-selfcheck.mjs 的解析。

import { firstTable, selfcheckQuestions, parseSelfcheck, validValue, strip, CARD_RULES_DOC } from './card-selfcheck.mjs';

export const CARD_ARCHIVE_CODE = 'E-ACC-CARD-ARCHIVE';
const NONE = new Set(['—', '-', '']);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const list = (v) => String(v).split('、').map((x) => x.trim()).filter(Boolean);
const kindsOf = (cell) => (NONE.has(cell) || cell === '无' ? [] : cell.split('/').map((x) => x.trim()).filter(Boolean));

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
  for (const l of sec) {
    const m = /^- ([^：]+)：(.*)$/.exec(l);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim();
    if (key.startsWith('证据 ')) kinds[key.slice(3).trim()] = val;
    else if (key.startsWith('核实 ')) verify[key.slice(3).trim()] = val;
    else (kv[key] ||= []).push(val);
  }
  const one = (k) => (kv[k] || [])[0];
  for (const k of ['档案目录', '提交说明分支行前缀', '绕过标记', '推送目标', '开头自查表文件', '无证据项最少字数', '免条目时须卷文行条数', '自查表证据种类', '自查表可填否项', '否项原因前缀', '卷文件目录', '三方小节', '三方角色', '三方角色字段', '三方标识字段', '标识占位词', '验收目录', '验收目录唯一可改角色', '提交说明角色行前缀', '提交说明标识行前缀', '合并角色', '门禁生效提交']) {
    if (one(k) === undefined) return { error: `规矩文件第五节缺「${k}」` };
  }
  for (const [k, src] of Object.entries(kinds)) { try { new RegExp(src); } catch { return { error: `证据种类「${k}」的正则不合法` }; } }
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
    selfcheckFile: one('开头自查表文件'),
    minChars: Number(one('无证据项最少字数')),
    waiveMin: Number(one('免条目时须卷文行条数')),
    allowShort: [...(kv['允许短值'] || []), ...list(one('三方角色') || '')],
    bare: new Set(list((kv['空话词'] || [''])[0]).map(strip)),
    kinds,
    verify,
    selfKinds: kindsOf(one('自查表证据种类') || ''),
    noItems: list(one('自查表可填否项') || '').flatMap((x) => x.split(/[,，/]/)).map((x) => x.trim()).filter(Boolean),
    noPrefix: one('否项原因前缀') || '',
    volumeDir: one('卷文件目录'),
    rows,
    party: {
      section: one('三方小节'), roles: list(one('三方角色') || ''), multiRoles: list(one('三方可多条角色') || ''), roleField: one('三方角色字段'), idField: one('三方标识字段'),
      placeholder: one('标识占位词'), acceptDir: one('验收目录'), acceptRole: one('验收目录唯一可改角色'),
      mergeRole: one('合并角色'), roleLine: one('提交说明角色行前缀'), idLine: one('提交说明标识行前缀'),
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
  const why = (kinds) => `须含证据（${kinds.join('、')}）`;
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
export function checkArchive(rules, questions, readFile, cond = null, stage = '推送', repo = null) {
  const reasons = [];
  const rows = rules.rows.filter((r) => r.cond === cond && (stage === '推送' || r.stage === '提交'));
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
    if (cond === null && file === rules.selfcheckFile) {
      const head = text.split(/\r?\n## /)[0];
      const p = parseSelfcheck(head, questions, { noItems: rules.noItems, noPrefix: rules.noPrefix, rules, evidenceRes: rules.selfKinds.map((k) => rules.kinds[k]) });
      for (const r of p.reasons) reasons.push(`${file} 开头自查表：${r}`);
      // 证据格须有实据（自查表证据种类里至少一种），并核实所引文件与行号；不靠枚举敷衍词。
      const t = firstTable(head);
      for (const row of t ? t.rows : []) {
        const ev = row[3] || '';
        if (!ev) continue; // 空证据上面已报
        if (!hasEvidence(rules, ev, rules.selfKinds)) reasons.push(`${file} 开头自查表：第 ${row[0]} 项证据须含实据（${rules.selfKinds.join('、')} 至少一种），不能只写敷衍的话`);
        for (const r of verifyRefs(rules, ev, repo)) reasons.push(`${file} 开头自查表：第 ${row[0]} 项${r}`);
      }
    }
  }
  if (cond === null) reasons.push(...checkParties(rules, readFile, stage).reasons);
  return reasons;
}

// 标识比较前规范化：统一小写、去掉首尾空白（只差大小写或空白算同一个）。
export const normId = (s) => String(s || '').trim().toLowerCase();

// 三方标识（写码、出题、审卡）：每个角色恰一条（规矩「三方可多条角色」登记的角色，如审卡每轮一条，可多条）、全部标识互不相同；map[角色] 是该角色的标识数组；推送时标识里不许带占位词。派卡.md 读不到时不重复报（缺文件已报）。
export function checkParties(rules, readFile, stage) {
  const p = rules.party;
  const [file, section] = p.section.split('/');
  const text = readFile(file);
  if (text === null || text === undefined) return { map: null, reasons: [] };
  const body = sectionsOf(text).get(section);
  if (!body) return { map: null, reasons: [] };
  const row = rules.rows.find((r) => r.file === file && r.section === section);
  const names = [...new Set([p.roleField, p.idField, ...(row ? row.fields.map((f) => f.name) : [])])];
  const reasons = [];
  const map = {};
  const seen = [];
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
  }
  for (const r of p.roles) if (!(r in map)) reasons.push(`${file}「${section}」缺${p.roleField}「${r}」的条目`);
  const byId = new Map();
  for (const [role, id] of seen) byId.set(id, [...(byId.get(id) || []), role]);
  for (const [id, roles] of byId) if (roles.length > 1) reasons.push(`${file}「${section}」${roles.join('、')}的${p.idField}相同（${id}），三方须互不相同`);
  return { map, reasons };
}

// 判一个提交。入参：files 本次改动文件；branch 当前分支（提交时有）；message 提交说明（提交时给 null）；
// readFile(目录, 文件名) 读该提交里的档案；isMerge 合并提交；stage '提交'（pre-commit）或 '推送'（pre-push，默认）。
// 返回 reasons（空数组为放行）。
export function judgeCommit(rules, questions, { files, branch, message, readFile, isMerge, repo, stage = '推送' }) {
  if (isMerge && rules.mergeExempt) return [];
  const bypass = Object.entries(rules.markers).find(([, mk]) => mk && messageLine(message, mk) !== null);
  const name = messageLine(message, rules.branchPrefix) || branch;
  const touchesAccept = files.some((f) => f.startsWith(rules.party.acceptDir));
  const triggered = needsArchive(rules, files);
  const reasons = [];
  // 角色标记（有提交说明可核时才核：推送时，以及 commit-msg 钩子读到说明的提交时）：碰了触发目录或验收目录的提交，角色与标识须与三方标识一致；验收目录只许出题角色改。
  if ((stage === '推送' || message != null) && (triggered || touchesAccept)) {
    const p = rules.party;
    const role = messageLine(message, p.roleLine);
    const id = messageLine(message, p.idLine);
    if (!role || !id) reasons.push(`提交说明缺「${p.roleLine}<角色>」或「${p.idLine}<标识>」行`);
    else if (!p.roles.includes(role) && role !== p.mergeRole) reasons.push(`提交说明的${p.roleLine}「${role}」不在 ${[...p.roles, p.mergeRole].join('/')} 里`);
    else if (role === p.mergeRole) {
      // squash 合并某卡分支：分支名、标识（合并者自己的）都要写；按卡分支找档案目录核，不核三方标识，验收目录的改动不限角色。
      if (!name) reasons.push(`提交说明缺「${rules.branchPrefix}<分支名>」行，找不到卡档案目录`);
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
    return [...reasons, ...checkArchive(rules, questions, (f) => readFile(dir, f), bypass[0], stage, repo).map((r) => `${bypass[0]}登记不合格：${r}`)];
  }
  if (!triggered) return reasons;
  if (!name) return [...reasons, `提交说明缺「${rules.branchPrefix}<分支名>」行，找不到卡档案目录`];
  const dir = archiveDirOf(rules, name);
  return [...reasons, ...checkArchive(rules, questions, (f) => readFile(dir, f), null, stage, repo).map((r) => `${dir}：${r}`)];
}

export function loadRules(docText) {
  const rules = archiveRules(docText);
  if (rules.error) return rules;
  const questions = selfcheckQuestions(docText);
  if (!questions) return { error: `${CARD_RULES_DOC} 第三节的自查表解析不出` };
  return { rules, questions };
}
