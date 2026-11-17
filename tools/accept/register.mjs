// acc-register（卷十二 §3.2）：§2.11 各登记文件的唯一写者。
// 输入是一份交行文件 {<登记种类>: [行…]}；按主键并入现有登记，整体核对，全部通过才写盘（写出按主键升序，确定）。
// 核对：条目形式（E-ACC-ITEM-FORM，R12-11.4）、参数只许登记键（E-ACC-ITEM-PARAM，R12-11.5）、状态只许合法转移（R12-11.7）、
// 门禁设施登记（E-ACC-GATEFAC-FORM，§2.11）、用例两极性（R12-13.3、A12-13.3）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, REGISTRY, readRegistry, readDecl, groupModel, loadContext, classPrint, matchGlobs } from './read.mjs';
import { ENUM, itemChecks, keySets } from './lib/item-form.mjs';
import { stableJson } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const NEXT_STATE = { registered: ['implemented'], implemented: ['in_core'], in_core: ['retired'], retired: [] };

export function validate(root, regs) {
  const errs = [];
  const err = (code, key, why) => errs.push(`${code} ${key}: ${why}`);
  const decl = readDecl(root);
  const model = groupModel(decl);
  const keys = keySets(model, regs);
  const groupKeys = keys.groups;
  const detectors = keys.detectors;
  const classes = new Map(regs.scanclasses.map((c) => [c.scanClass, c]));
  const uniq = (rows, key, code) => { const s = new Set(); for (const r of rows) { if (!r[key] || s.has(r[key])) err(code, r[key], `${key} missing or duplicate`); s.add(r[key]); } };

  uniq(regs.detectors, 'detectorCode', 'E-ACC-ITEM-FORM');
  uniq(regs.scanclasses, 'scanClass', 'E-ACC-ITEM-FORM');
  for (const c of regs.scanclasses) for (const d of c.detectors || []) if (!detectors.has(d)) err('E-ACC-ITEM-FORM', c.scanClass, `detector ${d} not registered`);

  uniq(regs.items, 'itemKey', 'E-ACC-ITEM-FORM');
  for (const it of regs.items) {
    const k = it.itemKey;
    for (const e of itemChecks(it, keys)) err(e.code, k, e.why);
    if (classes.has(it.scanClass) && it.detector && !(classes.get(it.scanClass).detectors || []).includes(it.detector)) err('E-ACC-ITEM-FORM', k, 'detector not listed for scanClass');
    if (it.state !== 'registered') {
      if (!it.impl || !existsSync(join(root, it.impl))) err('E-ACC-ITEM-FORM', k, 'impl missing');
      const pol = new Set(regs.cases.filter((c) => c.scanClass === it.scanClass).map((c) => c.polarity));
      if (it.form === 'scan' && !(pol.has('must_fail') && pol.has('must_pass'))) err('E-ACC-ITEM-FORM', k, 'scanClass lacks both case polarities (R12-13.3)');
    }
  }

  uniq(regs.cases, 'caseKey', 'E-ACC-ITEM-FORM');
  for (const c of regs.cases) {
    const k = c.caseKey;
    if (!classes.has(c.scanClass)) err('E-ACC-ITEM-FORM', k, 'scanClass not registered');
    if (!groupKeys.has(c.group)) err('E-ACC-ITEM-FORM', k, `group ${c.group} not declared`);
    if (!ENUM.polarity.includes(c.polarity)) err('E-ACC-ITEM-FORM', k, 'polarity');
    if (!c.fixture || !c.fixture.startsWith(LAYOUT.bypassDir + '/') || !existsSync(join(root, c.fixture))) err('E-ACC-ITEM-FORM', k, 'fixture');
    if (!c.origin || !Number.isInteger(c.addedAtRev)) err('E-ACC-ITEM-FORM', k, 'origin/addedAtRev');
  }

  uniq(regs.criteria, 'scanClass', 'E-ACC-ITEM-FORM');
  for (const c of regs.criteria) if (!classes.has(c.scanClass) || !Number.isInteger(c.rev)) err('E-ACC-ITEM-FORM', c.scanClass, 'criteria row');
  // 每个被条目引用的扫描类别都要有判据版本行（S12-13、S12-16 的修订记录落在这里）。
  const critKeys = new Set(regs.criteria.map((c) => c.scanClass));
  for (const it of regs.items) if (it.scanClass && !critKeys.has(it.scanClass)) err('E-ACC-ITEM-FORM', it.itemKey, `scanClass ${it.scanClass} has no criteria row`);

  // §2.11 门禁设施：字段齐、代号不重、不与表代号、系统登记项键、模块组键同名。
  const reserved = new Set([...groupKeys, ...Object.keys(decl.systems || {}), ...Object.keys(decl.stateKeys || {})]);
  uniq(regs.gatefacs, 'facCode', 'E-ACC-GATEFAC-FORM');
  for (const g of regs.gatefacs) {
    for (const f of ['paths', 'inRepo', 'ownerVol', 'gateCard', 'entries']) if (g[f] === undefined || g[f] === '') err('E-ACC-GATEFAC-FORM', g.facCode, `${f} missing`);
    for (const w of g.assertedWriters || []) if (!(g.entries || []).includes(w) || !(g.writerAsserts || []).length) err('E-ACC-GATEFAC-FORM', g.facCode, `assertedWriters ${w} must be an entry and writerAsserts must be listed`);
    // 删登记不能绕过（李白 11-17 裁定②）：登记了 assertedWriters（写函数豁免）就必须同时登记非空 requiredTests。
    if ((g.assertedWriters || []).length && !(Array.isArray(g.requiredTests) && g.requiredTests.length)) err('E-ACC-GATEFAC-FORM', g.facCode, 'assertedWriters requires non-empty requiredTests');
    // 离线路径段设施（李白 11-17 21:2x 裁定一）：rootFns、segmentFns 成对登记、都是 entries 里的函数，并同样须非空 requiredTests。
    if (g.rootFns !== undefined || g.segmentFns !== undefined) {
      for (const f of ['rootFns', 'segmentFns']) {
        if (!Array.isArray(g[f]) || !g[f].length) err('E-ACC-GATEFAC-FORM', g.facCode, `${f} must be a non-empty list when either is registered`);
        else for (const w of g[f]) if (!(g.entries || []).includes(w)) err('E-ACC-GATEFAC-FORM', g.facCode, `${f} ${w} must be an entry`);
      }
      if (!(Array.isArray(g.requiredTests) && g.requiredTests.length)) err('E-ACC-GATEFAC-FORM', g.facCode, 'rootFns/segmentFns require non-empty requiredTests');
    }
    for (const r of g.requiredTests || []) {
      if (!(g.testGlobs || []).length || !r.file || !Array.isArray(r.names) || !r.names.length || r.names.some((n) => typeof n !== 'string' || !n)) err('E-ACC-GATEFAC-FORM', g.facCode, `requiredTests ${r.file} needs testGlobs, file and names`);
      else if (!matchGlobs(r.file, g.testGlobs, [])) err('E-ACC-GATEFAC-FORM', g.facCode, `requiredTests ${r.file} not in testGlobs`);
    }
    if (reserved.has(g.facCode)) err('E-ACC-GATEFAC-FORM', g.facCode, 'collides with a declared key');
    if (g.inRepo === true && (!Array.isArray(g.paths) || g.paths.some((p) => p.includes('*')))) err('E-ACC-GATEFAC-FORM', g.facCode, 'in-repo paths must be listed files (李白 11-17 四-1)');
  }
  return errs;
}

