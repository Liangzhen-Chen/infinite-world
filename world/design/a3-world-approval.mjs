// A3 收口修复（fix3-world）：基层司法/治安/建房职位、猎户会，以及此前手加未审的目录条目的 L1/L2/L4 审批。
// 数据见 a3-world-governance.mjs（待发布候选）与 a3-world-catalog.mjs（已在正式文件里、补回执的条目）。
// 流程：prepare → L1 → review(L2，真实模型) → L4 人工记录 → publish（只写已审批的候选）→ verify（闸门测试用）。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from '../../tools/load-world.mjs';
import {validateWorld} from '../../tools/validate-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, defaultReviewRequest, readApprovedContent, hashContent} from '../../tools/content-pipeline.mjs';
import * as G from './a3-world-governance.mjs';
import * as C from './a3-world-catalog.mjs';
import {previousOfficeEdition} from './s4-offices-approval.mjs';
import {previousResourceEdition} from './s505-resources-approval.mjs';

export const revision = G.revision, draftRoot = G.draftRoot;
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const FILES = {baseline: 'world/people/baseline.json', locations: 'world/geo/locations.json', factions: 'world/lore/factions.json',
  settlements: 'world/geo/settlements.json', items: 'world/meta/items.json', recipes: 'world/meta/recipes.json', rules: 'world/meta/rules.json'};
export const readFiles = async () => Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, await read(f)])));
const same = (a, b) => hashContent(a) === hashContent(b);

// ---- 条目 ----------------------------------------------------------------------------------------
const personSource = row => ({path: 'world/geo/regions.json、world/meta/rules.json#governance.promotion', detail: row.notes});
export function contentEntries(files) {
  const entries = [];
  for (const row of G.newPeople) entries.push({id: row.id, kind: 'person', row, source: personSource(row), boundary: G.boundary.person});
  for (const p of G.personFields) entries.push({id: p.id, kind: 'person-field', subject: p.subject, field: p.field, row: {[p.field]: p.value}, source: p.source, boundary: G.boundary.personField});
  for (const row of G.newFactions) entries.push({id: row.id, kind: 'faction', row, source: G.sourceOfFaction(row), boundary: G.boundary.faction});
  for (const {faction, row} of G.newOffices) entries.push({id: row.id, kind: 'office', faction, row,
    source: {path: `world/lore/factions.json#${faction}.offices`, detail: row.source}, boundary: G.boundary.office});
  const watch = files.locations.find(l => l.id === G.roomPatch.subject), before = watch.rooms.filter(r => r.id !== G.roomPatch.addRoom.id);
  entries.push({id: G.roomPatch.id, kind: 'room-patch', subject: G.roomPatch.subject, field: 'rooms', before, row: {rooms: [...before, G.roomPatch.addRoom]},
    source: G.roomPatch.source, boundary: G.boundary.patch});
  entries.push({id: G.settlementHead.id, kind: 'head-patch', subject: G.settlementHead.subject, field: 'details.governance',
    before: G.settlementHead.before,
    row: {head: G.settlementHead.head, enforcers: G.settlementHead.enforcers, authority: G.settlementHead.authority},
    source: G.settlementHead.source, boundary: G.boundary.patch});
  // 目录条目：行取自正式文件当前值。
  for (const id of Object.keys(C.sources.items)) {
    const row = files.items.find(x => x.id === id); assert.ok(row, `${id} 不在 items.json`);
    entries.push({id, kind: 'item', row, source: {path: C.sources.items[id].path, detail: C.sources.items[id].detail}, boundary: C.sources.items[id].boundary});
  }
  for (const id of Object.keys(C.sources.recipes)) {
    const row = files.recipes.find(x => x.id === id); assert.ok(row, `${id} 不在 recipes.json`);
    entries.push({id, kind: 'recipe', row, source: {path: C.sources.recipes[id].path, detail: C.sources.recipes[id].detail}, boundary: C.sources.recipes[id].boundary});
  }
  for (const id of C.NUTRITION_IDS) {
    const item = files.items.find(x => x.id === id); assert.ok(item?.nutrition, `${id} 没有 nutrition`);
    entries.push({id: `nutrition_${id}`, kind: 'item-field', subject: id, field: 'nutrition', row: {nutrition: item.nutrition}, source: C.nutritionSource, boundary: C.nutritionBoundary});
  }
  const rules = files.rules;
  const ruleEntry = (id, kind, row) => entries.push({id, kind, row, source: {path: C.sources.rules[id].path, detail: C.sources.rules[id].detail}, boundary: C.sources.rules[id].boundary});
  for (const id of ['repair_clothes_seam', 'repair_sword_service']) ruleEntry(id, 'rule-repair', rules.repairs.find(r => r.id === id));
  ruleEntry('shop_hw_forge_mining_pick', 'rule-restock', {shop: 'shop_hw_forge', ...rules.economy.shops.stores.find(s => s.id === 'shop_hw_forge').restock.find(r => r.item === 'item_mining_pick')});
  ruleEntry('fishing_bait', 'rule-bait', {bait: rules.extraction.fishing.bait});
  ruleEntry('medicine_takeHome', 'rule-takehome', {takeHome: rules.medicine.takeHome});
  return entries;
}
export const draftFor = entry => ({id: entry.id, row: structuredClone(entry.row)});

