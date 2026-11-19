// 物品实例的创建与偏离行写者（卷三乙《物态类别与物品》§3.3 唯一写者表"`itemInstances.<id>.props.*`（实例偏离行）""`…qualityTier / maker / madeDay / …`""`…ofSpecies / ofPerson / diedMinute`"；
// §4.2.3 I-2 逐件建实例、I-3 偏离；§2.3 实例维度；卷九 R9-2.7 `create` 涉及实物时同事务经账本 post 一笔带登记来源的腿；块 6 第 6-3 张）。
// 写直接落在调用方已开的内核事务上，不自开事务；任一步失败抛带登记码的错误，由事务整笔回滚（与 ledger.mjs、terminate.mjs 同法）。
// 本文件写：itemInstances.<id>.{template, qualityTier, maker, madeDay, ofSpecies, ofPerson, diedMinute}（建实例时一次写入，此后不改）、
// created.<id>.props.*（偏离行）；不写 taint（账本写，recordTaint）、不写耐久与腐坏字段的锚点重设（item-condition.mjs、item-lots.mjs）——
// 建实例时这四个字段的初值与 taint 的初值是同一笔建实例的一部分：耐久、腐坏、锚点日由本文件随建实例落下，此后只有各自声明写者改（初值写入归建行写者，
// 与 §3.3"制成时一次写入"同口径），taint 由账本 recordTaint 写。
// 不认任何物品、类别、材料代号：必填与取值域读表头 instanceDimensions，是否逐件建实例读 rules.items.instancedComponents。

import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';
import { invalidateMemo } from './memo.mjs';
import { kindOf, registry } from './vocab.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { entityId } from './handles/entity-id.mjs';
import { checkValue } from './validate/types.mjs';
import { clockView } from './scheduler.mjs';
import { post, recordTaint, resourceAllows } from './ledger.mjs';
import { itemView } from './item.mjs';
import { instanceRow, resourceKindsOf } from './item-state.mjs';
import { ruleTable } from './load/rules.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 维度表 kind、状态键、规则表与词表族名、表头 required 策略前缀（卷二 §1.2：always / never / byClass:<类> / ifPresent:<维度>）：固定记号，单一定义。
const KIND = Object.freeze({ item: 'item' });
const ST = Object.freeze({ instances: 'itemInstances', created: 'created', props: 'props' });
const RULE = Object.freeze({ items: 'items', instanced: 'instancedComponents' });
const REQ = Object.freeze({ always: 'always', never: 'never', byClass: 'byClass:' });
// 实例行上本文件落笔的字段：模板；taint 归账本（recordTaint）。耐久、腐坏及其锚点日四个维度归声明写者 item-condition.mjs、item-lots.mjs（§3.3 :443–:446），
// 建实例时不写：它们的初值由那两个文件的初值函数在同一事务之外按各自节点落下，读数在没有初值时按未知带缺口（M5）。
const FIELD = Object.freeze({ template: 'template', taint: 'taint' });
const OTHER_WRITERS = Object.freeze(['durability', 'wearAnchorDay', 'spoilage', 'rotAnchorDay']);
const SPEC_FIELDS = Object.freeze(['id', 'template', 'holder', 'purpose', 'flow', 'reason', 'taint', 'fields']);

const fail = (code, why, entity = null) => new KernelError(code, { entity }, why);

// 事务内写（记撤销项，格式同 ledger.mjs 的 setInTx）。
function setInTx(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!Object.hasOwn(cur, s) || !isObj(cur[s])) {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs: [...segs], existed: Object.hasOwn(cur, last), prev: cur[last] });
  cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state);
}

function denied(e) {
  const tx = currentTransaction();
  if (tx && codeOf(e) !== null && tx.denied === undefined) tx.denied = e;
  return e;
}

const tableOf = (engine) => {
  const t = engine.tables instanceof Map ? engine.tables.get(KIND.item) : undefined;
  if (!t) throw fail('E-DIM-REF-MISSING', 'no item dimension table');
  return t;
};

// 用表头维度定义核一个值；第一条错即抛（码取校验器给的）。
function checkField(engine, def, value, key, entity) {
  const reg = registry();
  const env = { vocab: engine.vocab, idIndex: reg.idIndex, units: engine.units, tableDims: reg.tableDims };
  let first = null;
  checkValue(def, value, env, { table: KIND.item, row: entity || '', dim: key, path: key }, (e) => { if (first === null) first = e; });
  if (first !== null) throw fail(first.code, `${key}: got ${JSON.stringify(first.got)}, want ${first.want}`, entity);
}

