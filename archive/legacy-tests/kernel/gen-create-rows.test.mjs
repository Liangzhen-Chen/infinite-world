// 建行写回 createRows（kernel/gen/writeback.mjs；卷十 R10-1.2、R10-9.1、R10-9.9、R10-1.7）：新建整行与手写行同一校验——只写本阶段声明过的表、id 不撞、classes 是本表类别行、
// 不写派生列、必填（always 与 byEnum 条件）不缺。每种情况一反一正，期望值按卷十规则手算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { createRows } from '../../server-plugin/kernel/gen/writeback.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const ENV = loadWorld(ROOT).env;
const DIMS = {
  flag: { type: 'boolean', required: 'always' },
  mode: { type: 'string', required: 'never' },
  extra: { type: 'integer', unit: 'count', required: 'byEnum:mode=on' },
  derivedD: { type: 'integer', unit: 'count', derived: 'x', required: 'never' },
  multi: { type: 'integer', unit: 'count', required: 'byEnum:mode=maybe；byClass:class_org_state' }, // "；"并列两个条件，任一成立即必填
};
const ctx = (over = {}, dims = { flag: true }) => ({
  table: 't', stage: 'gstage_x', stageEntry: { writesKinds: ['t'] }, tableIds: new Set(['t_old']), authoredIds: new Set(['t_hand']), classIds: new Set(['class_c', 'class_org_state']),
  dims: DIMS, env: ENV, genesisMinute: 7, created: {}, proposals: [{ table: 't', id: 't_new', dims, by: 'gstage_x', seedKey: 'k' }], ...over,
});
const invalid = (c) => assert.throws(() => createRows(c), (e) => e.code === 'E-GEN-ROW-INVALID');

test('合规的新建行：整值落进来并带 generated 标记 {by, seedKey, at}', () => {
  assert.deepEqual(createRows(ctx()), { t_new: { flag: true, generated: { by: 'gstage_x', seedKey: 'k', at: 7 } } });
});

test('必填 always：缺 flag 即 E-GEN-ROW-INVALID；flag 写了不报', () => {
  invalid(ctx({}, { mode: 'off' }));
  assert.ok(createRows(ctx({}, { flag: false, mode: 'off' })).t_new);
});

test('byEnum 条件必填：mode 取 on 时缺 extra 即报；mode 取 off 缺 extra 不报；mode 取 on 且写了 extra 不报', () => {
  invalid(ctx({}, { flag: true, mode: 'on' }));
  assert.ok(createRows(ctx({}, { flag: true, mode: 'off' })).t_new);
  assert.equal(createRows(ctx({}, { flag: true, mode: 'on', extra: 3 })).t_new.extra, 3);
});

test('"；"并列多条件：byEnum 一臂成立（mode 取 maybe）缺 multi 即报，写了不报；byClass 一臂成立（classes 含 class_org_state）缺 multi 即报，写了不报；两臂都不成立缺 multi 不报', () => {
  invalid(ctx({}, { flag: true, mode: 'maybe' }));
  assert.equal(createRows(ctx({}, { flag: true, mode: 'maybe', multi: 1 })).t_new.multi, 1);
  invalid(ctx({}, { flag: true, classes: ['class_org_state'] }));
  assert.equal(createRows(ctx({}, { flag: true, classes: ['class_org_state'], multi: 2 })).t_new.multi, 2);
  assert.ok(createRows(ctx({}, { flag: true, mode: 'off', classes: ['class_c'] })).t_new);
});

test('阶段没有在 writesKinds 里声明这张表即报；声明了不报', () => {
  invalid(ctx({ stageEntry: { writesKinds: ['other'] } }));
  assert.ok(createRows(ctx({ stageEntry: { writesKinds: ['t', 'other'] } })).t_new);
});

test('id 已在表里、作者输入里、本次已建行里，都报（建行不覆盖，R10-1.7）；新 id 不报', () => {
  const make = (id) => ({ table: 't', id, dims: { flag: true }, by: 'gstage_x', seedKey: 'k' });
  invalid(ctx({ proposals: [make('t_old')] }));
  invalid(ctx({ proposals: [make('t_hand')] }));
  invalid(ctx({ created: { t_made: { flag: true } }, proposals: [make('t_made')] }));
  invalid(ctx({ proposals: [make('t_dup'), make('t_dup')] }));
  assert.ok(createRows(ctx({ proposals: [make('t_fresh')] })).t_fresh);
});

test('classes 须是本表类别行：写了不存在的类别报；写了 class_c 不报', () => {
  invalid(ctx({}, { flag: true, classes: ['class_zz'] }));
  assert.deepEqual(createRows(ctx({}, { flag: true, classes: ['class_c'] })).t_new.classes, ['class_c']);
});

test('派生列不写（R10-9.12）：写 derivedD 报；未登记的维度报', () => {
  invalid(ctx({}, { flag: true, derivedD: 1 }));
  invalid(ctx({}, { flag: true, nope: 1 }));
});

test('值不过维度校验即报（R10-9.1）：flag 写成整数报', () => {
  invalid(ctx({}, { flag: 1 }));
});