// ---- 候选世界：把候选行叠到已加载世界上（正式文件已含的行必须逐字相同）----------------------------------
function put(list, row) {
  const at = list.findIndex(x => x.id === row.id);
  if (at < 0) list.push(structuredClone(row)); else assert.ok(same(list[at], row), `${row.id} 已存在且不同`);
}
export function previewWorld(world) {
  const w = structuredClone(world);
  for (const p of G.newPeople) put(w.npcs, p);
  for (const p of G.personFields) {
    const n = w.npcs.find(x => x.id === p.subject); assert.ok(n, p.subject);
    assert.ok(n[p.field] === undefined || n[p.field] === p.value, `${p.subject} 已有不同的 ${p.field}`);
    n[p.field] = p.value;
  }
  for (const f of G.newFactions) {
    const offices = G.newOffices.filter(o => o.faction === f.id).map(o => structuredClone(o.row));
    put(w.factions, {...f, offices});
  }
  for (const {faction, row} of G.newOffices.filter(o => !G.newFactions.some(f => f.id === o.faction))) {
    const f = w.factions.find(x => x.id === faction); assert.ok(f, faction);
    f.offices ??= []; put(f.offices, row);
  }
  const watch = w.locations.find(l => l.id === G.roomPatch.subject);
  if (!watch.rooms.some(r => r.id === G.roomPatch.addRoom.id)) watch.rooms.push(structuredClone(G.roomPatch.addRoom));
  const gov = w.settlementProfiles.find(s => s.id === G.settlementHead.subject).details.governance;
  gov.head = G.settlementHead.head; gov.enforcers = [...G.settlementHead.enforcers]; gov.authority = G.settlementHead.authority;
  return w;
}

