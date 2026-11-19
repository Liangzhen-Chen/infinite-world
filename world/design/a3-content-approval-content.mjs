import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from '../../tools/load-world.mjs';
import {validateWorld} from '../../tools/validate-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, defaultReviewRequest, readApprovedContent, hashContent} from '../../tools/content-pipeline.mjs';
import {revision, draftRoot, corrections, patches, isNewPerson, sourceOf, boundaryOf} from './a3-content-approval.mjs';
import {previousOfficeEdition} from './s4-offices-approval.mjs';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const FILES = {baseline: 'world/people/baseline.json', locations: 'world/geo/locations.json', routes: 'world/geo/routes.json', factions: 'world/lore/factions.json'};
export const readFiles = async () => Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([k, f]) => [k, await read(f)])));

const dateOffices = files => files.factions.flatMap(f => (f.offices ?? []).map(office => ({faction: f.id, office})));
// 条目行 = 正式文件当前值叠加 corrections；before 记录纠正前的值，发布时据此核对。
export function contentEntries(files) {
  const entries = [];
  for (const row of files.baseline.filter(n => isNewPerson(n.id)))
    entries.push({id: row.id, kind: 'person', row, source: sourceOf('person', row), boundary: boundaryOf('person')});
  for (const row of files.factions.filter(f => f.id === 'faction_huancheng_government'))
    entries.push({id: row.id, kind: 'faction', row, source: sourceOf('faction', row), boundary: boundaryOf('faction')});
  for (const row of files.locations.filter(l => l.id.startsWith('bld_hc_')))
    entries.push({id: row.id, kind: 'location', row, source: sourceOf('location', row), boundary: boundaryOf('location')});
  for (const row of files.routes.filter(r => r.id.startsWith('route_hc_')))
    entries.push({id: row.id, kind: 'route', row, source: sourceOf('route', row), boundary: boundaryOf('route')});
  for (const {faction, office} of dateOffices(files).filter(r => r.office.authority?.operations?.includes('certify'))) {
    const fix = corrections[office.id], row = structuredClone(office);
    if (fix) {
      assert.ok(office[fix.field] === fix.before || office[fix.field] === fix.value, `${office.id}.${fix.field} 已被改成未登记的值`);
      row[fix.field] = fix.value;
    }
    entries.push({id: office.id, kind: 'office', faction, row, ...(fix ? {before: fix.before, correction: fix.reason} : {}),
      source: sourceOf('office', row), boundary: boundaryOf('office')});
  }
  for (const p of patches) {
    const location = files.locations.find(l => l.id === p.subject);
    assert.ok(location && location[p.field] !== undefined, `${p.id} 的字段不在正式地点上`);
    entries.push({id: p.id, kind: 'patch', subject: p.subject, field: p.field, row: {[p.field]: location[p.field]}, source: p.source, boundary: boundaryOf('patch')});
  }
  return entries;
}
export const draftFor = entry => ({id: entry.id, row: structuredClone(entry.row)});

