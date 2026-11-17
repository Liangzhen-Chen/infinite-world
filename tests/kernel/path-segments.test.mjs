// pathTypes 字面段文法零误报核查（李白 11-17 pathTypes 段文法裁定及其修正，卷二 §2.7）：
// 下列段取自卷一、卷二、卷四、卷九、卷二十七、卷二十九登记的 state 路径与 stateKeys 顶层键，逐个字面量断言合法。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPathPattern, PATH_SEGMENT_RE, PATH_SEGMENT_RESERVED } from '../../server-plugin/kernel/handles/keys.mjs';

const SEGMENTS = [
  // 卷二十七
  'simProgress', 'through', 'simDegrade', 'level', 'atChunk', 'aggregates', 'kind', 'unit', 'key', 'members', 'nextOrdinal', 'aggNo', 'nextAggNo',
  // 卷四
  'created', 'props', 'identities', 'seq', 'presenting', 'statuses', 'revivals', 'lastMinute', 'points', 'conceptions', 'life', 'lastBirthMinute',
  'renewables', 'since', 'sinceRem', 'displayNames', 'playerNotes', 'text',
  // 卷二
  'pendingPost', 'ledgerTotals', 'outflowTotals', 'accounts', 'npcs', 'coins', 'modifiers', 'records',
  // 卷九 state.* 顶层键与子段
  'activities', 'agendas', 'dialogues', 'lastCommit', 'marks', 'pendingInvites', 'proposals', 'decisionCommit', 'workDone', 'workTotal', 'round',
];

test('五卷现有 state 路径字面段全部合文法、非保留字（零误报）', () => {
  assert.equal(SEGMENTS.length, 50);
  for (const s of SEGMENTS) {
    assert.equal(PATH_SEGMENT_RE.test(s), true, s);
    assert.equal(PATH_SEGMENT_RESERVED.has(s), false, s);
    checkPathPattern(`${s}.*`);
  }
  for (const p of ['displayNames.*.text', 'playerNotes.*.text', 'pendingPost.*', 'renewables.*.*.sinceRem', 'aggregates.*.members', 'created.*.props.*', 'revivals.*.lastMinute']) checkPathPattern(p);
});

test('保留字表恰为 constructor、prototype', () => {
  assert.deepEqual([...PATH_SEGMENT_RESERVED].sort(), ['constructor', 'prototype']);
});
