// acc-register（卷十二 §3.2）：§2.11 各登记文件的唯一写者。
// 输入是一份交行文件 {<登记种类>: [行…]}；按主键并入现有登记，整体核对，全部通过才写盘（写出按主键升序，确定）。
// 核对：条目形式（E-ACC-ITEM-FORM，R12-11.4）、参数只许登记键（E-ACC-ITEM-PARAM，R12-11.5）、状态只许合法转移（R12-11.7）、
// 门禁设施登记（E-ACC-GATEFAC-FORM，§2.11）、用例两极性（R12-13.3、A12-13.3）。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, REGISTRY, readRegistry, readDecl, groupModel } from './read.mjs';
import { stableJson } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// §2.1 封闭枚举。
const ENUM = {
  form: ['scan', 'invariant', 'extend', 'process'],
  method: ['static_code', 'static_data', 'static_doc', 'load_check', 'unit_test', 'property_test', 'digest_compare', 'scenario_run', 'soak', 'bench', 'calc_check', 'ledger_check', 'human_review'],
  target: ['runtime_code', 'tools_code', 'tests_code', 'data', 'registry', 'doc', 'world_run'],
  expect: ['zero', 'le_baseline', 'equal', 'within', 'all_pass', 'report_only'],
  state: ['registered', 'implemented', 'in_core', 'retired'],
  gates: ['pre_commit', 'pre_test', 'pre_merge', 'phase_exit', 'seal', 'book_close'],
  runsOn: ['local_static', 'cloud_ref', 'player_platform'],
  polarity: ['must_fail', 'must_pass'],
};
// R12-11.4 形式与方法的相容关系。
const FORM_METHODS = {
  scan: ['static_code', 'static_data', 'static_doc', 'ledger_check'],
  invariant: ['load_check', 'unit_test', 'property_test', 'digest_compare', 'scenario_run', 'soak', 'bench', 'calc_check'],
  extend: ['scenario_run', 'digest_compare'],
  process: ['human_review', 'ledger_check'],
};
const METHOD_TARGETS = { static_code: ['runtime_code', 'tools_code', 'tests_code'], static_data: ['data', 'registry'], static_doc: ['doc'] };
const NEXT_STATE = { registered: ['implemented'], implemented: ['in_core'], in_core: ['retired'], retired: [] };
// R12-11.5 参数键：值必须是登记键（组键、错误码、路径模式、字面量类别、访问方向）。
const PARAM_KINDS = { groups: 'group', readers: 'group', codes: 'code', code: 'code', paths: 'path', literal: 'word', access: 'word' };