function transitions(prev, next) {
  const errs = [];
  const old = new Map(prev.map((r) => [r.itemKey, r.state]));
  for (const it of next) {
    const was = old.get(it.itemKey);
    if (was === undefined) { if (it.state !== 'registered') errs.push(`E-ACC-ITEM-FORM ${it.itemKey}: new item must start registered`); continue; }
    if (was !== it.state && !NEXT_STATE[was].includes(it.state)) errs.push(`E-ACC-ITEM-FORM ${it.itemKey}: ${was} -> ${it.state} not allowed`);
  }
  return errs;
}

// 判据版本行由登记器盖两样（R12-14.3、R12-11.11）：print（类别判据代码的现指纹，S12-13）与 terms（本类别各条目的 expect、stage、gates，
// S12-16）。与上次登记相比，print 变了、或已登记条目的 terms 变了，都须本次把该类别 rev 加一并带同号修订记录，否则拒；
// rev 只许不变或加一。首次登记的类别与新条目不算修订。
const termsKey = (t) => JSON.stringify({ expect: t.expect, gates: t.gates, stage: t.stage });
function stampCriteria(root, prevRows, regs) {
  const errors = [];
  const prev = new Map(prevRows.map((c) => [c.scanClass, c]));
  const ctx = loadContext(root, { regs, files: undefined });
  const rows = regs.criteria.map((c) => {
    const terms = Object.fromEntries(regs.items.filter((it) => it.scanClass === c.scanClass).sort((a, b) => (a.itemKey < b.itemKey ? -1 : 1))
      .map((it) => [it.itemKey, { expect: it.expect, gates: it.gates, stage: it.stage }]));
    const row = { ...c, print: classPrint(ctx, c.scanClass), terms };
    const p = prev.get(c.scanClass);
    if (!p) return row;
    const stepped = row.rev === p.rev + 1 && (row.log || []).some((l) => l.rev === row.rev);
    if (row.rev !== p.rev && !stepped) errors.push(`E-ACC-ITEM-FORM ${c.scanClass}: rev must stay or step by one with a log entry`);
    if (!stepped && p.print !== undefined && p.print !== row.print) errors.push(`E-ACC-CRITERION-UNVERSIONED ${c.scanClass}: detector code changed without rev`);
    for (const [k, t] of Object.entries((p.terms) || {})) {
      if (!stepped && terms[k] && termsKey(terms[k]) !== termsKey(t)) errors.push(`E-ACC-ITEM-DOWNGRADE ${k}: expect/stage/gates changed without criteria revision`);
    }
    return row;
  });
  return { rows, errors };
}

