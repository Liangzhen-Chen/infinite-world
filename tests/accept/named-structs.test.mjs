// 卷二 §1.5 命名 struct 机读登记（world/ontology/named-structs.json）与卷文逐条对照。
// 期望值按卷二 §1.5 :204–:248 原表抄成字面量，不读卷文、不按当前仓库读数反推（块 3 第 3-4 张）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REG = JSON.parse(readFileSync(join(ROOT, 'world/ontology/named-structs.json'), 'utf8'));
const rows = new Map(REG.rows.map((r) => [r.name, r]));

// 每个命名 struct 的字段名（按卷文顺序；点号键是判别联合变体内的数值字段，卷二 §1.5 :228 逐项列出）。
const FIELDS = {
  'struct:basis': ['kind', 'seedKey', 'writer'],
  'struct:modifier': ['id', 'target', 'scope', 'stage', 'value', 'valueRX', 'curve', 'when', 'source.kind', 'source.id', 'stackGroup', 'priority', 'unpenalized', 'duration', 'basis'],
  'struct:rxTree': [],
  'struct:sealed': ['bytes', 'digest'],
  'struct:duration': ['days', 'untilEvent'],
  'struct:terminated': ['day', 'cause', 'mode'],
  'struct:stockAnchor': ['value', 'at'],
  'struct:holding': ['kind', 'holder', 'subject', 'terms', 'grantedBy'],
  'struct:holding_terms': ['shares', 'since', 'expires'],
  'struct:effectCall': ['family', 'params'],
  'struct:statusInstance': ['status', 'severity', 'since', 'source', 'bodyPart'],
  'struct:nameParts': ['bank', 'pattern', 'parts', 'seq'],
  'struct:advancePlanItem': ['unit', 'tierOrder', 'stepMinutes', 'settleTo'],
  'struct:fixtureLot': ['item', 'count', 'materialKg', 'quality'],
  'struct:pendingPost': ['requestSeq', 'txSeq', 'emitSeq', 'entrySeq', 'signal', 'signalEvent'],
  'struct:requirementBlock': ['groups', 'basis'],
  'struct:effectCallList': [],
  'struct:entityOrder': [],
  'struct:skillRecord': ['stored', 'peak', 'lastDay', 'markDay', 'dayGain'],
  'struct:deedCounter': ['count', 'recent', 'lastDay', 'distinct', 'seeded'],
  'struct:growthRecord': ['experience', 'seededExperience'],
  'struct:lifestyleRecord': ['focus', 'focusSince', 'perks'],
  'struct:upbringingRecord': ['eduFocus'],
  'struct:lifeSeed': ['skills', 'experience', 'professions', 'certs', 'deeds'],
  'struct:assessStep': ['kind', 'check.difficulty', 'check.rounds', 'check.passes', 'work.withinDays', 'work.tenure.days', 'endorse.count', 'endorse.rank.top'],
  'struct:examSession': ['cert', 'issuer', 'place', 'day', 'candidates', 'results'],
  'struct:identityKey': ['keyId', 'kind', 'nameParts', 'lookKey', 'maskQuality', 'since', 'until'],
  'struct:lookKey': ['species', 'sex', 'lifeStage', 'bands'],
  'struct:conception': ['otherParent', 'offspringSpecies', 'sinceMinute'],
  'struct:manifestRow': ['ordinal', 'intendedType', 'form', 'areaM2', 'storeys', 'wallThicknessM', 'materialKg', 'zoneRole', 'ownerRef', 'prePlace', 'fixtures'],
  'struct:ownerKey': ['aggregate', 'org'],
  'struct:shopRow': ['ordinal', 'shopkind', 'venue', 'operator'],
  'struct:rosterSpec': ['instanceId', 'originAggregate', 'ordinal', 'species', 'birthplace', 'bornMinute', 'profession', 'certs'],
  'struct:groupEntry': ['pick', 'item', 'itemRX', 'group', 'weight', 'probPermille', 'count', 'intent', 'containerRX'],
  'struct:recurrence': ['anchor', 'appliesRX', 'spanDays', 'calendarFrom'],
  'struct:emission': ['field', 'ratePerStep', 'chance'],
  'struct:dueItem': ['dueMinute', 'kind', 'owner', 'ref', 'registeredMinute'],
  'struct:epiCount': ['infected', 'immune'],
  'struct:fnTable': ['inScale', 'outScale', 'domainMin', 'domainMax', 'step', 'values'],
  'struct:memberRange': ['origin', 'from', 'to', 'bornMinute'],
  'struct:byState<T>': ['solid', 'liquid', 'gas'],
  'struct:holderAccounts': [],
  'struct:holderOutflow': [],
  'struct:holderLots': [],
  'struct:resourceTotals': [],
};

