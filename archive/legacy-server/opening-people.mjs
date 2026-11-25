// 开局人物载入（李白 11-24「家户两问1122」H-4；卷四 §4.10 P-4 :984；卷十八 R18-2.9 :712、A18-2.2 :746）：世界创建事务里把开局名册（tools/convert-people-hw.mjs 从旧作者数据转出的
// world/people/opening-roster-hw.json，只含代号与数值）里的人物经 instantiatePerson 建成个体偏离行，再把有家户的人写进家户：每户恰一条户主边，其余成员各一条成员边。
// 手写的具名个体也走 instantiatePerson（P-4）：名册给 id、物种、性别、出生地与年龄，寿命、成年体重、属性按物种分布从种子键各采一次（卷二 §1.10），此处不写任何取值。
// 年龄 → birthMinute 用 person.mjs 的 birthMinuteOfAge（现刻 − 年龄 × 年长，与 instantiatePerson 的 ageYears 路径同一处）；不直接给 ageYears：该路径要成年阶段表，
// 阶段表未建（问题.md 阶段表与生长曲线），未成年人会整笔拒收。
// 户主 = 本户成员按 R18-2.9 通用全序取第一位：权重大者在前（开局没有权重，视为相等）、亲等小者在前（亲属记录没有载入，kinDegree 无从算，同样视为相等，登问题.md）、
// birthMinute 早者在前、最后比实体 id 的字典序；不依赖名册次序（A18-2.2 末句）。户主边与成员边互斥自动让出（种类行 incompatible），所以户主只写户主边、其余写成员边，每人至多一条。
// 家户边的种类取规则表 rules.gen.householdMemberKind、householdHeadKind，原因取 rules.polity.genHoldCause（开局的动词，同开局持有），不写代号字面量；
// 标的家户须是表里的组织行且组织种类 orgTraits.domestic 为真，否则整笔拒收，不静默跳过。写在调用方已开的世界创建事务上（同 gen/holdcalls.mjs）。

import { openHolding } from './kernel/holdings.mjs';
import { KernelError } from './kernel/errors.mjs';
import { kindOf } from './kernel/vocab.mjs';
import { instantiatePerson, birthMinuteOfAge } from './person.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ROW_KEYS = Object.freeze(['id', 'species', 'sex', 'ageYears', 'birthplace', 'household']);

function bad(why) {
  throw new KernelError('E-DIM-REF-MISSING', {}, `opening people: ${why}`);
}

// id 在表里的行：表取 id 的登记 kind，认不出（空串、不是字串、不在 idIndex）或表里没有这行都是 undefined。
function tableRow(engine, id) {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  let kind;
  try { kind = kindOf(id); } catch { return undefined; }
  const table = engine.tables.get(kind);
  return table === undefined ? undefined : table.flat.rows.get(id);
}

function ruleKey(engine, table, key) {
  const t = engine.rules[table];
  if (!isObj(t) || typeof t[key] !== 'string') throw new KernelError('E-RULES-UNREGISTERED', {}, `opening people: rules.${table}.${key} is needed`);
  return t[key];
}

/**
 * R18-2.9 通用全序取第一位（户主候补）：先权重、再亲等、再 birthMinute 早者、再实体 id 字典序。开局名册没有权重、没有亲属记录，前两项对所有候选相等，所以只剩后两项。
 * 纯函数：与输入次序无关。
 * @param {Array<{id: string, birthMinute: number}>} candidates 非空
 * @returns {string} 第一位的 id
 */
export function firstInFullOrder(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) bad('a household head is picked from a non-empty member list');
  return [...candidates].sort((a, b) => a.birthMinute - b.birthMinute || cmp(a.id, b.id))[0].id;
}

/**
 * @param {object} engine @param {object} state
 * @param {{persons: Array<{id: string, species: string, sex: string, ageYears: number, birthplace: string, household: string | null}>}} roster
 * @returns {{people: string[], households: Array<{household: string, head: string, members: string[]}>}}
 *   people：建了行的人物 id（升序）；households：每户的户主与其余成员（户 id 升序，成员 id 升序）
 */
export function applyOpeningPeople(engine, state, roster) {
  if (!isObj(roster) || !Array.isArray(roster.persons)) bad('roster is {persons: [...]}');
  const memberKind = ruleKey(engine, 'gen', 'householdMemberKind');
  const headKind = ruleKey(engine, 'gen', 'householdHeadKind');
  const cause = ruleKey(engine, 'polity', 'genHoldCause');
  const traits = isObj(engine.rules.social) && isObj(engine.rules.social.orgTraits) ? engine.rules.social.orgTraits : {};
  const rows = [...roster.persons].sort((a, b) => cmp(a && a.id, b && b.id));
  const byHousehold = new Map();
  for (const r of rows) {
    if (!isObj(r) || Object.keys(r).length !== ROW_KEYS.length || ROW_KEYS.some((k) => !Object.hasOwn(r, k))) bad(`a roster row has exactly ${ROW_KEYS.join(', ')}`);
    if (r.household !== null) {
      // 户所在的表取它 id 的登记 kind（不写表名字面量）；表里没有这行、或行的组织种类不是家户，都整笔拒收。
      const org = tableRow(engine, r.household);
      if (org === undefined) bad(`${r.id}: household ${JSON.stringify(r.household)} is not a table row`);
      const t = traits[org.orgKind];
      if (!isObj(t) || t.domestic !== true) bad(`${r.id}: ${r.household} is not a household org (orgTraits.domestic)`);
    }
    const birthMinute = birthMinuteOfAge(engine, state, r.ageYears);
    const made = instantiatePerson(engine, state, { instanceId: r.id, species: r.species, sex: r.sex, birthplace: r.birthplace, birthMinute });
    if (r.household !== null) {
      if (!byHousehold.has(r.household)) byHousehold.set(r.household, []);
      byHousehold.get(r.household).push({ id: made.id, birthMinute });
    }
  }
  const households = [];
  for (const household of [...byHousehold.keys()].sort(cmp)) {
    const list = byHousehold.get(household);
    const head = firstInFullOrder(list);
    const members = list.map((m) => m.id).filter((id) => id !== head).sort(cmp);
    openHolding(engine, state, { holdingKind: headKind, holder: head, subject: household, cause });
    for (const m of members) openHolding(engine, state, { holdingKind: memberKind, holder: m, subject: household, cause });
    households.push({ household, head, members });
  }
  return { people: rows.map((r) => r.id), households };
}