// input.itemStates：{条目键: 新状态}，只改状态（R12-11.7 的转移），其余字段照旧。
export function register(root, input) {
  if (input.itemStates) {
    const cur = readRegistry(root, 'items');
    const patched = cur.map((r) => (r.itemKey in input.itemStates ? { ...r, state: input.itemStates[r.itemKey] } : r));
    const missing = Object.keys(input.itemStates).filter((k) => !cur.some((r) => r.itemKey === k));
    if (missing.length) return { errors: missing.map((k) => `E-ACC-ITEM-UNREGISTERED ${k}`) };
    const { itemStates, ...rest } = input;
    input = { ...rest, items: [...(rest.items || []), ...patched.filter((r) => r.itemKey in itemStates)] };
  }
  const regs = {}; const touched = [];
  for (const kind of Object.keys(REGISTRY)) {
    const key = REGISTRY[kind].key;
    const cur = new Map(readRegistry(root, kind).map((r) => [r[key], r]));
    for (const r of input[kind] || []) cur.set(r[key], r);
    regs[kind] = [...cur.values()].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
    if (input[kind]) touched.push(kind);
  }
  for (const kind of Object.keys(input)) if (!REGISTRY[kind]) return { errors: [`E-ACC-ITEM-FORM ${kind}: unknown registry`] };
  const prevCrit = readRegistry(root, 'criteria');
  const stamped = stampCriteria(root, prevCrit, regs);
  regs.criteria = stamped.rows;
  if (stableJson({ rows: regs.criteria }) !== stableJson({ rows: prevCrit }) && !touched.includes('criteria')) touched.push('criteria');
  const errors = [...transitions(readRegistry(root, 'items'), regs.items), ...stamped.errors, ...validate(root, regs)];
  if (errors.length) return { errors };
  mkdirSync(join(root, LAYOUT.accDir), { recursive: true });
  for (const kind of touched) writeFileSync(join(root, LAYOUT.accDir, REGISTRY[kind].file), stableJson({ rows: regs[kind] }));
  return { errors: [], touched };
}

// 命令行：node tools/accept/register.mjs <交行文件> [--root 目录]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? args.splice(ri, 2)[1] : join(HERE, '..', '..');
  const { errors, touched } = register(root, JSON.parse(readFileSync(args[0], 'utf8')));
  if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exit(1); }
  process.stdout.write(`registered: ${touched.join(', ')}\n`);
}
