import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from '../../tools/load-world.mjs';
import {validateWorld} from '../../tools/validate-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, defaultReviewRequest, readApprovedContent} from '../../tools/content-pipeline.mjs';
import {revision, draftRoot, contentEntries, bindings, pending, laterStages} from './a3-owner2-w.mjs';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function writeCatalog(file, value) {
  const original = await fs.readFile(file, 'utf8');
  const before = JSON.parse(original);
  if (Array.isArray(value) && before.length <= value.length &&
      before.every((row, i) => JSON.stringify(row) === JSON.stringify(value[i]))) {
    if (before.length === value.length) return;
    // 目录存在“旧批紧凑、后加条目缩进”的混合布局，只追加本批。
    const close = original.lastIndexOf(']');
    const added = JSON.stringify(value.slice(before.length), null, 2).slice(1, -1);
    await fs.writeFile(file, original.slice(0, close).trimEnd() + (before.length ? ',' : '') + added + ']' + original.slice(close + 1));
    return;
  }
  // 沿用正式目录的紧凑/缩进形状，不重排已发布档案。
  await fs.writeFile(file, JSON.stringify(value, null, original.trimEnd().includes('\n') ? 2 : undefined) + '\n');
}
export const draftFor = entry => ({id: entry.id, row: structuredClone(entry.row)});
export const contextFor = entry => ({source: entry.source, boundary: entry.boundary,
  ...(entry.reference ? {catalogParameterReference: entry.reference} : {}),
  rules: ['只新增本批明确人物/目录物，既有人物不改年龄职业。',
    '本题历史、同意、监护持有、账户、身体状态需经对应原生接口加载，不由人物文字产生。',
    '现金和库存的零初始值不代表历史财产；学徒角色不自动有教学或医疗资格。',
    '目录数值沿参考物，不能把目录重量当资源账户的斤/株/条换算。']});

// 与既有固定草稿波次相同：L1 锁定定稿，语义事实仍交现有 L2/L4。
export function validateDraft(draft, entry) {
  try { assert.deepEqual(draft, draftFor(entry)); return {errors: [], warnings: []}; }
  catch (error) { return {errors: [error.message], warnings: []}; }
}

export function previewWorld(world, entries = contentEntries(world)) {
  const candidate = structuredClone(world);
  for (const entry of entries) {
    if (entry.kind === 'location-owner') {
      const location = candidate.locations.find(row => row.id === entry.subject);
      assert.ok(location, entry.subject);
      const owner = Object.hasOwn(location, 'owner') ? location.owner : null;
      assert.ok(owner === entry.before || owner === entry.row.owner, '旧磨坊原所有权已变，须重新核对');
      location.owner = entry.row.owner;
    } else {
      const list = candidate[entry.kind === 'person' ? 'npcs' : 'items'];
      const existing = list.find(row => row.id === entry.row.id);
      if (existing) assert.deepEqual(existing, entry.row, '同 ID 已有不同条目，不能覆盖');
      else list.push(structuredClone(entry.row));
    }
  }
  return candidate;
}

export async function checkFoundation(world, entries = contentEntries(world)) {
  const candidate = previewWorld(world, entries);
  const before = validateWorld(world), after = validateWorld(candidate);
  assert.deepEqual(after.errors.filter(error => !before.errors.includes(error)), [], '本批不得引入世界校验错误');
  const blocklist = await read('world/i18n/blocklist.zh.json');
  for (const entry of entries) {
    assert.deepEqual(validateDraft(draftFor(entry), entry).errors, []);
    const body = JSON.stringify(entry.row);
    for (const word of blocklist.entries.map(e => e.word)) assert.ok(!body.includes(word), `原创屏蔽：${entry.id}`);
  }
  return {entries: entries.length, people: entries.filter(e => e.kind === 'person').length,
    items: entries.filter(e => e.kind === 'item').length, existingWorldErrors: before.errors};
}