// ---- L1 ---------------------------------------------------------------------------------------------
const rootOf = (locs, id) => { for (let g = 0; g < 12; g++) { const l = locs.get(id); if (!l) return null; if (!l.parent) return l.id; id = l.parent; } return null; };
function ctx(world) {
  return {world, locs: new Map(world.locations.map(l => [l.id, l])), npcs: new Map(world.npcs.map(n => [n.id, n])), items: new Map(world.items.map(i => [i.id, i])),
    factions: new Map(world.factions.map(f => [f.id, f])), skills: new Map(world.skills.map(s => [s.id, s])), root(id) { return rootOf(this.locs, id); }};
}
function scheduleErrors(c, n) {
  const errors = []; let cursor = 0;
  for (const s of n.schedule?.default ?? []) {
    if (s.start !== cursor || s.end <= s.start) errors.push(`${n.id} 作息不连续`);
    cursor = s.end; if (!c.locs.has(s.location)) errors.push(`${n.id} 作息地点不存在 ${s.location}`);
  }
  if (cursor !== 1440) errors.push(`${n.id} 作息未覆盖全天`);
  return errors;
}
const present = (n, seat, from, to) => { // 作息在 [from,to) 内全部处于 seat
  const slots = (n.schedule?.default ?? []).filter(s => s.start < to && s.end > from);
  return slots.length > 0 && slots.every(s => s.location === seat);
};
function checkPerson(c, entry) {
  const n = entry.row, errors = scheduleErrors(c, n), f = c.factions.get(n.faction);
  if (!Number.isInteger(n.age) || n.age < 18) errors.push('任职人物须成年');
  if (!c.locs.has(n.location)) errors.push('人物所在地点不存在');
  if (n.services?.length || Object.keys(n.inventory ?? {}).length || n.coins !== 0) errors.push('新增任职人物不预置服务、库存或现金');
  if (!f) errors.push('所属组织不存在'); else if (f.leader !== n.id && !(f.coreMembers ?? []).includes(n.id)) errors.push('新增人物不是所属组织的首领或核心成员');
  return errors;
}
function checkOffice(c, entry) {
  const o = entry.row, errors = [], holder = c.npcs.get(o.holder), f = c.factions.get(entry.faction);
  if (!f) errors.push('组织不存在');
  if (!holder) { errors.push(`持有人不存在 ${o.holder}`); return errors; }
  if (!(holder.age >= 18)) errors.push('持有人须成年');
  if (!c.locs.has(o.seat)) errors.push(`席位不存在 ${o.seat}`);
  if (c.root(o.seat) !== c.root(holder.location) && c.root(o.seat) !== holder.scope) errors.push(`席位 ${o.seat} 与持有人 ${holder.id} 不在同一聚落`);
  if (!/^office_[a-zA-Z0-9_-]+$/.test(o.id)) errors.push('职位编号格式');
  if (!Array.isArray(o.authority?.operations) || !o.authority.operations.length || o.authority.operations.some(p => typeof p !== 'string' || !p.trim())) errors.push('职权操作无效');
  const open = c.locs.get(o.seat)?.openHours;
  for (const [from, to] of o.receptionHours ?? []) {
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= 1440 && from < to)) errors.push('接待时段无效');
    else {
      if (open && (from < open[0] || to > open[1])) errors.push(`接待时段 ${from}-${to} 超出席位营业时间`);
      if (!present(holder, o.seat, from, to)) errors.push(`持有人 ${holder.id} 的作息在接待时段 ${from}-${to} 不全在席位 ${o.seat}`);
    }
  }
  return errors;
}
function checkFaction(c, entry) {
  const r = entry.row, errors = [];
  for (const id of [r.leader, ...(r.coreMembers ?? [])]) {
    const n = c.npcs.get(id);
    if (!n) errors.push(`组织成员不存在 ${id}`);
    else { if (n.faction !== r.id) errors.push(`${id} 的 faction 不是 ${r.id}`); if (n.scope !== r.contactAnchor) errors.push(`${id} 的 scope 与联络锚点不同`); }
  }
  if (!c.locs.has(r.contactAnchor)) errors.push('联络锚点不存在');
  if (r.resources?.memberCount !== 1 + (r.coreMembers?.length ?? 0)) errors.push('memberCount 与成员数不符');
  for (const o of c.world.factions.find(f => f.id === r.id)?.offices ?? []) if (!c.npcs.has(o.holder)) errors.push(`职位 ${o.id} 的持有人不存在`);
  if (r.charter && (!Number.isInteger(r.charter.fee) || r.charter.fee < 0 || !Number.isInteger(r.charter.dues) || r.charter.dues < 0)) errors.push('章程费用无效');
  return errors;
}
function checkOther(c, entry) {
  const errors = [], r = entry.row;
  if (entry.kind === 'person-field') {
    const n = c.npcs.get(entry.subject), f = c.factions.get(r.faction);
    if (!n) errors.push('人物不存在'); else if (!f) errors.push('组织不存在');
    else if (f.leader !== n.id && !(f.coreMembers ?? []).includes(n.id)) errors.push('该人物不是所列组织的首领或核心成员');
  }
  if (entry.kind === 'room-patch') {
    if (!c.locs.has(entry.subject)) errors.push('地点不存在');
    if (new Set(r.rooms.map(x => x.id)).size !== r.rooms.length) errors.push('房间编号重复');
  }
  if (entry.kind === 'head-patch') {
    if (!c.npcs.has(r.head)) errors.push('镇长不存在');
    for (const id of r.enforcers) if (!c.npcs.has(id)) errors.push(`执行人不存在 ${id}`);
    const f = c.factions.get(c.npcs.get(r.head)?.faction);
    if (!f || f.leader !== r.head) errors.push('镇长不是其所属组织的首领');
  }
  return errors;
}
function checkCatalog(c, entry) {
  const r = entry.row, errors = [], warnings = [];
  const item = id => c.items.get(id);
  if (entry.kind === 'item') {
    if (!Number.isInteger(r.basePrice) || r.basePrice < 1) errors.push('basePrice 无效');
    if (!(r.weight > 0)) errors.push('weight 无效'); if (!c.locs.has(r.origin)) errors.push('origin 不存在');
    if (!r.use || !r.description) errors.push('缺 use/description');
    const recipe = c.world.recipes.find(x => x.output?.item === r.id);
    if (recipe) {
      const cost = recipe.materials.reduce((s, m) => s + (item(m.item)?.basePrice ?? 0) * m.amount, 0) / (recipe.output.quantity ?? 1);
      if (r.basePrice < cost) warnings.push({quote: r.id, field: 'basePrice', severity: 'soft', reason: `目录价 ${r.basePrice} 低于材料成本 ${cost}`});
    } else warnings.push({quote: r.id, field: 'recipe', severity: 'style', reason: '没有配方登记'});
    if (r.id === 'item_external_medicine') {
      const herb = item('item_herb'); if (herb && r.basePrice < herb.basePrice) warnings.push({quote: r.id, field: 'basePrice', severity: 'soft', reason: `目录价 ${r.basePrice} 低于所用药草 ${herb.basePrice}`});
    }
  }
  if (entry.kind === 'recipe') {
    const sk = c.skills.get(r.skill); if (!sk) errors.push('技能不存在');
    for (const m of r.materials) if (!item(m.item)) errors.push(`材料不存在 ${m.item}`);
    for (const t of r.tools ?? []) if (!item(t)) errors.push(`工具不存在 ${t}`);
    if (!item(r.output?.item)) errors.push('产出不存在');
    for (const id of r.teachers ?? []) {
      const t = c.npcs.get(id);
      if (!t) errors.push(`传授人不存在 ${id}`); else if (!((t.proficiencies?.[r.skill] ?? 0) > (r.minimumProficiency ?? 0))) errors.push(`传授人 ${id} 的 ${r.skill} 熟练度不高于配方门槛`);
    }
    if (!(r.minutes > 0)) errors.push('耗时无效');
    if (!(r.teachers?.length)) errors.push('配方无传授人');
  }
  if (entry.kind === 'item-field') {
    const body = c.world.balanceTables?.body ?? null, i = item(entry.subject), n = r.nutrition;
    if (!i) errors.push('物品不存在');
    const meal = n.satiety !== undefined, drink = n.hydration !== undefined;
    if (meal && n.satiety < 15) errors.push('satiety 过小');
    if (meal && !drink && (n.satiety < 30 || n.satiety > 40)) warnings.push({quote: entry.subject, field: 'nutrition.satiety', severity: 'soft', reason: `${n.satiety} 不在 body 表一餐 30–40`});
    if (meal && drink) warnings.push({quote: entry.subject, field: 'nutrition', severity: 'soft', reason: `饮品同时给 satiety ${n.satiety}，body 表只规定一餐 30–40 与一次饮水 25`});
    if (drink && n.hydration !== 25) errors.push(`hydration ${n.hydration} 与 body 表一次饮水 25 不符`);
    void body;
  }
  if (entry.kind === 'rule-repair') {
    if (!item(r.item)) errors.push('修理对象不存在'); if (!c.skills.has(r.skill)) errors.push('技能不存在');
    for (const t of r.tools) if (!item(t)) errors.push(`工具不存在 ${t}`);
    for (const m of r.materials) if (!item(m.item)) errors.push(`材料不存在 ${m.item}`);
    if (!(r.minutes > 0) || !(r.restore > 0)) errors.push('耗时或恢复值无效');
  }
  if (entry.kind === 'rule-restock') {
    const shop = c.world.rules.economy.shops.stores.find(s => s.id === r.shop), i = item(r.item);
    if (!shop || !i) errors.push('铺子或物品不存在');
    else if (c.root(i.origin) !== shop.settlement && i.origin !== c.npcs.get(shop.keeper)?.workplace && !String(i.origin).startsWith('bld_hw_forge')) errors.push('物品产地与铺子不在同处');
    if (r.maximum < r.amount) errors.push('上限小于补货量');
  }
  if (entry.kind === 'rule-bait') { const i = item(r.bait.item); if (!i || r.bait.quantity !== 1 || !/每次抛竿消耗一份/.test(i.use)) errors.push('钓饵条目与目录物用法不符'); }
  if (entry.kind === 'rule-takehome') {
    const i = item(r.takeHome.item); if (!i || r.takeHome.quantity !== r.takeHome.days || !/每份为一天用量/.test(i.use)) errors.push('带回药量与目录物“每份一天”不符');
  }
  return {errors, warnings};
}
export function checkEntry(world, entry) {
  const c = ctx(world);
  switch (entry.kind) {
    case 'person': return {errors: checkPerson(c, entry), warnings: []};
    case 'office': return {errors: checkOffice(c, entry), warnings: []};
    case 'faction': return {errors: checkFaction(c, entry), warnings: []};
    case 'person-field': case 'room-patch': case 'head-patch': return {errors: checkOther(c, entry), warnings: []};
    default: return checkCatalog(c, entry);
  }
}
export async function checkFoundation(world, entries) {
  const candidate = previewWorld(world), before = validateWorld(world), after = validateWorld(candidate);
  assert.deepEqual(after.errors.filter(e => !before.errors.includes(e)), [], '本批不得引入世界校验错误');
  const blocklist = await read('world/i18n/blocklist.zh.json'), errors = [], warnings = [];
  for (const entry of entries) {
    const check = checkEntry(candidate, entry);
    errors.push(...check.errors.map(e => `${entry.id}: ${e}`)); warnings.push(...check.warnings.map(w => ({id: entry.id, ...w})));
    const body = JSON.stringify(entry.row);
    for (const word of blocklist.entries.map(e => e.word)) if (body.includes(word)) errors.push(`${entry.id}: 原创屏蔽 ${word}`);
  }
  return {entries: entries.length, errors, warnings, existingWorldErrors: before.errors};
}
export function validateDraft(draft, entry, world) {
  const errors = [], warnings = [];
  try { assert.deepEqual(draft, draftFor(entry)); } catch (e) { errors.push(e.message); }
  if (world) { const check = checkEntry(world, entry); errors.push(...check.errors); warnings.push(...check.warnings); }
  return {errors, warnings};
}