// ---- L1 ------------------------------------------------------------------------------------
const rootOf = (locations, id) => { for (let guard = 0; guard < 12; guard++) { const l = locations.get(id); if (!l) return null; if (!l.parent) return l.id; id = l.parent; } return null; };
function context(world) {
  const locations = new Map(world.locations.map(l => [l.id, l])), npcs = new Map(world.npcs.map(n => [n.id, n]));
  const professions = new Map(world.professions.map(p => [p.id, p])), factions = new Map(world.factions.map(f => [f.id, f]));
  return {world, locations, npcs, professions, factions, root: id => rootOf(locations, id)};
}
function scheduleErrors(c, n) {
  const errors = [], slots = n.schedule?.default ?? [];
  let cursor = 0;
  for (const s of slots) {
    if (s.start !== cursor || s.end <= s.start) errors.push(`${n.id} 作息不连续`);
    cursor = s.end;
    if (!c.locations.has(s.location)) errors.push(`${n.id} 作息地点不存在 ${s.location}`);
  }
  if (cursor !== 1440) errors.push(`${n.id} 作息未覆盖全天`);
  return errors;
}
function personErrors(c, entry) {
  const n = entry.row, errors = scheduleErrors(c, n);
  if (!Number.isInteger(n.age) || n.age < 18) errors.push('任职人物须成年');
  if (!c.locations.has(n.location)) errors.push('人物所在地点不存在');
  if (n.services?.length || Object.keys(n.inventory ?? {}).length || n.coins !== 0) errors.push('新增任职人物不预置服务、库存或现金');
  const faction = c.factions.get(n.faction);
  if (!faction) { errors.push('所属组织不存在'); return errors; }
  const offices = c.world.factions.flatMap(f => f.offices ?? []).filter(o => o.holder === n.id);
  const leads = faction.leader === n.id || (faction.coreMembers ?? []).includes(n.id);
  if (!offices.length && !leads) errors.push('人物既无职位也不是所属组织的首领/核心成员');
  for (const office of offices) {
    const role = c.professions.get(office.authority?.profession), skill = role?.entry?.skill;
    if (role && (n.proficiencies?.[skill] ?? 0) < role.entry.minimumProficiency) errors.push(`${office.id} 的考官熟练度低于入职门槛`);
    if (role && !n.skills?.includes(skill)) errors.push(`${office.id} 的考官未登记入职技能 ${skill}`);
    if (c.root(office.seat) !== c.root(n.location)) errors.push(`${office.id} 的席位与考官住处不在同一聚落`);
    for (const slot of n.schedule.default.filter(s => s.services?.includes('teach')))
      if (slot.location !== office.seat) errors.push(`${n.id} 的接待时段不在席位 ${office.seat}`);
  }
  return errors;
}
function officeErrors(c, entry) {
  const o = entry.row, errors = [], holder = c.npcs.get(o.holder), role = c.professions.get(o.authority?.profession);
  if (!holder) errors.push(`职位持有人不存在 ${o.holder}`);
  if (!role) errors.push('职位职业不存在');
  if (!c.locations.has(o.seat)) errors.push(`席位不存在 ${o.seat}`);
  if (!o.authority?.operations?.includes('certify')) errors.push('考官职位须含 certify');
  if (holder && role) {
    const skill = role.entry.skill, have = holder.proficiencies?.[skill] ?? 0;
    if (have < role.entry.minimumProficiency) errors.push(`持有人 ${skill} 熟练度 ${have} 低于入职门槛 ${role.entry.minimumProficiency}`);
    const min = /熟练度至少(\d+)/.exec(o.source ?? '')?.[1], now = /现有熟练度(\d+)/.exec(o.source ?? '')?.[1], named = /(skill_[a-z0-9_]+)/.exec(o.source ?? '')?.[1];
    if (min !== undefined && Number(min) !== role.entry.minimumProficiency) errors.push('来源写的门槛与职业不符');
    if (now !== undefined && Number(now) !== have) errors.push(`来源写的现有熟练度 ${now} 与持有人 ${have} 不符`);
    if (named !== undefined && named !== skill) errors.push('来源写的入职技能与职业不符');
    if (c.root(o.seat) !== c.root(holder.location)) errors.push(`席位 ${o.seat} 与持有人住处 ${holder.location} 不在同一聚落`);
  }
  for (const [from, to] of o.receptionHours ?? []) if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= 1440 && from < to)) errors.push('接待时段无效');
  return errors;
}
function otherErrors(c, entry) {
  const r = entry.row, errors = [];
  if (entry.kind === 'faction') {
    for (const id of [r.leader, ...(r.coreMembers ?? [])]) if (!c.npcs.has(id)) errors.push(`组织成员不存在 ${id}`);
    if (r.resources?.memberCount !== 1 + (r.coreMembers?.length ?? 0)) errors.push('memberCount 与成员数不符');
    for (const o of r.offices ?? []) if (!c.npcs.has(o.holder) || !c.locations.has(o.seat)) errors.push(`职位 ${o.id} 的持有人或席位不存在`);
    for (const id of r.references ?? []) if (!c.world.byId?.has?.(id) && ![c.npcs, c.locations, c.factions].some(m => m.has(id)) && !c.world.cultures.some(x => x.id === id)) errors.push(`引用不存在 ${id}`);
  }
  if (entry.kind === 'location') {
    if (!c.locations.has(r.parent) || !c.factions.has(r.owner)) errors.push('父级地点或所有者不存在');
    if (!c.world.routes.some(x => [x.from, x.to].includes(r.id))) errors.push('地点没有路线');
  }
  if (entry.kind === 'route' && (!c.locations.has(r.from) || !c.locations.has(r.to))) errors.push('路线端点不存在');
  if (entry.kind === 'patch') {
    const v = r[entry.field];
    if (entry.field === 'notices') for (const x of v) if (!c.npcs.has(x.author)) errors.push(`告示作者不存在 ${x.author}`);
    if (entry.field === 'publicConversations') for (const x of v) {
      if (!c.npcs.has(x.speaker) || !c.world.rumors.some(m => m.id === x.rumor)) errors.push(`公开谈话的讲述者或传闻不存在 ${x.id}`);
      if (c.npcs.get(x.speaker)?.location && c.root(c.npcs.get(x.speaker).location) !== c.root(entry.subject)) errors.push('讲述者不在该聚落');
    }
    if (entry.field === 'site' && v.manager !== undefined && !c.npcs.has(v.manager)) errors.push(`管理人不存在 ${v.manager}`);
    if (entry.field === 'site') for (const res of v.resources ?? []) {
      if (!c.world.items.some(i => i.id === res.item)) errors.push(`资源物品不存在 ${res.item}`);
      if (res.gather && !c.world.skills.some(s => s.id === res.gather.skill)) errors.push(`采集技能不存在 ${res.gather.skill}`);
    }
  }
  return errors;
}
export function checkEntry(world, entry) {
  const c = context(world);
  return entry.kind === 'person' ? personErrors(c, entry) : entry.kind === 'office' ? officeErrors(c, entry) : otherErrors(c, entry);
}
export async function checkFoundation(world, entries) {
  const validation = validateWorld(world);
  assert.deepEqual(validation.errors, [], '正式世界必须通过校验');
  const blocklist = await read('world/i18n/blocklist.zh.json'), errors = [];
  for (const entry of entries) {
    errors.push(...checkEntry(world, entry).map(e => `${entry.id}: ${e}`));
    const body = JSON.stringify(entry.row);
    for (const word of blocklist.entries.map(e => e.word)) if (body.includes(word)) errors.push(`${entry.id}: 原创屏蔽 ${word}`);
  }
  return {entries: entries.length, errors};
}
// 与既有固定草稿波次相同：L1 锁定定稿，语义事实交 L2/L4。
export function validateDraft(draft, entry, world) {
  const errors = [];
  try { assert.deepEqual(draft, draftFor(entry)); } catch (error) { errors.push(error.message); }
  if (world) errors.push(...checkEntry(world, entry));
  return {errors, warnings: []};
}

