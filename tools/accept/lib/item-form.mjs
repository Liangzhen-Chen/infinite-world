// 条目登记行的形式核对（卷十二 §2.1 封闭枚举、§2.2、R12-11.4、R12-11.5）。登记器（写前整体核对）与检测器 data_shape（S12-4，
// 对已在盘上的登记行复核）共用同一份判据，不各写一套。每条错误带 check 代号：expect（期望值不在 acc_expect）、
// formMethod（方法与形式、方法与对象不相容）、param（参数含登记键以外的东西）、field（其余形式缺项）。

import { REGISTRY } from '../read.mjs';

// §2.1 封闭枚举。
export const ENUM = {
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
export const FORM_METHODS = {
  scan: ['static_code', 'static_data', 'static_doc', 'ledger_check'],
  invariant: ['load_check', 'unit_test', 'property_test', 'digest_compare', 'scenario_run', 'soak', 'bench', 'calc_check'],
  extend: ['scenario_run', 'digest_compare'],
  process: ['human_review', 'ledger_check'],
};
export const METHOD_TARGETS = { static_code: ['runtime_code', 'tools_code', 'tests_code'], static_data: ['data', 'registry'], static_doc: ['doc'] };
// R12-11.5 参数键：值必须是登记键。group 模块组键；code 错误码；path 状态路径模式；word 闭集代号（字面量类别、访问方向、核对项、条件）；
// fac 门禁设施代号（§2.11 gatefac）；table §2.11 登记文件种类；class 扫描类别代号（§2.4）。
export const PARAM_KINDS = {
  groups: 'group', readers: 'group', codes: 'code', code: 'code', paths: 'path', literal: 'word', access: 'word',
  facs: 'fac', callers: 'fac', roots: 'fac', modules: 'table', tables: 'table', callees: 'class', checks: 'word', cond: 'word',
};

// keys：{groups, detectors, classes, facs}，各是 Set。返回 [{check, code, why}]。
export function itemChecks(it, keys) {
  const out = [];
  const err = (check, code, why) => out.push({ check, code, why });
  for (const f of ['volume', 'localNo', 'form', 'method', 'target', 'expect', 'stage', 'gates', 'runsOn', 'source', 'state']) if (it[f] === undefined || it[f] === '') err(f === 'expect' ? 'expect' : 'field', 'E-ACC-ITEM-FORM', `${f} missing`);
  for (const f of ['form', 'method', 'target', 'expect', 'state', 'runsOn']) if (it[f] !== undefined && it[f] !== '' && !ENUM[f].includes(it[f])) err(f === 'expect' ? 'expect' : 'field', 'E-ACC-ITEM-FORM', `${f}=${it[f]} not in enum`);
  if (!Array.isArray(it.gates) || !it.gates.length || it.gates.some((g) => !ENUM.gates.includes(g))) err('field', 'E-ACC-ITEM-FORM', 'gates');
  if (!Number.isInteger(it.stage) || it.stage < 0) err('field', 'E-ACC-ITEM-FORM', 'stage');
  if (FORM_METHODS[it.form] && !FORM_METHODS[it.form].includes(it.method)) err('formMethod', 'E-ACC-ITEM-FORM', `method ${it.method} incompatible with form ${it.form}`);
  if (METHOD_TARGETS[it.method] && !METHOD_TARGETS[it.method].includes(it.target)) err('formMethod', 'E-ACC-ITEM-FORM', `target ${it.target} incompatible with method ${it.method}`);
  if (it.expect === 'report_only' && !it.reportOnlyMark) err('expect', 'E-ACC-ITEM-FORM', 'report_only without mark');
  if (it.expect === 'le_baseline' && !it.baseComp) err('expect', 'E-ACC-ITEM-FORM', 'le_baseline without baseComp');
  if (it.form === 'scan' && !keys.classes.has(it.scanClass)) err('field', 'E-ACC-ITEM-FORM', `scanClass ${it.scanClass} not registered`);
  if (it.method && String(it.method).startsWith('static_') && !keys.detectors.has(it.detector)) err('field', 'E-ACC-ITEM-FORM', `detector ${it.detector} not registered`);
  const params = it.params && typeof it.params === 'object' && !Array.isArray(it.params) ? it.params : {};
  if (it.params !== undefined && params !== it.params) err('param', 'E-ACC-ITEM-PARAM', 'params not a map');
  for (const [pk, pv] of Object.entries(params)) {
    const kind = PARAM_KINDS[pk];
    const vals = Array.isArray(pv) ? pv : [pv];
    if (!kind) { err('param', 'E-ACC-ITEM-PARAM', `param ${pk} not a registered key kind`); continue; }
    for (const v of vals) {
      if (typeof v !== 'string') err('param', 'E-ACC-ITEM-PARAM', `${pk} value not a key`);
      else if (kind === 'group' && !keys.groups.has(v)) err('param', 'E-ACC-ITEM-PARAM', `group ${v} not declared`);
      else if (kind === 'code' && !/^[EW]-[A-Z0-9-]+$/.test(v)) err('param', 'E-ACC-ITEM-PARAM', `code ${v}`);
      else if (kind === 'path' && !/^[A-Za-z*][A-Za-z0-9_*]*(\.[A-Za-z*][A-Za-z0-9_*]*)*$/.test(v)) err('param', 'E-ACC-ITEM-PARAM', `path ${v}`);
      else if (kind === 'word' && !/^[a-z][A-Za-z0-9_]*$/.test(v)) err('param', 'E-ACC-ITEM-PARAM', `${pk} ${v}`);
      else if (kind === 'fac' && !keys.facs.has(v)) err('param', 'E-ACC-ITEM-PARAM', `facility ${v} not registered`);
      else if (kind === 'table' && !(v in REGISTRY)) err('param', 'E-ACC-ITEM-PARAM', `table ${v} not registered`);
      else if (kind === 'class' && !keys.classes.has(v)) err('param', 'E-ACC-ITEM-PARAM', `class ${v} not registered`);
    }
  }
  return out;
}

export function keySets(model, regs) {
  return {
    groups: new Set(model.groups.map((g) => g.key).concat(model.offlineGroups.map((g) => g.key), Object.values(model.processes).map((p) => p.remainderGroup).filter(Boolean))),
    detectors: new Set((regs.detectors || []).map((d) => d.detectorCode)),
    classes: new Set((regs.scanclasses || []).map((c) => c.scanClass)),
    facs: new Set((regs.gatefacs || []).map((g) => g.facCode)),
  };
}