// 一条表头 required 对该模板是否成立：always 成立；never 不成立；byClass:X 在模板手写组件类（含上位类）含 X 时成立。
function requiredFor(templateView, def) {
  const req = typeof def.required === 'string' ? def.required : REQ.never;
  if (req === REQ.always) return true;
  return req.startsWith(REQ.byClass) && templateView.classes.includes(req.slice(REQ.byClass.length));
}

/**
 * kernelApi `createItemInstance(engine, state, spec)`（卷三乙 I-2；卷九 R9-2.7）：为挂了 rules.items.instancedComponents 所列组件类的物品模板逐件建实例，
 * 同一事务内经账本 post 一笔带登记来源代号 spec.flow 的腿（一件、自己那一批，批次键 lot_i_<实例id>，永不与别的批次合并，卷三乙 K-3），taint 由账本 recordTaint 写初值。
 * spec：{id, template, holder, purpose, flow, reason, fields}；fields 是实例维度（表头 instanceDimensions）：必填的缺一即拒（E-DIM-REQUIRED-MISSING），
 * 不适用的（该模板不要求、也不是 byClass 条件成立）写了即拒（E-DIM-STRUCT-FIELD），值不合取值域拒（校验器给的码）。taint 必给（实例必填，账本写）。
 * 模板没挂逐件建实例的组件类拒（E-DIM-STRUCT-FIELD，I-2：不挂的模板无实例，只以存量存在）；id 已存在拒（E-DIM-ID-DUPLICATE）。
 * 没有登记来源代号（flow 不在该资源种类行 sources 里、或模板没有资源种类）整笔拒 E-ACT-PRIMITIVE（R9-2.7）。
 * 耐久与腐坏：durability、spoilage 的初值与锚点日由本次一并写入（锚点日不给取当日；耐久与腐坏进度的此后改写归各自声明写者）。
 * @param {any} engine @param {any} state
 * @param {{id: string, template: string, holder: string, purpose: string, flow: string, reason: string, taint: number, fields: Record<string, any>}} spec
 * @returns {Readonly<{id: string}>}
 */