// ---- L2 上下文：只放审查所需的已发布事实 -----------------------------------------------------------
const brief = n => n && {id: n.id, name: n.name, age: n.age, occupation: n.occupation, location: n.location, faction: n.faction, skills: n.skills, proficiencies: n.proficiencies,
  notes: n.notes, schedule: (n.schedule?.default ?? []).map(s => `${s.start}-${s.end} ${s.location} ${s.activity ?? ''}`)};
const place = l => l && {id: l.id, name: l.name, parent: l.parent, openHours: l.openHours, purpose: l.purpose, description: l.description, rooms: l.rooms};
const itemBrief = i => i && {id: i.id, name: i.name, basePrice: i.basePrice, weight: i.weight, origin: i.origin, use: i.use, nutrition: i.nutrition};
export function contextFor(world, entry) {
  const c = ctx(world), base = {source: entry.source, boundary: entry.boundary};
  const r = entry.row;
  switch (entry.kind) {
    case 'person': return {...base, publishedFacts: {faction: {id: r.faction, name: c.factions.get(r.faction)?.name},
      offices: world.factions.flatMap(f => (f.offices ?? []).filter(o => o.holder === r.id)).map(o => ({id: o.id, name: o.name, seat: o.seat, authority: o.authority}))}};
    case 'person-field': return {...base, publishedFacts: {person: brief(c.npcs.get(entry.subject)), faction: (({id, name, kind, leader, coreMembers, publicGoal}) => ({id, name, kind, leader, coreMembers, publicGoal}))(c.factions.get(r.faction)),
      offices: world.factions.flatMap(f => (f.offices ?? []).filter(o => o.holder === entry.subject)).map(o => ({id: o.id, name: o.name, seat: o.seat, authority: o.authority}))}};
    case 'faction': return {...base, publishedFacts: {leader: brief(c.npcs.get(r.leader)), core: (r.coreMembers ?? []).map(id => brief(c.npcs.get(id))), anchor: place(c.locs.get(r.contactAnchor)),
      offices: (world.factions.find(f => f.id === r.id)?.offices ?? []).map(o => ({id: o.id, name: o.name, holder: o.holder, seat: o.seat, authority: o.authority}))}};
    case 'office': {
      const f = c.factions.get(entry.faction);
      return {...base, publishedFacts: {holder: brief(c.npcs.get(r.holder)), seat: place(c.locs.get(r.seat)), faction: f && {id: f.id, name: f.name, publicGoal: f.publicGoal, method: f.method, leader: f.leader},
        otherOfficesOfHolder: world.factions.flatMap(x => (x.offices ?? []).filter(o => o.holder === r.holder && o.id !== r.id)).map(o => ({id: o.id, name: o.name, seat: o.seat}))}};
    }
    case 'room-patch': return {...base, publishedFacts: {place: place(c.locs.get(entry.subject)), before: entry.before, lawCodes: (world.rules.law.codes ?? []).map(k => ({id: k.id, maximumDetentionMinutes: k.maximumDetentionMinutes}))}};
    case 'head-patch': return {...base, publishedFacts: {head: brief(c.npcs.get(r.head)), enforcers: r.enforcers.map(id => brief(c.npcs.get(id))),
      before: entry.before, villageExample: (({head, enforcers, authority}) => ({head, enforcers, authority}))(world.settlementProfiles.find(s => s.id === 'loc_bs_yupo').details.governance)}};
    case 'item': {
      const recipe = world.recipes.find(x => x.output?.item === r.id);
      return {...base, publishedFacts: {recipe: recipe && {id: recipe.id, materials: recipe.materials.map(m => ({...m, price: c.items.get(m.item)?.basePrice})), tools: recipe.tools, minutes: recipe.minutes, teachers: recipe.teachers, output: recipe.output},
        comparable: ['item_smith_tongs', 'item_smith_hammer', 'item_kitchen_knife', 'item_whittling_knife', 'item_herb', 'item_tool_handle'].map(id => itemBrief(c.items.get(id))).filter(Boolean)}};
    }
    case 'recipe': return {...base, publishedFacts: {materials: r.materials.map(m => ({...m, item: itemBrief(c.items.get(m.item))})), tools: r.tools.map(t => itemBrief(c.items.get(t))),
      output: itemBrief(c.items.get(r.output.item)), skill: c.skills.get(r.skill) && {id: r.skill, name: c.skills.get(r.skill).name}, teachers: r.teachers.map(id => brief(c.npcs.get(id)))}};
    case 'item-field': return {...base, publishedFacts: {item: itemBrief(c.items.get(entry.subject)), body: {satiety: {mealGainLow: 30, mealGainHigh: 40, hungry: 30}, hydration: {drinkGain: 25}}}};
    case 'rule-repair': return {...base, publishedFacts: {item: itemBrief(c.items.get(r.item)), tools: r.tools.map(t => itemBrief(c.items.get(t))), materials: r.materials.map(m => itemBrief(c.items.get(m.item))),
      siblingRepairs: world.rules.repairs.filter(x => x.id !== r.id).map(x => ({id: x.id, minutes: x.minutes, restore: x.restore, minimumProficiency: x.minimumProficiency}))}};
    case 'rule-restock': {
      const shop = world.rules.economy.shops.stores.find(s => s.id === r.shop);
      return {...base, publishedFacts: {item: itemBrief(c.items.get(r.item)), shop: {id: shop.id, name: shop.name, keeper: brief(c.npcs.get(shop.keeper)), restock: shop.restock.map(x => x.item)}}};
    }
    case 'rule-bait': return {...base, publishedFacts: {item: itemBrief(c.items.get(r.bait.item)), fishing: world.rules.extraction.fishing}};
    case 'rule-takehome': return {...base, publishedFacts: {item: itemBrief(c.items.get(r.takeHome.item))}};
    default: return base;
  }
}

