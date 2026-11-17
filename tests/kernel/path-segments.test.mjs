// pathTypes 字面段文法零误报核查（李白 11-17 pathTypes 段文法裁定及其修正（选 A），卷二 §2.7）：
// 下列段取自卷一、卷二、卷三乙、卷四、卷九、卷十四、卷二十五、卷二十七、卷二十九登记或引用的 state 路径与 stateKeys 顶层键，逐个字面量断言合法。
// 各卷逐条记为 [卷, 段, 出处]；同一段在多卷出现则各记一次（按卷覆盖），共 ENTRY_COUNT 条、去重后 UNIQUE_COUNT 段。
// 卷二十九只在卷内登记了 displayNames、lang、docContent 三段（卷二十九:496、:565），不足五段，如实只列这三段，不凑数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPathPattern, PATH_SEGMENT_RE, PATH_SEGMENT_RESERVED } from '../../server-plugin/kernel/handles/keys.mjs';

const ENTRIES = [
  // 卷一（卷一:139、:154、:238、:447）
  ['卷一', 'statuses', '139'], ['卷一', 'modifiers', '139'], ['卷一', 'displayNames', '139、238'], ['卷一', 'created', '139'],
  ['卷一', 'props', '154'], ['卷一', 'text', '238'], ['卷一', 'playerNotes', '238、447'], ['卷一', 'narration', '238'], ['卷一', 'npcs', '447'],
  // 卷二十七
  ...['simProgress', 'through', 'simDegrade', 'level', 'atChunk', 'aggregates', 'kind', 'unit', 'key', 'members', 'nextOrdinal', 'aggNo', 'nextAggNo']
    .map((s) => ['卷二十七', s, '191 一带']),
  // 卷四
  ...['created', 'props', 'identities', 'seq', 'presenting', 'statuses', 'revivals', 'lastMinute', 'points', 'conceptions', 'life', 'lastBirthMinute',
    'renewables', 'since', 'sinceRem', 'displayNames', 'playerNotes', 'text'].map((s) => ['卷四', s, '145—1858 一带']),
  ['卷四', 'renewSinceRem', '1825'],
  // 卷二
  ...['pendingPost', 'ledgerTotals', 'accounts', 'npcs', 'coins', 'modifiers', 'records'].map((s) => ['卷二', s, '216—746 一带']),
  ['卷二', 'outflowTotals', '723'], ['卷二', 'publicKnowing', '727'], ['卷二', 'lawBindings', '731'], ['卷二', 'cultivationSplit', '736'],
  ['卷二', 'lifestyleXp', '746'], ['卷二', 'examSessions', '746'], ['卷二', 'pendingDose', '746'],
  // 卷九 state.* 顶层键与子段
  ...['activities', 'agendas', 'dialogues', 'lastCommit', 'marks', 'pendingInvites', 'proposals', 'decisionCommit', 'workDone', 'workTotal', 'round']
    .map((s) => ['卷九', s, 'state.* 登记']),
  // 卷三乙、卷十四、卷二十五各一处
  ['卷三乙', 'itemInstances', '436'], ['卷十四', 'examSessions', '255'], ['卷十四', 'lifestyleXp', '274'], ['卷二十五', 'doneKg', '164'],
  // 卷二十九
  ['卷二十九', 'displayNames', '496'], ['卷二十九', 'lang', '496'], ['卷二十九', 'docContent', '565'],
];
const ENTRY_COUNT = 73;
const UNIQUE_COUNT = 62;

test('各卷现有 state 路径字面段全部合文法、非保留字（零误报）', () => {
  assert.equal(ENTRIES.length, ENTRY_COUNT);
  assert.equal(new Set(ENTRIES.map((e) => e[1])).size, UNIQUE_COUNT);
  for (const [vol, s] of ENTRIES) {
    assert.equal(PATH_SEGMENT_RE.test(s), true, `${vol}:${s}`);
    assert.equal(PATH_SEGMENT_RESERVED.has(s), false, `${vol}:${s}`);
    checkPathPattern(`${s}.*`);
  }
  for (const p of ['displayNames.*.text', 'playerNotes.*.text', 'pendingPost.*', 'renewables.*.*.sinceRem', 'aggregates.*.members', 'created.*.props.*', 'revivals.*.lastMinute']) checkPathPattern(p);
});

test('覆盖的卷：一、二、三乙、四、九、十四、二十五、二十七、二十九', () => {
  assert.deepEqual([...new Set(ENTRIES.map((e) => e[0]))], ['卷一', '卷二十七', '卷四', '卷二', '卷九', '卷三乙', '卷十四', '卷二十五', '卷二十九']);
});

test('保留字表恰为 constructor、prototype', () => {
  assert.deepEqual([...PATH_SEGMENT_RESERVED].sort(), ['constructor', 'prototype']);
});