// ---- L2 上下文：只放审查所需的已发布事实 -------------------------------------------------------
const brief = n => n && {id: n.id, name: n.name, age: n.age, occupation: n.occupation, location: n.location, skills: n.skills, proficiencies: n.proficiencies};
const place = l => l && {id: l.id, name: l.name, parent: l.parent, description: l.description};
export function contextFor(world, entry) {
  const c = context(world), base = {source: entry.source, boundary: entry.boundary};
  if (entry.kind === 'office') {
    const role = c.professions.get(entry.row.authority.profession);
    return {...base, ...(entry.correction ? {correction: entry.correction, before: entry.before} : {}),
      publishedFacts: {profession: role && {id: role.id, name: role.name, certification: role.certification, entry: role.entry, fee: role.fee},
        holder: brief(c.npcs.get(entry.row.holder)), seat: place(c.locations.get(entry.row.seat)), faction: {id: entry.faction, name: c.factions.get(entry.faction)?.name}}};
  }
  if (entry.kind === 'person') {
    const offices = world.factions.flatMap(f => (f.offices ?? []).map(o => ({faction: f.id, ...o}))).filter(o => o.holder === entry.row.id);
    return {...base, publishedFacts: {faction: {id: entry.row.faction, name: c.factions.get(entry.row.faction)?.name, leader: c.factions.get(entry.row.faction)?.leader},
      offices: offices.map(o => ({id: o.id, name: o.name, seat: o.seat, receptionHours: o.receptionHours, authority: o.authority})),
      professions: offices.map(o => c.professions.get(o.authority?.profession)).filter(Boolean).map(p => ({id: p.id, name: p.name, entry: p.entry, certification: p.certification}))}};
  }
  if (entry.kind === 'patch') {
    const l = c.locations.get(entry.subject), r = entry.row[entry.field];
    const facts = {place: place(l)};
    if (entry.field === 'notices') facts.authors = r.map(x => brief(c.npcs.get(x.author)));
    if (entry.field === 'publicConversations') {
      facts.speakers = r.map(x => brief(c.npcs.get(x.speaker)));
      facts.rumors = r.map(x => world.rumors.find(m => m.id === x.rumor)).filter(Boolean).map(m => ({id: m.id, text: m.text ?? m.claim ?? m.summary, source: m.source}));
    }
    if (entry.field === 'site') {
      facts.manager = r.manager && brief(c.npcs.get(r.manager));
      facts.items = (r.resources ?? []).map(x => world.items.find(i => i.id === x.item)).filter(Boolean).map(i => ({id: i.id, name: i.name, use: i.use}));
      facts.habitats = (world.rules.ecology?.habitats ?? world.rules.wildlifeAwakening?.habitats ?? []).filter(h => h.location === entry.subject);
      facts.features = (l.features ?? []).map(f => ({id: f.id, name: f.name, owner: f.owner}));
    }
    return {...base, publishedFacts: facts};
  }
  if (entry.kind === 'location') return {...base, publishedFacts: {parent: place(c.locations.get(entry.row.parent)), owner: {id: entry.row.owner, name: c.factions.get(entry.row.owner)?.name}}};
  if (entry.kind === 'route') return {...base, publishedFacts: {from: place(c.locations.get(entry.row.from)), to: place(c.locations.get(entry.row.to))}};
  return {...base, publishedFacts: {leader: brief(c.npcs.get(entry.row.leader)), core: (entry.row.coreMembers ?? []).map(id => brief(c.npcs.get(id)))}};
}