// 数值字段的卷文单位（integer / number 同此；记号按卷二 §1.5 原表）。
const NUMERIC = {
  'struct:modifier': { priority: ['integer', 'count'], value: ['number', null] },
  'struct:duration': { days: ['integer', 'day'] },
  'struct:terminated': { day: ['integer', 'day'] },
  'struct:stockAnchor': { value: ['number', '<该维度的单位>'], at: ['integer', 'minute'] },
  'struct:holding_terms': { shares: ['number', 'fraction'], since: ['integer', 'day'], expires: ['integer', 'day'] },
  'struct:statusInstance': { severity: ['number', 'score'], since: ['integer', 'day'] },
  'struct:advancePlanItem': { stepMinutes: ['integer', 'minute'], settleTo: ['integer', 'minute'] },
  'struct:fixtureLot': { count: ['integer', 'count'], 'materialKg<value>': ['number', 'kg'] },
  'struct:pendingPost': { requestSeq: ['integer', 'count'], txSeq: ['integer', 'count'], emitSeq: ['integer', 'count'], entrySeq: ['integer', 'count'] },
  'struct:skillRecord': { stored: ['number', 'score'], peak: ['number', 'score'], lastDay: ['integer', 'day'], markDay: ['integer', 'day'], dayGain: ['number', 'score'] },
  'struct:deedCounter': { count: ['integer', 'count'], recent: ['number', 'count'], lastDay: ['integer', 'day'], seeded: ['integer', 'count'] },
  'struct:growthRecord': { experience: ['number', 'score'], seededExperience: ['number', 'score'] },
  'struct:lifestyleRecord': { focusSince: ['integer', 'day'] },
  'struct:lifeSeed': { experience: ['number', 'score'] },
  'struct:assessStep': { 'check.difficulty': ['number', 'score'], 'check.rounds': ['integer', 'count'], 'check.passes': ['integer', 'count'], 'work.withinDays': ['integer', 'day'], 'work.tenure.days': ['integer', 'day'], 'endorse.count': ['integer', 'count'], 'endorse.rank.top': ['integer', 'count'] },
  'struct:examSession': { day: ['integer', 'day'], 'results<value>': ['number', 'score'] },
  'struct:identityKey': { keyId: ['integer', 'count'], maskQuality: ['number', 'score'], since: ['integer', 'minute'], until: ['integer', 'minute'] },
  'struct:lookKey': { 'bands[]': ['integer', 'count'] },
  'struct:conception': { sinceMinute: ['integer', 'minute'] },
  'struct:manifestRow': { ordinal: ['integer', 'count'], areaM2: ['number', 'm2'], storeys: ['integer', 'count'], wallThicknessM: ['number', 'm'], 'materialKg<value>': ['number', 'kg'] },
  'struct:shopRow': { ordinal: ['integer', 'count'], venue: ['integer', 'count'] },
  'struct:rosterSpec': { ordinal: ['integer', 'count'], bornMinute: ['integer', 'minute'] },
  'struct:groupEntry': { weight: ['integer', 'count'], probPermille: ['integer', 'permille'] },
  'struct:recurrence': { spanDays: ['integer', 'day'] },
  'struct:emission': { ratePerStep: ['number', 'score'] },
  'struct:dueItem': { dueMinute: ['integer', 'minute'], registeredMinute: ['integer', 'minute'] },
  'struct:epiCount': { infected: ['integer', 'count'], immune: ['integer', 'count'] },
  'struct:fnTable': { inScale: ['integer', 'count'], outScale: ['integer', 'count'], domainMin: ['integer', 'count'], domainMax: ['integer', 'count'], step: ['integer', 'count'], 'values[]': ['integer', 'count'] },
  'struct:memberRange': { from: ['integer', 'count'], to: ['integer', 'count'], bornMinute: ['integer', 'minute'] },
};