// ---- 发布（只写已审批的候选）与核对 -------------------------------------------------------------------
function currentRow(files, entry) {
  switch (entry.kind) {
    case 'person': return files.baseline.find(x => x.id === entry.id);
    case 'person-field': { const n = files.baseline.find(x => x.id === entry.subject); return n && n[entry.field] !== undefined ? {[entry.field]: n[entry.field]} : undefined; }
    case 'faction': { const f = files.factions.find(x => x.id === entry.id); if (!f) return undefined; const {offices, ...rest} = f; return rest; }
    case 'office': return files.factions.find(f => f.id === entry.faction)?.offices?.find(o => o.id === entry.id);
    case 'room-patch': { const l = files.locations.find(x => x.id === entry.subject); return l && {rooms: l.rooms}; }
    case 'head-patch': { const g = files.settlements.find(x => x.id === entry.subject)?.details.governance; return g && {head: g.head, enforcers: g.enforcers, authority: g.authority}; }
    case 'item': return files.items.find(x => x.id === entry.id);
    case 'recipe': return files.recipes.find(x => x.id === entry.id);
    case 'item-field': { const i = files.items.find(x => x.id === entry.subject); return i?.nutrition && {nutrition: i.nutrition}; }
    case 'rule-repair': return files.rules.repairs.find(x => x.id === entry.id);
    case 'rule-restock': { const s = files.rules.economy.shops.stores.find(x => x.id === entry.row.shop); const x = s?.restock.find(y => y.item === entry.row.item); return x && {shop: s.id, ...x}; }
    case 'rule-bait': return {bait: files.rules.extraction.fishing.bait};
    case 'rule-takehome': return {takeHome: files.rules.medicine.takeHome};
    default: return undefined;
  }
}
// 审批历史核验：先逐项验证后续正式发布，再把世界与文件还原到本批审批时的版本（先 S505 资源版、再 S4 职位版）。
// 无 files 时只还原职位版（旧测试的口径）。命令行 --l1/--review 与 verifyPublished 共用，避免两处各写一遍而漂移。
export async function priorEditions(world, files = null) {
  if (files) ({world, files} = await previousResourceEdition(world, files));
  return previousOfficeEdition(world, files);
}
export async function verifyPublished(world, files = null) {
  const {entries} = await verifyPublishedDetailed(world, files);
  return {entries};
}
// 已审批整行回执（供下游按“回执里的行”解释差异，如 w3-wave-score）：先走与 verifyPublished 相同的全部核验，通过才返回 id -> 已批整行。
export async function approvedRowReceipts(world, files = null) {
  const {drafts} = await verifyPublishedDetailed(world, files);
  return new Map([...drafts].filter(([, d]) => d.row !== undefined && (d.row.id !== undefined)).map(([id, d]) => [id, structuredClone(d.row)]));
}
async function verifyPublishedDetailed(world, files = null) {
  files ??= await readFiles();
  ({world,files}=await priorEditions(world,files));
  const entries = contentEntries(files), candidate = previewWorld(world);
  const approved = await readApprovedContent(draftRoot, entries, {revision, contextFor: entry => contextFor(candidate, entry)});
  assert.equal(approved.length, entries.length, '仍有未审条目');
  const drafts = new Map(approved.map(d => [d.id, d]));
  for (const entry of entries) {
    assert.deepEqual(drafts.get(entry.id), draftFor(entry), `${entry.id} 已审草稿与条目不符`);
    const row = currentRow(files, entry);
    assert.ok(row !== undefined && same(row, drafts.get(entry.id).row), `${entry.id} 正式文件与已审批的行不同`);
  }
  return {entries: entries.length, drafts};
}
// 部分正式文件用 CRLF：按文件现有换行符定点替换。
const patchText = (text, from, to, label) => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', a = from.replaceAll('\n', eol), b = to.replaceAll('\n', eol);
  assert.equal(text.split(a).length - 1, 1, `${label} 原文不唯一或已变`); return text.replace(a, () => b);
};
export async function publishContent(world) {
  const files = await readFiles(), entries = contentEntries(files), candidate = previewWorld(world);
  const approved = await readApprovedContent(draftRoot, entries, {revision, contextFor: entry => contextFor(candidate, entry)});
  assert.equal(approved.length, entries.length, '本批仍有未审条目');
  const out = {};
  // baseline.json：缩进 2 格，往返逐字相同
  const bfile = await fs.readFile(FILES.baseline, 'utf8'), beol = bfile.includes('\r\n') ? '\r\n' : '\n', braw = bfile.replaceAll('\r\n', '\n');
  assert.equal(JSON.stringify(JSON.parse(braw), null, 2) + '\n', braw, 'baseline.json 不是往返形态');
  const baseline = JSON.parse(braw);
  for (const p of G.newPeople) { const d = approved.find(x => x.id === p.id).row; if (!baseline.some(n => n.id === p.id)) baseline.push(structuredClone(d)); }
  for (const p of G.personFields) { const n = baseline.find(x => x.id === p.subject); const d = approved.find(x => x.id === p.id).row; assert.ok(n.faction === undefined || n.faction === d.faction); n.faction = d.faction; }
  await fs.writeFile(FILES.baseline, (JSON.stringify(baseline, null, 2) + '\n').replaceAll('\n', beol));
  // factions.json：紧凑 JSON，往返逐字相同
  const fraw = await fs.readFile(FILES.factions, 'utf8'); assert.equal(JSON.stringify(JSON.parse(fraw)), fraw, 'factions.json 不是紧凑往返形态');
  const factions = JSON.parse(fraw);
  for (const f of G.newFactions) if (!factions.some(x => x.id === f.id)) factions.push({...structuredClone(approved.find(x => x.id === f.id).row), offices: []});
  for (const {faction, row} of G.newOffices) {
    const f = factions.find(x => x.id === faction); f.offices ??= [];
    const d = approved.find(x => x.id === row.id).row, at = f.offices.findIndex(o => o.id === row.id);
    if (at < 0) f.offices.push(structuredClone(d)); else assert.ok(same(f.offices[at], d));
  }
  await fs.writeFile(FILES.factions, JSON.stringify(factions));
  // locations.json / settlements.json：混合排版，按原文定点替换
  const lraw = await fs.readFile(FILES.locations, 'utf8');
  if (!lraw.includes('"id": "room_bs_watch_lockup"')) {
    const roomDraft = approved.find(x => x.id === G.roomPatch.id).row.rooms.at(-1);
    const old = '"id": "room_bs_watch_front",\n        "name": "公开接洽前厅",\n        "purpose": "值更板、失物登记桌",\n        "access": "营业时接洽；内室和财物另须许可"\n      }\n    ],';
    const add = old.slice(0, -7) + `,\n      ${JSON.stringify(roomDraft, null, 2).replace(/\n/g, '\n      ')}\n    ],`;
    await fs.writeFile(FILES.locations, patchText(lraw, old, add, 'bld_bs_watch.rooms'));
  }
  const sraw = await fs.readFile(FILES.settlements, 'utf8');
  if (!sraw.includes('"head": "npc_bs_townhead"')) {
    const d = approved.find(x => x.id === G.settlementHead.id).row;
    const old = `        "head": null,\n        "enforcers": [],\n        "authority": "本卡登记官署职责和联络人员，未授予名册居民可执行官职；镇长任命、税章和裁决权限待正式接入。"`;
    const add = `        "head": ${JSON.stringify(d.head)},\n        "enforcers": ${JSON.stringify(d.enforcers, null, 2).replace(/\n/g, '\n        ')},\n        "authority": ${JSON.stringify(d.authority)}`;
    await fs.writeFile(FILES.settlements, patchText(sraw, old, add, 'loc_bs.details.governance'));
  }
  out.published = entries.filter(e => ['person', 'person-field', 'faction', 'office', 'room-patch', 'head-patch'].includes(e.kind)).map(e => e.id);
  return out;
}