export function createItemInstance(engine, state, spec) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw fail('E-VIEW-UNDECLARED-WRITE', 'createItemInstance outside the transaction of this state');
    if (!isObj(spec) || Object.keys(spec).some((k) => !SPEC_FIELDS.includes(k)) || SPEC_FIELDS.some((k) => !Object.hasOwn(spec, k))) throw fail('E-DIM-STRUCT-FIELD', `createItemInstance spec is {${SPEC_FIELDS.join(', ')}}`);
    if (typeof spec.id !== 'string' || !CODE_RE.test(spec.id)) throw fail('E-DIM-ID-FORMAT', 'instance id is not a code');
    entityId(KIND.item, spec.id);
    if (registry().idIndex.has(spec.id) || instanceRow(state, spec.id)) throw fail('E-DIM-ID-DUPLICATE', `${spec.id} already exists`, spec.id);
    if (typeof spec.template !== 'string' || !CODE_RE.test(spec.template) || kindOf(spec.template) !== KIND.item) throw fail('E-DIM-REF-MISSING', `${JSON.stringify(spec.template)} is not an item template`);
    const view = itemView(engine, state, spec.template);
    const instanced = ruleTable(engine.rules, RULE.items)[RULE.instanced];
    if (!Array.isArray(instanced)) throw fail('E-RULES-UNREGISTERED', 'rules.items.instancedComponents is not set (I-2 cannot decide which items are instances)');
    if (!view.classes.some((c) => instanced.includes(c))) throw fail('E-DIM-STRUCT-FIELD', `${spec.template} carries no component of rules.items.instancedComponents: it exists as stock only (I-2)`, spec.template);

    if (typeof spec.taint !== 'number') throw fail('E-DIM-REQUIRED-MISSING', 'instance dimension taint is required (always)', spec.id);
    const defs = isObj(tableOf(engine).doc.instanceDimensions) ? tableOf(engine).doc.instanceDimensions : {};
    const fields = isObj(spec.fields) ? spec.fields : {};
    for (const k of Object.keys(fields)) if (!Object.hasOwn(defs, k) || k === FIELD.taint || OTHER_WRITERS.includes(k)) throw fail('E-DIM-STRUCT-FIELD', `${k} is not written by the creating writer (taint: ledger; durability, spoilage and anchors: item-condition.mjs, item-lots.mjs)`, spec.id);
    const today = clockView(engine, state).day;
    const out = {};
    for (const key of Object.keys(defs).sort(cmp)) {
      if (key === FIELD.taint || OTHER_WRITERS.includes(key)) continue;
      const need = requiredFor(view, defs[key]);
      const given = Object.hasOwn(fields, key);
      if (need && !given) throw fail('E-DIM-REQUIRED-MISSING', `instance dimension ${key} is required for ${spec.template}`, spec.id);
      if (!need && given) throw fail('E-DIM-STRUCT-FIELD', `instance dimension ${key} does not apply to ${spec.template}`, spec.id);
      if (!given) continue;
      checkField(engine, defs[key], fields[key], key, spec.id);
      if (fields[key] !== null) out[key] = fields[key];
    }

    // R9-2.7：实物只经账本 post；找不到登记来源代号拒 E-ACT-PRIMITIVE。
    const kinds = resourceKindsOf(engine, spec.template);
    const kind = kinds.find((k) => resourceAllows(engine, k, spec.flow));
    if (kind === undefined) throw fail('E-ACT-PRIMITIVE', `create of ${spec.template}: no resource kind of the item lists ${JSON.stringify(spec.flow)} as a registered source (vol9 R9-2.7)`, spec.id);
    // 写：实例行（模板与各实例维度初值），再经账本记一件新批次与来源腿，最后由账本写 taint 初值。
    setInTx(tx, [ST.instances, spec.id, FIELD.template], spec.template);
    for (const key of Object.keys(out).sort(cmp)) setInTx(tx, [ST.instances, spec.id, key], out[key]);
    post(engine, state, {
      legs: [
        { account: { holder: spec.holder, purpose: spec.purpose, resource: { kind } }, delta: 1, lot: { attrs: { enteredDay: today, taint: spec.taint }, instance: spec.id } },
        { flow: spec.flow, kind, qty: 1 },
      ],
      reason: spec.reason,
    });
    recordTaint(engine, state, { target: { instance: spec.id }, taint: spec.taint, cause: null });
    return Object.freeze({ id: spec.id });
  } catch (e) {
    throw denied(e);
  }
}

/**
 * kernelApi `writeItemDeviation(engine, state, id, dimension, value)`（卷三乙 §3.3 `itemInstances.<id>.props.*`；I-3）：写实例相对模板的偏离值。
 * 键只能是物品表 §2.2 的维度（§2.3 实例维度出现在 props 下即拒，它们只有各自的声明写者）；派生维度（不许显式写）拒 E-DIM-DERIVED-WRITTEN；值按表头定义核。
 * 偏离行落在 created.<id>.props.<维度>（卷二 §1.3 覆盖顺序）。
 * @param {any} engine @param {any} state @param {string} id @param {string} dimension @param {any} value
 */
export function writeItemDeviation(engine, state, id, dimension, value) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw fail('E-VIEW-UNDECLARED-WRITE', 'writeItemDeviation outside the transaction of this state');
    if (!instanceRow(state, id)) throw fail('E-DIM-REF-MISSING', `${JSON.stringify(id)} is not an item instance`, id);
    const doc = tableOf(engine).doc;
    if (isObj(doc.instanceDimensions) && Object.hasOwn(doc.instanceDimensions, dimension)) throw fail('E-DIM-STRUCT-FIELD', `${dimension} is an instance dimension: it has its own declared writer, not a props row`, id);
    const def = isObj(doc.dimensions) ? doc.dimensions[dimension] : undefined;
    if (!isObj(def)) throw fail('E-DIM-REF-MISSING', `${dimension} is not a dimension of the item table`, id);
    if (def.derived !== undefined && def.allowExplicit !== true) throw fail('E-DIM-DERIVED-WRITTEN', `${dimension} is derived and has no deviation channel`, id);
    checkField(engine, def, value, dimension, id);
    setInTx(tx, [ST.created, id, ST.props, dimension], value);
  } catch (e) {
    throw denied(e);
  }
}