export function validate(root, regs) {
  const errs = [];
  const err = (code, key, why) => errs.push(`${code} ${key}: ${why}`);
  const decl = readDecl(root);
  const model = groupModel(decl);
  const groupKeys = new Set(model.groups.map((g) => g.key).concat(Object.values(model.processes).map((p) => p.remainderGroup).filter(Boolean)));
  const detectors = new Set(regs.detectors.map((d) => d.detectorCode));
  const classes = new Map(regs.scanclasses.map((c) => [c.scanClass, c]));
  const uniq = (rows, key, code) => { const s = new Set(); for (const r of rows) { if (!r[key] || s.has(r[key])) err(code, r[key], `${key} missing or duplicate`); s.add(r[key]); } };

  uniq(regs.detectors, 'detectorCode', 'E-ACC-ITEM-FORM');
  uniq(regs.scanclasses, 'scanClass', 'E-ACC-ITEM-FORM');
  for (const c of regs.scanclasses) for (const d of c.detectors || []) if (!detectors.has(d)) err('E-ACC-ITEM-FORM', c.scanClass, `detector ${d} not registered`);

  uniq(regs.items, 'itemKey', 'E-ACC-ITEM-FORM');
  for (const it of regs.items) {
    const k = it.itemKey;
    for (const f of ['volume', 'localNo', 'form', 'method', 'target', 'expect', 'stage', 'gates', 'runsOn', 'source', 'state']) if (it[f] === undefined || it[f] === '') err('E-ACC-ITEM-FORM', k, `${f} missing`);
    for (const f of ['form', 'method', 'target', 'expect', 'state', 'runsOn']) if (it[f] !== undefined && !ENUM[f].includes(it[f])) err('E-ACC-ITEM-FORM', k, `${f}=${it[f]} not in enum`);
    if (!Array.isArray(it.gates) || !it.gates.length || it.gates.some((g) => !ENUM.gates.includes(g))) err('E-ACC-ITEM-FORM', k, 'gates');
    if (!Number.isInteger(it.stage) || it.stage < 0) err('E-ACC-ITEM-FORM', k, 'stage');
    if (FORM_METHODS[it.form] && !FORM_METHODS[it.form].includes(it.method)) err('E-ACC-ITEM-FORM', k, `method ${it.method} incompatible with form ${it.form}`);
    if (METHOD_TARGETS[it.method] && !METHOD_TARGETS[it.method].includes(it.target)) err('E-ACC-ITEM-FORM', k, `target ${it.target} incompatible with method ${it.method}`);
    if (it.expect === 'report_only' && !it.reportOnlyMark) err('E-ACC-ITEM-FORM', k, 'report_only without mark');
    if (it.expect === 'le_baseline' && !it.baseComp) err('E-ACC-ITEM-FORM', k, 'le_baseline without baseComp');
    if (it.form === 'scan' && !classes.has(it.scanClass)) err('E-ACC-ITEM-FORM', k, `scanClass ${it.scanClass} not registered`);
    if (it.method && it.method.startsWith('static_') && !detectors.has(it.detector)) err('E-ACC-ITEM-FORM', k, `detector ${it.detector} not registered`);
    if (classes.has(it.scanClass) && it.detector && !(classes.get(it.scanClass).detectors || []).includes(it.detector)) err('E-ACC-ITEM-FORM', k, 'detector not listed for scanClass');
    for (const [pk, pv] of Object.entries(it.params || {})) {
      const kind = PARAM_KINDS[pk];
      const vals = Array.isArray(pv) ? pv : [pv];
      if (!kind) { err('E-ACC-ITEM-PARAM', k, `param ${pk} not a registered key kind`); continue; }
      for (const v of vals) {
        if (typeof v !== 'string') err('E-ACC-ITEM-PARAM', k, `${pk} value not a key`);
        else if (kind === 'group' && !groupKeys.has(v)) err('E-ACC-ITEM-PARAM', k, `group ${v} not declared`);
        else if (kind === 'code' && !/^[EW]-[A-Z0-9-]+$/.test(v)) err('E-ACC-ITEM-PARAM', k, `code ${v}`);
        else if (kind === 'path' && !/^[A-Za-z*][A-Za-z0-9_*]*(\.[A-Za-z*][A-Za-z0-9_*]*)*$/.test(v)) err('E-ACC-ITEM-PARAM', k, `path ${v}`);
        else if (kind === 'word' && !/^[a-z][A-Za-z0-9_]*$/.test(v)) err('E-ACC-ITEM-PARAM', k, `${pk} ${v}`);
      }
    }
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

  // §2.11 门禁设施：字段齐、代号不重、不与表代号、系统登记项键、模块组键同名。
  const reserved = new Set([...groupKeys, ...Object.keys(decl.systems || {}), ...Object.keys(decl.stateKeys || {})]);
  uniq(regs.gatefacs, 'facCode', 'E-ACC-GATEFAC-FORM');
  for (const g of regs.gatefacs) {
    for (const f of ['paths', 'inRepo', 'ownerVol', 'gateCard', 'entries']) if (g[f] === undefined || g[f] === '') err('E-ACC-GATEFAC-FORM', g.facCode, `${f} missing`);
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
  const errors = [...transitions(readRegistry(root, 'items'), regs.items), ...validate(root, regs)];
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