export async function run(args = process.argv.slice(2)) {
  const current = await loadWorld(), currentFiles = await readFiles();
  const {world, files} = await priorEditions(current, currentFiles), candidate = previewWorld(world);
  const allEntries = contentEntries(files);
  const at = args.indexOf('--id');
  const entries = at < 0 ? allEntries : allEntries.filter(e => e.id === args[at + 1]);
  assert.ok(entries.length, '指定条目不在本批');
  assert.ok(at < 0 || !args.includes('--publish'), '发布必须核对整批');
  const ctxFor = entry => contextFor(candidate, entry);
  if (args.includes('--prepare')) {
    await fs.mkdir(draftRoot, {recursive: true});
    await fs.writeFile(path.join(draftRoot, 'foundation.json'), JSON.stringify({revision, entries,
      publication: '未审不发布；foundation 不被 loadWorld 加载，也不是通过证据。'}, null, 2) + '\n');
  }
  if (args.includes('--l1')) {
    const result = await checkFoundation(world, entries);
    console.log(JSON.stringify(result.errors.length ? result : {entries: result.entries, L1: 'passed', warnings: result.warnings, existingWorldErrors: result.existingWorldErrors}, null, 1));
    if (result.errors.length) process.exitCode = 1;
  }
  if (args.includes('--review')) {
    const l1 = await checkFoundation(world, entries);
    assert.deepEqual(l1.errors, [], 'L1 未通过');
    await fs.mkdir(draftRoot, {recursive: true});
    const budgetFile = path.join(draftRoot, 'budget.json');
    try { await fs.access(budgetFile); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(budgetFile, JSON.stringify({spentYuan: 0, reservedYuan: 0, waveLimitYuan: 1,
        note: 'fix3-world：基层司法职位/猎户会候选与此前手加目录条目的补审；总上限 1 元。'}, null, 2) + '\n');
    }
    const {summary} = await runContentPipeline({entries, root: draftRoot, budgetRoot: draftRoot, revision, contextFor: ctxFor,
      validateDraft: (d, e) => validateDraft(d, e, candidate), reviewDraftFor: draftFor, reuseFrozenDrafts: true,
      client: new DeepSeekClient({budgetYuan: 1, logFile: path.join(draftRoot, 'usage.jsonl')}),
      cardId: 'A3FW', allocation: {cardId: 'A3FW', incrementLimitYuan: 1, waveLimitYuan: 25, maxRequests: 88,
        startingSpent: 0, startingSpentYuan: 0, startingReservedYuan: 0},
      concurrency: 1, batchSize: 20, retryManual: args.includes('--retry-manual'),
      buildDraftRequest: () => { throw Error('本批使用固定定稿'); },
      buildReviewRequest: (entry, draft, context) => {
        const request = defaultReviewRequest(entry, draft, context);
        request.max_tokens = 1100;
        request.messages[0].content += ' 本批审的是新增职位/组织/人物字段，以及此前已写入世界文件的目录条目。逐项核对 row 与 source、boundary、publishedFacts 是否相符：' +
          '持有人的年龄、职业、作息与住处是否支持该职位，职权与限制是否与来源一致，数值是否有来源或与同类物相邻。' +
          '只有 row 与它们实际相反、或给出没有依据的新数值/新设施/新成员身份时才标 hard；boundary 已声明“无独立依据、沿估价”的数值标 soft，不标 hard。人物外貌性格等塑造不要求另有来源。';
        return request;
      },
    });
    console.log(JSON.stringify({passed: summary.passed, manual: summary.manual, pending: summary.pending, budget: summary.budget.cards.A3FW}));
  }
  if (args.includes('--publish')) console.log(JSON.stringify(await publishContent(current)));
  if (args.includes('--verify')) console.log(JSON.stringify(await verifyPublished(await loadWorld(), await readFiles())));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run();
