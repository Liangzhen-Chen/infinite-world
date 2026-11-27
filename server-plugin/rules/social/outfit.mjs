// 来历起始物经账本与持有写者真实给出（卷四 G-5 出身给予；卷三乙 I-2 :917 逐件物与散货分界；卷六 :104 实例批次键；S2-H 草案 §4）。
// create 原语建 person 行后，在同一事务里经 engine.lifecycle.instantiate 按 state-owners systems.outfit.instantiate 路由到这里（sortKey 排在开局随身钱之后）：
// 读新个体出身维度所指出身条目的起始物，逐件物（物品行组件类与 rules.items.instancedComponents 有交）逐件建实例、按实例批次入账 1 件、按放置规则开持有边；
// 散货按新批次入账 n 件。被拒即整笔回滚，选来历如实被拒。参数全在 rules.social.outfit；不认任何物品、组件类、持有种类或来历代号。
import { KernelError } from '../../kernel/errors.mjs';
import { kindOfEntity, createEntity } from '../../kernel/storage.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { headerOf } from '../body/body-plan.mjs';
import { registerInstantiator, idStem } from '../lifecycle/terminate.mjs';
import { LEDGER, openAccount, post } from '../economy/ledger.mjs';
import { SOCIAL, openHolding } from './holdings.mjs';

// rules.social 的起始物键、rules.items 的逐件组件类键、rules.economyLedger 的账户键（registry.json 登记）。
export const OUTFIT = 'outfit';
const ITEMS = 'items';
const INSTANCED = 'instancedComponents';
const ACCOUNT = 'account';
const INSTANCE_LOT = 'instanceLotPrefix';
// 物品行的组件类字段（卷二 §5.0 行字段 classes）与资源种类所在词表族（卷六 §2.1）。
const CLASSES = 'classes';
const RESOURCE_FAMILY = 'resource';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';

/** 一件要建实例的起始物（seq 为本人起始物实例序号，从 0 起）。 @typedef {{seq: number, item: string, classes: readonly string[]}} Instance */
/** 一条放置：实例 seq 放到 holder 上（self 即本人，否则是容器实例的 seq），开 holdingKind 种类的边。 @typedef {{seq: number, holdingKind: string, holder: 'self' | number}} Placement */

const SELF = 'self';

/** rules.social.outfit。 @param {import('./holdings.mjs').SocialEngine} engine @returns {Record<string, unknown>} */
export function outfitRule(engine) {
  return Object(ruleValue(engine.docData, SOCIAL, OUTFIT));
}

/** 物品行的组件类（行字段，不继承）；行不在即 E-DIM-REF-MISSING。 @param {import('./holdings.mjs').SocialEngine} engine @param {string} item @returns {readonly string[]} */
function classesOf(engine, item) {
  const kind = engine.registry.kindOfLoaded(item);
  const doc = kind === undefined ? undefined : engine.registry.tables.get(kind);
  const row = doc ? Object(Object(doc).rows)[item] : undefined;
  if (row === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `${item}: not a loaded data row`);
  return Array.isArray(row[CLASSES]) ? row[CLASSES] : [];
}

/**
 * 物品行所对应的资源种类（resource 族里 outfit.resourceItemField 指向该物品的那一条，须恰一条），否则 E-DIM-REF-MISSING。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {string} item @returns {string}
 */
export function resourceOfItem(engine, item) {
  const field = String(outfitRule(engine).resourceItemField);
  const entries = Object(Object(Object(Object(engine.vocab).families)[RESOURCE_FAMILY]).entries);
  const hits = Object.keys(entries).filter((k) => Object(entries[k])[field] === item);
  if (hits.length !== 1) throw new KernelError('E-DIM-REF-MISSING', {}, `${item}: want exactly one ${RESOURCE_FAMILY} entry with ${field} = it, found ${hits.length}`);
  return hits[0];
}

// 放置规则 holder 取值（rules.social.outfit.placement[].holder）：self 即本人；worn_container 即已放在本人身上（holder self 的放置）、物品行挂 containerClass 的第一件实例（按序号）。
/** @type {Record<string, (placed: ReadonlyArray<Placement>, byseq: ReadonlyMap<number, Instance>, containerClass: string) => 'self' | number | undefined>} */
const HOLDER_MODES = {
  self: () => SELF,
  worn_container: (placed, byseq, containerClass) => {
    const hit = placed.filter((p) => p.holder === SELF && Object(byseq.get(p.seq)).classes.includes(containerClass)).map((p) => p.seq).sort((a, b) => a - b);
    return hit.length > 0 ? hit[0] : undefined;
  },
};

/**
 * 起始物清单的分界与放置（纯函数；运行期与加载期核对同用）：逐件物与散货按 rules.items.instancedComponents 分界（卷三乙 I-2）；
 * 逐件物按 outfit.placement 有序表依次匹配（whenClass 为空即匹配任何还没放下的），找不到放处即 E-DIM-REF-MISSING（坏数据开局即拒）；holder 取值不在表内即 E-DIM-STRUCT-FIELD。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {ReadonlyArray<unknown>} list 出身条目的起始物 [{item, n}]
 * @returns {{instances: Instance[], bulk: Array<{item: string, n: number}>, placements: Placement[]}}
 */