// ---- 发布与核对 ---------------------------------------------------------------------------------
const sameRow = (a, b) => hashContent(a) === hashContent(b);
function currentRow(files, entry) {
  if (entry.kind === 'person') return files.baseline.find(r => r.id === entry.id);
  if (entry.kind === 'faction') return files.factions.find(r => r.id === entry.id);
  if (entry.kind === 'location') return files.locations.find(r => r.id === entry.id);
  if (entry.kind === 'route') return files.routes.find(r => r.id === entry.id);
  if (entry.kind === 'office') return files.factions.find(f => f.id === entry.faction)?.offices.find(o => o.id === entry.id);
  const l = files.locations.find(r => r.id === entry.subject);
  return l && l[entry.field] !== undefined ? {[entry.field]: l[entry.field]} : undefined;
}
// 经审批的行必须与正式文件逐字相同；这是“手改已发布数据”会被抓到的闸门。
export async function verifyPublished(world, files = null) {
  files ??= await readFiles();
  ({world,files}=await previousOfficeEdition(world,files));
  const entries = contentEntries(files);
  const approved = await readApprovedContent(draftRoot, entries, {revision, contextFor: entry => contextFor(world, entry)});
  assert.equal(approved.length, entries.length, '仍有未审条目');
  const drafts = new Map(approved.map(d => [d.id, d]));
  for (const entry of entries) {
    assert.deepEqual(drafts.get(entry.id), draftFor(entry), `${entry.id} 已审草稿与条目不符`);
    assert.ok(sameRow(currentRow(files, entry), drafts.get(entry.id).row), `${entry.id} 正式文件与已审批的行不同`);
  }
  return {entries: entries.length};
}
// 把已审批的纠正项写入正式文件（只有 factions.json 的单字段纠正；该文件是紧凑 JSON，往返逐字相同）。
export async function publishContent(world) {
  const files = await readFiles(), entries = contentEntries(files);
  const approved = await readApprovedContent(draftRoot, entries, {revision, contextFor: entry => contextFor(world, entry)});
  assert.equal(approved.length, entries.length, '本批仍有未审条目');
  const raw = await fs.readFile(FILES.factions, 'utf8'), factions = JSON.parse(raw);
  assert.equal(JSON.stringify(factions), raw, 'factions.json 不是紧凑往返形态，拒绝重排');
  const changed = [];
  for (const entry of entries.filter(e => e.kind === 'office')) {
    const draft = approved.find(d => d.id === entry.id).row, offices = factions.find(f => f.id === entry.faction).offices, at = offices.findIndex(o => o.id === entry.id);
    if (sameRow(offices[at], draft)) continue;
    const fix = corrections[entry.id];
    assert.ok(fix && offices[at][fix.field] === fix.before, `${entry.id} 与已登记的纠正前值不符`);
    offices[at] = structuredClone(draft);changed.push(entry.id);
  }
  if (changed.length) await fs.writeFile(FILES.factions, JSON.stringify(factions));
  return {changed, approved: approved.length};
}