const NUM = /^(integer|number)(?::([^\s]+))?(?: nullable)?$/;

// 嵌套容器里的数值叶子（含 map/set/list 与内联 struct 的点号路径），返回 [点号路径, base, unit]。
function numericLeaves(node, at, out) {
  if (typeof node === 'string') {
    const m = NUM.exec(node.trim());
    if (m) out.push([at, m[1], m[2] ?? null]);
    return out;
  }
  if (node && typeof node === 'object') {
    if (node.list !== undefined) numericLeaves(node.list, `${at}[]`, out);
    if (node.set !== undefined) numericLeaves(node.set, `${at}[]`, out);
    if (node.map !== undefined) numericLeaves(node.map.value, `${at}<value>`, out);
    if (node.struct !== undefined && typeof node.struct === 'object') for (const [k, v] of Object.entries(node.struct)) numericLeaves(v, at ? `${at}.${k}` : k, out);
  }
  return out;
}

test('命名 struct 登记与卷二 §1.5 表逐条一致：45 行、字段名与出处', () => {
  assert.deepEqual([...rows.keys()].sort(), Object.keys(FIELDS).sort());
  for (const [name, fields] of Object.entries(FIELDS)) {
    const row = rows.get(name);
    assert.ok(row, name);
    assert.match(row.source, /^卷二 §1\.5 :\d+/, `${name} source`);
    const got = row.type && typeof row.type.struct === 'object' ? Object.keys(row.type.struct) : [];
    assert.deepEqual(got, fields, `${name} fields`);
  }
});

// 这四个 struct 的数值单位随资源种类行，路径在 state 的账本三路径下（S6-14 豁免），另测。
const LEDGER_STRUCTS = new Set(['struct:holderAccounts', 'struct:holderOutflow', 'struct:holderLots', 'struct:resourceTotals']);

test('命名 struct 的数值字段类型与单位按卷二 §1.5 原表', () => {
  for (const row of REG.rows) {
    if (LEDGER_STRUCTS.has(row.name)) continue;
    const leaves = numericLeaves(row.type, '', []).filter(([at]) => at !== '');
    const want = NUMERIC[row.name] || {};
    const got = Object.fromEntries(leaves.map(([at, base, unit]) => [at, [base, unit]]));
    assert.deepEqual(got, want, row.name);
  }
});

test('账本三个 struct 的数值单位随资源种类行；holderLots 不存数量', () => {
  const text = (name) => JSON.stringify(rows.get(name).type);
  for (const name of ['struct:holderAccounts', 'struct:holderOutflow', 'struct:resourceTotals']) {
    assert.ok(text(name).includes('integer:<该资源种类行的 unit>'), name);
  }
  assert.ok(!text('struct:holderLots').includes('integer:'), 'holderLots 只存批次属性');
});

test('byState 带类型参数；命名引用都指向已登记的行', () => {
  assert.equal(rows.get('struct:byState<T>').typeParam, 'T');
  const baseNames = new Set(REG.rows.map((r) => r.name.replace(/<.*$/, '')));
  const refs = [];
  const walk = (node) => {
    if (typeof node === 'string') {
      const m = /^struct:([A-Za-z0-9_]+)(?:<[^>]+>)?(?: nullable)?$/.exec(node.trim());
      if (m) refs.push(`struct:${m[1]}`);
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of ['list', 'set']) if (node[k] !== undefined) walk(node[k]);
      if (node.map !== undefined) walk(node.map.value);
      if (node.struct !== undefined) {
        if (typeof node.struct === 'string') walk(node.struct); else Object.values(node.struct).forEach(walk);
      }
      if (node.union !== undefined) node.union.forEach(walk);
    }
  };
  for (const row of REG.rows) walk(row.type);
  for (const ref of refs) assert.ok(baseNames.has(ref), `${ref} 未登记`);
});

test('登记表只含卷文列出的名字，不给未登记名字开口子', () => {
  assert.equal(REG.rows.length, 45);
  assert.equal(new Set(REG.rows.map((r) => r.name)).size, 45);
});