export function outfitPlan(engine, list) {
  const o = outfitRule(engine);
  /** @type {unknown[]} */
  const instanced = Object(ruleValue(engine.docData, ITEMS, INSTANCED));
  /** @type {Instance[]} */
  const instances = [];
  /** @type {Array<{item: string, n: number}>} */
  const bulk = [];
  for (const raw of list) {
    const { item, n } = Object(raw);
    const classes = classesOf(engine, String(item));
    if (!classes.some((c) => instanced.includes(c))) { bulk.push({ item: String(item), n: Number(n) }); continue; }
    for (let i = 0; i < Number(n); i++) instances.push({ seq: instances.length, item: String(item), classes });
  }
  const byseq = new Map(instances.map((x) => [x.seq, x]));
  /** @type {Placement[]} */
  const placements = [];
  /** @type {unknown[]} */
  const rules = Array.isArray(o.placement) ? o.placement : [];
  for (const raw of rules) {
    const r = Object(raw);
    const mode = Object.hasOwn(HOLDER_MODES, r.holder) ? HOLDER_MODES[r.holder] : undefined;
    if (mode === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SOCIAL}.${OUTFIT}.placement holder ${JSON.stringify(r.holder)} has no rule`);
    for (const x of instances) {
      if (placements.some((p) => p.seq === x.seq) || (r.whenClass !== null && !x.classes.includes(r.whenClass))) continue;
      const holder = mode(placements, byseq, String(o.containerClass));
      if (holder !== undefined && holder !== x.seq) placements.push({ seq: x.seq, holdingKind: String(r.holdingKind), holder });
    }
  }
  const lost = instances.filter((x) => !placements.some((p) => p.seq === x.seq));
  if (lost.length > 0) throw new KernelError('E-DIM-REF-MISSING', {}, `starting items ${lost.map((x) => x.item).join(', ')}: no placement in rules.${SOCIAL}.${OUTFIT}.placement`);
  return { instances, bulk, placements };
}

/**
 * 个体的出身条目（出身维度读不到或显式为空即 null，同开局随身钱 endowFromOrigin 的口径）。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {object} state @param {string} personId @returns {{origin: string, entry: Record<string, unknown>} | null}
 */
function originEntry(engine, state, personId) {
  const dimension = String(outfitRule(engine).originDimension);
  const kind = kindOfEntity(engine, state, personId);
  const family = headerOf(engine, kind, dimension).vocab;
  if (typeof family !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${kind}.${dimension}: header must declare a ref vocab family`);
  let origin;
  try {
    origin = dim(engine, state, kind, personId, dimension).value;
  } catch (err) {
    if (err instanceof KernelError && err.code === UNKNOWN_READ) return null;
    throw err;
  }
  if (origin === null) return null;
  const entries = Object(Object(Object(Object(engine.vocab).families)[family]).entries);
  return { origin: String(origin), entry: Object(Object.hasOwn(entries, origin) ? entries[origin] : undefined) };
}

/**
 * 出身起始物（systems.outfit.instantiate 的处理函数；签名同建档实例化 handler(engine, state, entityId, tx)）：
 * 逐件物：建实例（id = 物品表首前缀 + outfit.idInfix + 个体 id 去前缀 + _ + 序号，模板取物品行）→ 开 (个体, purpose, 资源, instanceLotPrefix + 实例 id) 账户 → post 1 件；
 * 全部建完后按放置开持有边（holder self 即个体、否则容器实例）；散货：开新批次账户 → post n 件。post 的 refs 带出身条目、个体与实例。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {object} state @param {string} personId @param {unknown} tx
 */
export function outfitFromOrigin(engine, state, personId, tx) {
  const found = originEntry(engine, state, personId);
  if (found === null) return;
  const o = outfitRule(engine);
  const list = found.entry[String(o.itemsField)];
  if (!Array.isArray(list) || list.length === 0) return;
  const plan = outfitPlan(engine, list);
  const lotPrefix = String(Object(ruleValue(engine.docData, LEDGER, ACCOUNT))[INSTANCE_LOT]);
  const stem = idStem(engine, kindOfEntity(engine, state, personId), personId);
  const refs = { origin: found.origin, holder: personId };
  const give = (/** @type {string} */ resource, /** @type {string | undefined} */ key, /** @type {number} */ n, /** @type {Record<string, string>} */ more) => {
    const account = openAccount(engine, state, personId, key === undefined ? { kind: resource } : { kind: resource, key }, String(o.purpose), tx);
    post(engine, state, { legs: [{ source: o.source, resource, qty: n }, { account, delta: n }], reason: String(o.reason), refs: { ...refs, ...more } }, tx);
  };
  /** @type {Map<number, string>} */
  const ids = new Map();
  for (const x of plan.instances) {
    const kind = String(engine.registry.kindOfLoaded(x.item));
    const rec = engine.registry.kindIds.get(kind);
    const prefix = rec && Array.isArray(rec.idPrefix) ? rec.idPrefix[0] : undefined;
    if (typeof prefix !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, `kind ${kind}: no id prefix to derive an instance id`);
    const id = `${prefix}${String(o.idInfix)}${stem}_${x.seq}`;
    createEntity(state, id, kind, {}, tx, x.item);
    ids.set(x.seq, id);
    give(resourceOfItem(engine, x.item), `${lotPrefix}${id}`, 1, { instance: id });
  }
  for (const p of plan.placements) {
    const holder = p.holder === SELF ? personId : String(ids.get(p.holder));
    openHolding(engine, state, { kind: p.holdingKind, holder, subject: String(ids.get(p.seq)), terms: {} }, tx);
  }
  for (const b of plan.bulk) give(resourceOfItem(engine, b.item), undefined, b.n, {});
}

/** 起始物的登记项（systems.outfit.instantiate；social 域 manifest 收齐）。 */
export const OUTFIT_INSTANTIATOR = registerInstantiator('rules/social/outfit.mjs#outfitFromOrigin', outfitFromOrigin);