// 仅发布当前卡允许的 people/meta/geo 文件。W3/W4 的未审草案不在 entries 中。
export async function publishContent(world = null) {
  world ??= await loadWorld();
  const entries = contentEntries(world);
  const approved = await readApprovedContent(draftRoot, entries, {revision, contextFor});
  assert.equal(approved.length, entries.length, '本批仍有未审条目');
  await checkFoundation(world, entries);
  const baseline = await read('world/people/baseline.json');
  const items = await read('world/meta/items.json');
  const locations = await read('world/geo/locations.json');
  const drafts = new Map(approved.map(d => [d.id, d]));
  for (const entry of entries) {
    assert.deepEqual(validateDraft(drafts.get(entry.id), entry).errors, []);
    if (entry.kind === 'location-owner') {
      const location = locations.find(row => row.id === entry.subject);
      const owner = Object.hasOwn(location, 'owner') ? location.owner : null;
      assert.ok(owner === entry.before || owner === entry.row.owner, '原所有权已变');
      location.owner = entry.row.owner;
    } else {
      const list = entry.kind === 'person' ? baseline : items;
      const existing = list.find(row => row.id === entry.row.id);
      if (existing) assert.deepEqual(existing, entry.row, '不得覆盖既有人物或目录物');
      else list.push(structuredClone(drafts.get(entry.id).row));
    }
  }
  await writeCatalog('world/people/baseline.json', baseline);
  await writeCatalog('world/meta/items.json', items);
  await writeCatalog('world/geo/locations.json', locations);
  return {published: entries.map(e => e.id), pending: pending.map(e => e.row)};
}

export async function run(args = process.argv.slice(2)) {
  const world = await loadWorld(), allEntries = contentEntries(world);
  const at = args.indexOf('--id');
  const entries = at < 0 ? allEntries : allEntries.filter(entry => entry.id === args[at + 1]);
  assert.ok(entries.length, '指定条目不在本批');
  assert.ok(at < 0 || !args.includes('--publish'), '发布必须核对整批');
  if (args.includes('--prepare')) {
    await fs.mkdir(draftRoot, {recursive: true});
    await write(path.join(draftRoot, 'foundation.json'), {revision, entries, bindings, pending, laterStages,
      publication: '未审不发布；foundation 不被 loadWorld 加载，也不是通过证据。'});
  }
  if (args.includes('--l1')) console.log(JSON.stringify(await checkFoundation(world, entries)));
  if (args.includes('--review')) {
    await checkFoundation(world, entries);
    await fs.mkdir(draftRoot, {recursive: true});
    const budgetFile = path.join(draftRoot, 'budget.json');
    try { await fs.access(budgetFile); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await write(budgetFile, {spentYuan: 0, reservedYuan: 0, waveLimitYuan: 1,
        note: 'A3 第二轮 W 新波次；不是旧 W1 重开，不转移或清除任何旧账。运行前须由主会话分配真实模型槽。'});
    }
    const {summary} = await runContentPipeline({entries, root: draftRoot, budgetRoot: draftRoot,
      revision, contextFor, validateDraft, reviewDraftFor: draftFor, reuseFrozenDrafts: true,
      client: new DeepSeekClient({budgetYuan: 1, logFile: path.join(draftRoot, 'usage.jsonl')}),
      cardId: 'A3W', allocation: {cardId: 'A3W', incrementLimitYuan: 1, waveLimitYuan: 25,
        maxRequests: allEntries.length * 2, startingSpentYuan: 0, startingReservedYuan: 0},
      concurrency: 1, batchSize: 20, retryManual: args.includes('--retry-manual'),
      buildDraftRequest: () => { throw Error('本批使用固定定稿'); },
      buildReviewRequest: (entry, draft, context) => {
        const request = defaultReviewRequest(entry, draft, context);
        request.max_tokens = 1100;
        request.messages[0].content += ' 本批是获授权新增角色与目录物，不要求旧世界已记载新人物。逐项审核 row；来源和边界是约束。不要要求虚构出生日期、户籍、同意、财产或服务。新目录价格/重量沿参考物是本批设计值，不是题面报价或资源换算。';
        return request;
      },
    });
    console.log(JSON.stringify({passed: summary.passed, manual: summary.manual, pending: summary.pending,
      budget: summary.budget.cards.A3W}));
  }
  if (args.includes('--publish')) console.log(JSON.stringify(await publishContent(world)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await run();