export async function run(args = process.argv.slice(2)) {
  const world = await loadWorld(), files = await readFiles(), allEntries = contentEntries(files);
  const at = args.indexOf('--id');
  const entries = at < 0 ? allEntries : allEntries.filter(entry => entry.id === args[at + 1]);
  assert.ok(entries.length, '指定条目不在本批');
  assert.ok(at < 0 || !args.includes('--publish'), '发布必须核对整批');
  const ctx = entry => contextFor(world, entry);
  if (args.includes('--prepare')) {
    await fs.mkdir(draftRoot, {recursive: true});
    await fs.writeFile(path.join(draftRoot, 'foundation.json'), JSON.stringify({revision, entries, corrections,
      publication: '未审不发布；foundation 不被 loadWorld 加载，也不是通过证据。'}, null, 2) + '\n');
  }
  if (args.includes('--l1')) {
    const result = await checkFoundation(world, entries);
    console.log(JSON.stringify(result.errors.length ? result : {entries: result.entries, L1: 'passed'}, null, 1));
    if (result.errors.length) process.exitCode = 1;
  }
  if (args.includes('--review')) {
    const l1 = await checkFoundation(world, entries);
    assert.deepEqual(l1.errors, [], 'L1 未通过');
    await fs.mkdir(draftRoot, {recursive: true});
    const budgetFile = path.join(draftRoot, 'budget.json');
    try { await fs.access(budgetFile); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(budgetFile, JSON.stringify({spentYuan: 0, reservedYuan: 0, waveLimitYuan: 1,
        note: 'A3 收口修复补审：只补已写入世界文件的条目的 L1/L2/L4 回执；总上限 1 元。'}, null, 2) + '\n');
    }
    const {summary} = await runContentPipeline({entries, root: draftRoot, budgetRoot: draftRoot,
      revision, contextFor: ctx, validateDraft: (d, e) => validateDraft(d, e, world), reviewDraftFor: draftFor, reuseFrozenDrafts: true,
      client: new DeepSeekClient({budgetYuan: 1, logFile: path.join(draftRoot, 'usage.jsonl')}),
      cardId: 'A3FIX', allocation: {cardId: 'A3FIX', incrementLimitYuan: 1, waveLimitYuan: 25,
        maxRequests: allEntries.length * 2, startingSpent: 0, startingSpentYuan: 0, startingReservedYuan: 0},
      concurrency: 1, batchSize: 20, retryManual: args.includes('--retry-manual'),
      buildDraftRequest: () => { throw Error('本批使用固定定稿'); },
      buildReviewRequest: (entry, draft, context) => {
        const request = defaultReviewRequest(entry, draft, context);
        request.max_tokens = 1100;
        request.messages[0].content += ' 本批补审的是获用户授权、已写入世界文件的任职人物、官署、设施、职位与地点字段。逐项核对 row 与 source、boundary、publishedFacts 是否相反；' +
          '只有与它们实际相反、或给出没有依据的新数值/新设施/新成员身份才标 hard。名册人物的外貌性格与日常是塑造，不要求另有来源；不要因“骨架未记载”标 hard。没有矛盾时只输出 {"contradictions":[]}。';
        return request;
      },
    });
    console.log(JSON.stringify({passed: summary.passed, manual: summary.manual, pending: summary.pending, budget: summary.budget.cards.A3FIX}));
  }
  if (args.includes('--publish')) console.log(JSON.stringify(await publishContent(world)));
  if (args.includes('--verify')) console.log(JSON.stringify(await verifyPublished(world, files)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run();
